"""
Tool Layer - Cart Tools
Session-based cart management.
"""
from typing import Dict, Any, List
from datetime import datetime
import json
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query, execute_write


async def add_to_cart(session_id: str, med_id: int, qty: int = 1) -> Dict[str, Any]:
    """
    Add a medication to the cart.
    
    Args:
        session_id: User session ID
        med_id: Medication ID
        qty: Quantity to add
    
    Returns:
        Updated cart state
    """
    # Check if item already in cart
    existing = await execute_query(
        "SELECT id, quantity FROM cart WHERE session_id = ? AND medication_id = ?",
        (session_id, med_id)
    )
    
    if existing:
        # Update quantity
        new_qty = existing[0]['quantity'] + qty
        await execute_write(
            "UPDATE cart SET quantity = ?, added_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_qty, existing[0]['id'])
        )
    else:
        # Insert new item
        await execute_write(
            "INSERT INTO cart (session_id, medication_id, quantity) VALUES (?, ?, ?)",
            (session_id, med_id, qty)
        )
    
    return await get_cart(session_id)


async def get_cart(session_id: str) -> Dict[str, Any]:
    """
    Get current cart state for a session.
    
    Args:
        session_id: User session ID
    
    Returns:
        Cart with items and total
    """
    items = await execute_query("""
        SELECT 
            c.id as cart_item_id,
            c.medication_id,
            c.quantity,
            m.brand_name,
            m.generic_name,
            m.dosage,
            m.form,
            m.unit_type,
            m.rx_required
        FROM cart c
        JOIN medications m ON c.medication_id = m.id
        WHERE c.session_id = ?
        ORDER BY c.added_at DESC
    """, (session_id,))
    
    cart_items = [
        {
            "cart_item_id": item['cart_item_id'],
            "medication_id": item['medication_id'],
            "quantity": item['quantity'],
            "brand_name": item['brand_name'],
            "generic_name": item['generic_name'],
            "dosage": item['dosage'],
            "form": item['form'],
            "unit_type": item['unit_type'],
            "rx_required": bool(item['rx_required']),
        }
        for item in items
    ]
    
    return {
        "session_id": session_id,
        "items": cart_items,
        "item_count": len(cart_items),
        "total_quantity": sum(item['quantity'] for item in cart_items),
    }


async def remove_from_cart(session_id: str, cart_item_id: int) -> Dict[str, Any]:
    """
    Remove an item from the cart.
    
    Args:
        session_id: User session ID
        cart_item_id: Cart item ID to remove
    
    Returns:
        Updated cart state
    """
    await execute_write(
        "DELETE FROM cart WHERE session_id = ? AND id = ?",
        (session_id, cart_item_id)
    )
    return await get_cart(session_id)


async def update_cart_quantity(session_id: str, cart_item_id: int, qty: int) -> Dict[str, Any]:
    """
    Update quantity of a cart item.
    
    Args:
        session_id: User session ID
        cart_item_id: Cart item ID
        qty: New quantity
    
    Returns:
        Updated cart state
    """
    if qty <= 0:
        return await remove_from_cart(session_id, cart_item_id)
    
    await execute_write(
        "UPDATE cart SET quantity = ? WHERE session_id = ? AND id = ?",
        (qty, session_id, cart_item_id)
    )
    return await get_cart(session_id)


async def clear_cart(session_id: str) -> Dict[str, Any]:
    """
    Clear all items from cart.
    
    Args:
        session_id: User session ID
    
    Returns:
        Empty cart state
    """
    await execute_write(
        "DELETE FROM cart WHERE session_id = ?",
        (session_id,)
    )
    return await get_cart(session_id)


