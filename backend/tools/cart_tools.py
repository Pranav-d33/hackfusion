"""
Tool Layer - Cart Tools
Session-based cart management.
Queries V2 schema: cart, product_catalog, orders, inventory_items.
"""
from typing import Dict, Any, List
from datetime import datetime, timedelta
import json
import math
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query, execute_write, Transaction
from config import MAX_ORDER_ITEMS, MAX_ORDER_TOTAL_UNITS, MAX_ORDER_SUBTOTAL_EUR, MAX_ORDER_LINE_QTY
from tools.query_tools import _resolve_rx_required


def _estimate_delivery_date(days: int = 3) -> str:
    """Return an ISO date string representing expected delivery date."""
    return (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")


async def add_to_cart(session_id: str, med_id, qty: int, dose: str = None) -> Dict[str, Any]:
    """Adds an item to the cart, checking inventory and existing quantities."""
    # Ensure med_id is int — PostgreSQL SERIAL/INTEGER columns reject string params via pg8000
    try:
        med_id = int(med_id)
    except (TypeError, ValueError):
        return {
            **(await get_cart(session_id)),
            "warning": f"Invalid product ID: {med_id}",
            "added": False,
        }
    print(f"[DEBUG] add_to_cart called: session_id={session_id}, med_id={med_id}, qty={qty}")
    qty = int(qty) if qty is not None else 1
    if qty <= 0:
        return {
            **(await get_cart(session_id)),
            "warning": "Quantity must be greater than zero.",
            "added": False,
        }
    
    # Check inventory (product_name lives in product_catalog, not inventory_items)
    stock_record = await execute_query(
        """SELECT i.stock_quantity, pc.product_name
           FROM inventory_items i
           JOIN product_catalog pc ON i.product_catalog_id = pc.id
           WHERE i.product_catalog_id = ?""",
        (med_id,)
    )
    
    # Check product exists at all (not just inventory)
    if not stock_record:
        product_check = await execute_query(
            "SELECT product_name, COALESCE(base_price_eur, 0) as price FROM product_catalog WHERE id = ?", (med_id,)
        )
        if not product_check:
            return {
                **(await get_cart(session_id)),
                "warning": f"Product not found (ID: {med_id}). Please search again.",
                "added": False
            }
        # Product exists but no inventory record
        product_name = product_check[0]['product_name']
        unit_price = float(product_check[0].get('price') or 0)
        stock_available = 0
    else:
        stock_available = stock_record[0]['stock_quantity']
        product_name = stock_record[0]['product_name']
        price_row = await execute_query(
            "SELECT COALESCE(base_price_eur, 0) as price FROM product_catalog WHERE id = ?",
            (med_id,)
        )
        unit_price = float((price_row[0].get('price') if price_row else 0) or 0)

    # Check cart for existing quantity
    existing = await execute_query(
        "SELECT id, quantity, dose FROM cart WHERE session_id = ? AND product_catalog_id = ?",
        (session_id, med_id)
    )

    # Enforce max distinct medicines per order
    if not existing:
        current_item_count_row = await execute_query(
            "SELECT COUNT(*) as cnt FROM cart WHERE session_id = ?", (session_id,)
        )
        current_item_count = int((current_item_count_row[0]['cnt'] if current_item_count_row else 0))
        if current_item_count >= MAX_ORDER_ITEMS:
            return {
                **(await get_cart(session_id)),
                "warning": f"Order limit reached: you can have at most {MAX_ORDER_ITEMS} different medicines per order.",
                "added": False,
            }

    current_cart_qty = existing[0]['quantity'] if existing else 0
    remaining_stock = stock_available - current_cart_qty

    cart_snapshot = await get_cart(session_id)
    remaining_total_units = max(0, MAX_ORDER_TOTAL_UNITS - int(cart_snapshot.get("total_quantity", 0)))
    remaining_line_units = max(0, MAX_ORDER_LINE_QTY - int(current_cart_qty))
    current_subtotal = float(cart_snapshot.get("subtotal", 0) or 0)
    if unit_price > 0:
        remaining_subtotal_value = MAX_ORDER_SUBTOTAL_EUR - current_subtotal
        remaining_by_value = max(0, math.floor(remaining_subtotal_value / unit_price))
    else:
        remaining_by_value = qty
    
    if remaining_stock <= 0:
        return {
            **await get_cart(session_id), 
            "warning": f"Sorry, {product_name} is currently out of stock.",
            "added": False
        }
        
    actual_add_qty = min(qty, remaining_stock, remaining_total_units, remaining_line_units, remaining_by_value)
    warning_msg = None

    if actual_add_qty <= 0:
        reasons = []
        if remaining_stock <= 0:
            reasons.append(f"{product_name} is currently out of stock")
        if remaining_total_units <= 0:
            reasons.append(f"cart limit reached ({MAX_ORDER_TOTAL_UNITS} units)")
        if remaining_line_units <= 0:
            reasons.append(f"per-item limit reached ({MAX_ORDER_LINE_QTY} units)")
        if remaining_by_value <= 0:
            reasons.append(f"order subtotal limit reached (€{MAX_ORDER_SUBTOTAL_EUR:.2f})")
        reason_text = "; ".join(reasons) if reasons else "order limits reached"
        return {
            **cart_snapshot,
            "warning": f"Cannot add {product_name}: {reason_text}.",
            "added": False,
        }

    if actual_add_qty < qty:
        warning_msg = (
            f"Added {actual_add_qty} of {qty} for {product_name}. "
            f"Applied stock/order limits (max cart units: {MAX_ORDER_TOTAL_UNITS}, "
            f"max per item: {MAX_ORDER_LINE_QTY}, max subtotal: €{MAX_ORDER_SUBTOTAL_EUR:.2f})."
        )

    if existing:
        new_qty = current_cart_qty + actual_add_qty
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
            (session_id, med_id, actual_add_qty, dose)
        )
    
    print(f"[DEBUG] add_to_cart finished for session_id={session_id}. Item added.")

    cart_data = await get_cart(session_id)
    if warning_msg:
        cart_data["warning"] = warning_msg
    cart_data["added"] = True

    return cart_data


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
            pc.rx_required as rx_required
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
            "rx_required": _resolve_rx_required(item.get('rx_required'), item.get('brand_name')),
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


