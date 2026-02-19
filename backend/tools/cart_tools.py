"""
Tool Layer - Cart Tools
Session-based cart management.
Queries V2 schema: cart, product_catalog, orders, inventory_items.
"""
from typing import Dict, Any, List
from datetime import datetime
import json
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query, execute_write


async def add_to_cart(session_id: str, med_id: int, qty: int = 1, dose: str = None) -> Dict[str, Any]:
    """
    Add a product to the cart.

    Args:
        session_id: User session ID
        med_id: Product catalog ID
        qty: Quantity to add
        dose: Optional prescribed dose

    Returns:
        Updated cart state
    """
    qty = int(qty) if qty is not None else 1

    # Check if item already in cart
    existing = await execute_query(
        "SELECT id, quantity, dose FROM cart WHERE session_id = ? AND product_catalog_id = ?",
        (session_id, med_id)
    )

    if existing:
        new_qty = existing[0]['quantity'] + qty
        update_query = "UPDATE cart SET quantity = ?, added_at = CURRENT_TIMESTAMP"
        params = [new_qty]

        if dose:
            update_query += ", dose = ?"
            params.append(dose)

        update_query += " WHERE id = ?"
        params.append(existing[0]['id'])

        await execute_write(update_query, tuple(params))
    else:
        await execute_write(
            "INSERT INTO cart (session_id, product_catalog_id, quantity, dose) VALUES (?, ?, ?, ?)",
            (session_id, med_id, qty, dose)
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
            c.product_catalog_id as medication_id,
            c.quantity,
            c.dose,
            pc.product_name as brand_name,
            pc.product_name as generic_name,
            pc.package_size as dosage,
            pc.package_size as form,
            'unit' as unit_type,
            COALESCE(pc.base_price_eur, 0) as price,
            0 as rx_required
        FROM cart c
        JOIN product_catalog pc ON c.product_catalog_id = pc.id
        WHERE c.session_id = ?
        ORDER BY c.added_at DESC
    """, (session_id,))

    cart_items = [
        {
            "cart_item_id": item['cart_item_id'],
            "medication_id": item['medication_id'],
            "quantity": int(item['quantity']),
            "dose": item.get('dose'),
            "brand_name": item['brand_name'],
            "generic_name": item['generic_name'],
            "dosage": item['dosage'] or "",
            "form": item['form'] or "unit",
            "unit_type": item['unit_type'],
            "price": item['price'] or 0,
            "item_total": (item['price'] or 0) * int(item['quantity']),
            "rx_required": bool(item['rx_required']),
        }
        for item in items
    ]

    subtotal = sum(item['item_total'] for item in cart_items)
    tax = subtotal * 0.10
    shipping = 5.0 if subtotal > 0 and subtotal < 50 else 0.0
    total = subtotal + tax + shipping

    return {
        "session_id": session_id,
        "items": cart_items,
        "item_count": len(cart_items),
        "total_quantity": sum(item['quantity'] for item in cart_items),
        "subtotal": round(subtotal, 2),
        "tax": round(tax, 2),
        "shipping": round(shipping, 2),
        "total": round(total, 2),
    }


async def remove_from_cart(session_id: str, cart_item_id: int) -> Dict[str, Any]:
    """Remove an item from the cart."""
    await execute_write(
        "DELETE FROM cart WHERE session_id = ? AND id = ?",
        (session_id, cart_item_id)
    )
    return await get_cart(session_id)


async def update_cart_quantity(session_id: str, cart_item_id: int, qty: int) -> Dict[str, Any]:
    """Update quantity of a cart item."""
    if qty <= 0:
        return await remove_from_cart(session_id, cart_item_id)

    await execute_write(
        "UPDATE cart SET quantity = ? WHERE session_id = ? AND id = ?",
        (qty, session_id, cart_item_id)
    )
    return await get_cart(session_id)


async def clear_cart(session_id: str) -> Dict[str, Any]:
    """Clear all items from cart."""
    await execute_write(
        "DELETE FROM cart WHERE session_id = ?",
        (session_id,)
    )
    return await get_cart(session_id)


async def checkout(session_id: str, customer_id: int = None) -> Dict[str, Any]:
    """
    Convert cart to order, trigger warehouse fulfillment, and clear cart.

    Args:
        session_id: User session ID
        customer_id: Optional customer ID

    Returns:
        Order confirmation with fulfillment status
    """
    cart = await get_cart(session_id)

    if not cart['items']:
        return {"error": "Cart is empty"}

    items_json = json.dumps(cart['items'])
    order_id = await execute_write(
        "INSERT INTO orders (session_id, customer_id, items_json, status) VALUES (?, ?, ?, 'confirmed')",
        (session_id, customer_id, items_json)
    )

    # Deduct from inventory for each item
    for item in cart['items']:
        product_id = item['medication_id']
        qty = item['quantity']

        await execute_write(
            """UPDATE inventory_items SET stock_quantity = stock_quantity - ?,
                   last_updated = CURRENT_TIMESTAMP
               WHERE product_catalog_id = ? AND stock_quantity >= ?""",
            (qty, product_id, qty)
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

    # Trigger warehouse fulfillment
    fulfillment_result = await trigger_warehouse_fulfillment(
        order_id=order_id,
        items=cart['items'],
        session_id=session_id,
    )

    warehouse_status = "fulfilled"
    warehouse_message = ""
    if not fulfillment_result.get("success"):
        warehouse_status = "fulfillment_failed"
        warehouse_message = f" (Warehouse Note: {fulfillment_result.get('message', 'Processing delayed')})"

    try:
        from services.event_service import log_event, Agent
        await log_event(
            "CHECKOUT_COMPLETED",
            Agent.ORCHESTRATOR,
            f"✅ Checkout complete for Order #{order_id}. Warehouse: {fulfillment_result.get('status', 'unknown')}",
            {"order_id": order_id, "warehouse_result": fulfillment_result}
        )
    except Exception:
        pass

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
    """Trigger warehouse fulfillment via internal API call."""
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