async def checkout(session_id: str, customer_id: int = None) -> Dict[str, Any]:
    """
    Convert cart to order, trigger warehouse fulfillment, and clear cart.
    
    Agentic Action Sequence:
    1. Validate cart → 2. Create order → 3. Save purchase history → 
    4. Deduct inventory → 5. Trigger fulfillment webhook → 6. Clear cart
    
    Args:
        session_id: User session ID
        customer_id: Optional customer ID for purchase history tracking
    
    Returns:
        Order confirmation with fulfillment status
    """
    cart = await get_cart(session_id)
    
    if not cart['items']:
        return {"error": "Cart is empty"}
    
    # Create order with cart items
    items_json = json.dumps(cart['items'])
    order_id = await execute_write(
        "INSERT INTO orders (session_id, items_json, status) VALUES (?, ?, 'confirmed')",
        (session_id, items_json)
    )
    
    # For each item: save to purchase_history and deduct from inventory
    for item in cart['items']:
        med_id = item['medication_id']
        qty = item['quantity']
        
        # Save to purchase_history (affects refill predictions)
        if customer_id:
            await execute_write(
                """INSERT INTO purchase_history 
                   (customer_id, medication_id, quantity, daily_dose, purchase_date)
                   VALUES (?, ?, ?, 1, CURRENT_DATE)""",
                (customer_id, med_id, qty)
            )
        
        # Deduct from inventory (real-time stock update)
        await execute_write(
            """UPDATE inventory SET stock_quantity = stock_quantity - ?
               WHERE medication_id = ? AND stock_quantity >= ?""",
            (qty, med_id, qty)
        )
    
    # Log customer order event
    try:
        from services.event_service import log_event, EventType, Agent
        await log_event(
            EventType.CUSTOMER_ORDER,
            Agent.SYSTEM,
            f"🛒 Order #{order_id} placed: {cart['item_count']} item(s) for session {session_id[:8]}...",
            {"order_id": order_id, "items": cart['items'], "customer_id": customer_id}
        )
    except Exception as e:
        print(f"Failed to log order event: {e}")
    
    # Trigger warehouse fulfillment (agentic tool use)
    fulfillment_result = await trigger_warehouse_fulfillment(
        order_id=order_id,
        items=cart['items'],
        session_id=session_id,
    )
    
    # Handle Warehouse Failure (Simulation)
    warehouse_status = "fulfilled"
    warehouse_message = ""
    if not fulfillment_result.get("success"):
        warehouse_status = "fulfillment_failed"
        warehouse_message = f" (Warehouse Note: {fulfillment_result.get('message', 'Processing delayed')})"
        # We DO NOT rollback the order in this MVP, we just notify.
        # In a real system, this might trigger a 'manual review' queue.

    # Final Checkout Log
    try:
        await log_event(
            "CHECKOUT_COMPLETED",
            Agent.ORCHESTRATOR,
            f"✅ Checkout complete for Order #{order_id}. Warehouse: {fulfillment_result.get('status', 'unknown')}",
            {"order_id": order_id, "warehouse_result": fulfillment_result}
        )
    except Exception:
        pass
    
    # Clear cart
    await clear_cart(session_id)
    
    return {
        "order_id": order_id,
        "status": "confirmed",
        "warehouse_status": warehouse_status,
        "items": cart['items'],
        "item_count": cart['item_count'],
        "message": f"Order #{order_id} confirmed{warehouse_message}. " + ("Procurement triggered." if fulfillment_result.get("procurement_triggered") else ""),
        "fulfillment": fulfillment_result,
        "inventory_updated": True,
        "purchase_history_saved": customer_id is not None
    }


async def trigger_warehouse_fulfillment(
    order_id: int,
    items: List[Dict[str, Any]],
    session_id: str,
) -> Dict[str, Any]:
    """
    Trigger warehouse fulfillment via internal API call.
    
    This demonstrates the agent's ability to:
    - Execute real-world actions (tool use)
    - Trigger webhook-style events
    - Chain actions autonomously
    """
    import httpx
    
    payload = {
        "order_id": order_id,
        "items": items,
        "session_id": session_id,
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:8000/api/warehouse/fulfill",
                json=payload,
                timeout=5.0,
            )
            return response.json()
    except Exception as e:
        # Fallback for testing/simulated environment (Direct Call)
        print(f"⚠️ Warehouse web call failed ({e}). Falling back to direct call...")
        try:
            from routes.warehouse_routes import fulfill_order
            return await fulfill_order(payload)
        except Exception as direct_e:
            print(f"⚠️ Direct warehouse call also failed: {direct_e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Fulfillment will be processed manually (System Offline)",
            }