async def remove_from_cart(session_id: str, cart_item_id) -> Dict[str, Any]:
    """Remove an item from the cart."""
    cart_item_id = int(cart_item_id)
    await execute_write(
        "DELETE FROM cart WHERE session_id = ? AND id = ?",
        (session_id, cart_item_id)
    )
    return await get_cart(session_id)


async def update_cart_quantity(session_id: str, cart_item_id, qty) -> Dict[str, Any]:
    """Update quantity of a cart item."""
    cart_item_id = int(cart_item_id)
    qty = int(qty)
    if qty <= 0:
        return await remove_from_cart(session_id, cart_item_id)

    row = await execute_query(
        """
        SELECT c.id, c.quantity, c.product_catalog_id, COALESCE(pc.base_price_eur, 0) as unit_price,
               COALESCE(i.stock_quantity, 0) as stock_quantity
        FROM cart c
        JOIN product_catalog pc ON c.product_catalog_id = pc.id
        LEFT JOIN inventory_items i ON c.product_catalog_id = i.product_catalog_id
        WHERE c.session_id = ? AND c.id = ?
        """,
        (session_id, cart_item_id),
    )
    if not row:
        return await get_cart(session_id)

    current_qty = int(row[0]["quantity"])
    unit_price = float(row[0].get("unit_price") or 0)
    stock_qty = int(row[0].get("stock_quantity") or 0)
    requested_qty = min(int(qty), stock_qty if stock_qty > 0 else int(qty), MAX_ORDER_LINE_QTY)

    cart_snapshot = await get_cart(session_id)
    new_total_qty = int(cart_snapshot.get("total_quantity", 0)) - current_qty + requested_qty
    if new_total_qty > MAX_ORDER_TOTAL_UNITS:
        allowed_by_total = max(0, MAX_ORDER_TOTAL_UNITS - (int(cart_snapshot.get("total_quantity", 0)) - current_qty))
        requested_qty = min(requested_qty, allowed_by_total)

    if unit_price > 0:
        current_subtotal = float(cart_snapshot.get("subtotal", 0) or 0)
        new_subtotal = current_subtotal - (current_qty * unit_price) + (requested_qty * unit_price)
        if new_subtotal > MAX_ORDER_SUBTOTAL_EUR:
            max_by_subtotal = max(0, math.floor((MAX_ORDER_SUBTOTAL_EUR - (current_subtotal - (current_qty * unit_price))) / unit_price))
            requested_qty = min(requested_qty, max_by_subtotal)

    if requested_qty <= 0:
        updated = await remove_from_cart(session_id, cart_item_id)
        updated["warning"] = "Quantity update exceeded order limits, item removed."
        updated["updated"] = False
        return updated

    await execute_write(
        "UPDATE cart SET quantity = ? WHERE session_id = ? AND id = ?",
        (requested_qty, session_id, cart_item_id)
    )
    updated_cart = await get_cart(session_id)
    updated_cart["updated"] = requested_qty == int(qty)
    if requested_qty != int(qty):
        updated_cart["warning"] = (
            f"Quantity adjusted to {requested_qty} due to stock/order limits "
            f"(max cart units: {MAX_ORDER_TOTAL_UNITS}, max per item: {MAX_ORDER_LINE_QTY}, "
            f"max subtotal: €{MAX_ORDER_SUBTOTAL_EUR:.2f})."
        )
    return updated_cart


async def clear_cart(session_id: str) -> Dict[str, Any]:
    """Clear all items from cart."""
    await execute_write(
        "DELETE FROM cart WHERE session_id = ?",
        (session_id,)
    )
    return await get_cart(session_id)


async def checkout(session_id: str, customer_id: int = None, delivery_address: str = None) -> Dict[str, Any]:
    """
    Process checkout atomically using transactions:
    1. Retrieve cart items
    2. Create order & order items
    3. Update inventory
    4. Save to customer_orders / customer_order_items (for timeline & forecasting)
    5. Update customer profile with delivery address
    6. Clear cart

    ALL operations succeed or ALL rollback - no partial orders.
    """
    print(f"[DEBUG] checkout called: session_id={session_id}, customer_id={customer_id}, address={delivery_address}")
    cart = await get_cart(session_id)
    if not cart['items']:
        print(f"[DEBUG] checkout failed: cart is empty for session_id={session_id}")
        return {"error": "Cart is empty"}

    items_json = json.dumps(cart['items'])
    order_id = None
    customer_order_id = None

    try:
        # ── ATOMIC TRANSACTION: Order + Inventory + Customer History ──
        async with Transaction() as txn:
            # 1. Create order
            order_id = await txn.execute_write(
                "INSERT INTO orders (session_id, customer_id, items_json, status) VALUES (?, ?, ?, 'confirmed')",
                (session_id, customer_id, items_json)
            )

            # 2. Deduct from inventory for each item (within same transaction)
            for item in cart['items']:
                product_id = int(item['medication_id'])
                qty = int(item['quantity'])

                await txn.execute_write(
                    """UPDATE inventory_items SET stock_quantity = stock_quantity - ?,
                           last_updated = CURRENT_TIMESTAMP
                       WHERE product_catalog_id = ? AND stock_quantity >= ?""",
                    (qty, product_id, qty)
                )

            # 3. Save to customer_orders + customer_order_items (feeds forecast, refill, timeline)
            if customer_id is not None:
                purchase_date = datetime.now().strftime("%Y-%m-%d")
                customer_order_id = await txn.execute_write(
                    """INSERT INTO customer_orders
                       (customer_id, purchase_date, total_price_eur, dosage_frequency, prescription_required)
                       VALUES (?, ?, ?, 'as_needed', 0)""",
                    (customer_id, purchase_date, float(cart['total']))
                )
                for item in cart['items']:
                    await txn.execute_write(
                        """INSERT INTO customer_order_items
                           (order_id, product_catalog_id, raw_product_name, quantity, line_total_eur)
                           VALUES (?, ?, ?, ?, ?)""",
                        (
                            customer_order_id,
                            int(item['medication_id']),
                            item.get('brand_name', 'Unknown'),
                            int(item['quantity']),
                            float(item.get('item_total', 0)),
                        )
                    )

            # 4. Clear cart (within transaction)
            await txn.execute_write("DELETE FROM cart WHERE session_id = ?", (session_id,))

        print(f"[DEBUG] Transaction committed: order_id={order_id}, customer_order_id={customer_order_id}")

    except Exception as e:
        print(f"[ERROR] Checkout transaction failed, rolled back: {e}")
        return {"error": f"Checkout failed: {str(e)}"}

    # ── Update customer profile with delivery address (non-critical, outside transaction) ──
    if customer_id and delivery_address:
        try:
            # Parse address components if possible
            addr_parts = [p.strip() for p in delivery_address.split(",")]
            name = addr_parts[0] if len(addr_parts) > 0 else None
            address_line = ", ".join(addr_parts[1:-3]) if len(addr_parts) > 4 else delivery_address
            city = addr_parts[-3] if len(addr_parts) >= 4 else None
            state_val = addr_parts[-2] if len(addr_parts) >= 3 else None
            postal = addr_parts[-1].strip() if len(addr_parts) >= 2 else None

            updates = []
            params = []
            if name:
                updates.append("name = ?")
                params.append(name)
            if address_line:
                updates.append("address = ?")
                params.append(address_line)
            if city:
                updates.append("city = ?")
                params.append(city)
            if state_val:
                updates.append("state = ?")
                params.append(state_val)
            if postal:
                updates.append("postal_code = ?")
                params.append(postal)
            updates.append("updated_at = CURRENT_TIMESTAMP")

            if updates:
                params.append(customer_id)
                await execute_write(
                    f"UPDATE customers SET {', '.join(updates)} WHERE id = ?",
                    tuple(params)
                )
                print(f"[DEBUG] Updated customer #{customer_id} profile with delivery address")
        except Exception as e:
            print(f"Warning: Failed to update customer address: {e}")

    estimated_delivery = _estimate_delivery_date()

    # Log customer order event
    try:
        from services.event_service import log_event, EventType, Agent
        await log_event(
            EventType.CUSTOMER_ORDER,
            Agent.SYSTEM,
            f"🛒 Order #{order_id} placed: {cart['item_count']} item(s) for session {session_id[:8]}...",
            {
                "order_id": order_id,
                "customer_order_id": customer_order_id,
                "items": cart['items'],
                "customer_id": customer_id,
                "delivery_address": delivery_address,
                "estimated_delivery": estimated_delivery,
                "total": cart['total'],
                "payment_method": "COD",
            }
        )
    except Exception as e:
        print(f"Failed to log order event: {e}")

    # Log outgoing webhook entry so it appears in the admin Webhook Traffic panel
    try:
        await execute_write(
            """INSERT INTO webhook_logs (direction, endpoint, method, payload, status_code, created_at)
               VALUES ('outgoing', ?, 'POST', ?, 200, ?)""",
            (
                "/api/warehouse/fulfill",
                json.dumps({
                    "type": "ORDER_CONFIRMED",
                    "order_id": order_id,
                    "customer_id": customer_id,
                    "item_count": cart['item_count'],
                    "items": [
                        {"name": i.get("brand_name"), "qty": i.get("quantity")}
                        for i in cart['items']
                    ],
                    "total_eur": cart['total'],
                    "delivery_address": delivery_address,
                    "estimated_delivery": estimated_delivery,
                    "payment_method": "COD",
                }),
                datetime.now().isoformat()
            )
        )
    except Exception as e:
        print(f"Failed to log outgoing webhook: {e}")

    # Trigger warehouse fulfillment
    fulfillment_result = await trigger_warehouse_fulfillment(
        order_id=order_id,
        items=cart['items'],
        session_id=session_id,
    )

    warehouse_status = "fulfilled"
    warehouse_message = ""
    if fulfillment_result and not fulfillment_result.get("success"):
        warehouse_status = "fulfillment_failed"
        warehouse_message = f" (Warehouse Note: {fulfillment_result.get('message', 'Processing delayed')})"

    try:
        from services.event_service import log_event, Agent
        await log_event(
            "CHECKOUT_COMPLETED",
            Agent.ORCHESTRATOR,
            f"✅ Checkout complete for Order #{order_id}. Warehouse: {fulfillment_result.get('status', 'unknown') if fulfillment_result else 'unknown'}",
            {"order_id": order_id, "warehouse_result": fulfillment_result}
        )
    except Exception:
        pass

    # Note: cart already cleared inside transaction above

    order_data = {
        "order_id": order_id,
        "customer_order_id": customer_order_id,
        "status": "confirmed",
        "warehouse_status": warehouse_status,
        "items": cart['items'],
        "item_count": cart['item_count'],
        "total": cart['total'],
        "subtotal": cart['subtotal'],
        "tax": cart['tax'],
        "shipping": cart['shipping'],
        "delivery_address": delivery_address,
        "estimated_delivery": estimated_delivery,
        "payment_method": "COD",
        "message": f"Order #{order_id} confirmed{warehouse_message}. " + ("Procurement triggered." if fulfillment_result.get("procurement_triggered") else ""),
        "fulfillment": fulfillment_result,
        "inventory_updated": True,
        "purchase_history_saved": customer_order_id is not None,
    }

    import asyncio
    from utils.mail_utils import send_order_confirmation_email
    asyncio.create_task(send_order_confirmation_email(order_data))

    return order_data


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
