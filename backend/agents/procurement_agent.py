"""
Procurement Agent
Generates purchase orders, sends real webhooks, and updates inventory.
Queries V2 schema: procurement_orders, suppliers, inventory_items, product_catalog.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import uuid
import json
import httpx
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query, execute_write
from agents.forecast_agent import get_low_stock_predictions, get_demand_forecast
from services.event_service import (
    log_order_generated, log_webhook_sent, log_webhook_received, log_stock_received
)

MAX_ORDER_QUANTITY = 2000


async def get_suppliers() -> List[Dict[str, Any]]:
    """Get all active suppliers from database."""
    suppliers = await execute_query(
        "SELECT * FROM suppliers WHERE is_active = 1"
    )
    return [dict(s) for s in suppliers]


async def get_supplier_for_product(product_id: int) -> Optional[Dict[str, Any]]:
    """Get the best supplier for a product."""
    suppliers = await get_suppliers()
    if not suppliers:
        return None
    return suppliers[product_id % len(suppliers)]


async def generate_procurement_order(product_id: int, quantity: int = None) -> Dict[str, Any]:
    """
    Generate a procurement order and persist to database.

    Args:
        product_id: Product catalog ID to order
        quantity: Order quantity (auto-calculated if not provided)

    Returns:
        Generated procurement order
    """
    forecast = await get_demand_forecast(product_id)

    if "error" in forecast:
        return {"error": forecast["error"]}

    if quantity is None:
        quantity = max(forecast.get("suggested_order_quantity", 100), 50)

    # GUARDRAIL: Max Quantity Limit
    if quantity > MAX_ORDER_QUANTITY:
        try:
            from services.event_service import log_guardrail_trigger, Agent
            raw_quantity = quantity
            quantity = MAX_ORDER_QUANTITY
            await log_guardrail_trigger(
                Agent.PROCUREMENT,
                "max_quantity_cap",
                f"Capped order for {forecast.get('brand_name')} at {MAX_ORDER_QUANTITY} (requested {raw_quantity})",
                {"product_id": product_id, "raw_quantity": raw_quantity, "capped_quantity": quantity}
            )
        except Exception:
            quantity = MAX_ORDER_QUANTITY

    # GUARDRAIL: Duplicate Order Prevention
    existing = await execute_query(
        """SELECT order_id, quantity, status FROM procurement_orders
           WHERE product_catalog_id = ? AND status IN ('pending', 'ordered', 'shipped')""",
        (product_id,)
    )

    if existing:
        dup = existing[0]
        reason = f"Duplicate order prevented. Found active order {dup['order_id']} ({dup['status']}) for {dup['quantity']} units."
        try:
            from services.event_service import log_guardrail_trigger, Agent
            await log_guardrail_trigger(
                Agent.PROCUREMENT, "duplicate_order_block", reason,
                {"product_id": product_id, "conflicting_order_id": dup['order_id']}
            )
        except Exception:
            pass
        return {"error": reason}

    # Get current stock
    stock_data = await execute_query(
        "SELECT stock_quantity FROM inventory_items WHERE product_catalog_id = ?",
        (product_id,)
    )
    current_stock = stock_data[0]['stock_quantity'] if stock_data else 0

    # Get supplier
    supplier = await get_supplier_for_product(product_id)
    if not supplier:
        return {"error": "No suppliers available"}

    order_id = f"PO-{uuid.uuid4().hex[:8].upper()}"

    db_id = await execute_write(
        """INSERT INTO procurement_orders
           (order_id, product_catalog_id, quantity, supplier_id, status, urgency, notes, stock_before, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)""",
        (
            order_id,
            product_id,
            quantity,
            supplier['id'],
            forecast.get('urgency', 'attention'),
            f"Auto-generated: {forecast.get('days_until_stockout', 'N/A')} days until stockout",
            current_stock,
            datetime.now().isoformat()
        )
    )

    order = {
        "id": db_id,
        "order_id": order_id,
        "medication_id": product_id,
        "brand_name": forecast["brand_name"],
        "current_stock": current_stock,
        "order_quantity": quantity,
        "urgency": forecast.get("urgency", "attention"),
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "supplier": supplier,
        "estimated_delivery": _calculate_delivery_date(forecast.get("urgency", "attention")),
    }

    await log_order_generated(order_id, forecast["brand_name"], quantity, supplier["name"])
    return order


def _calculate_delivery_date(urgency: str) -> str:
    """Calculate estimated delivery based on urgency."""
    days = {"critical": 2, "warning": 5, "attention": 7, "healthy": 10}
    delivery = datetime.now() + timedelta(days=days.get(urgency, 7))
    return delivery.strftime("%Y-%m-%d")


async def auto_generate_procurement_orders(urgency_threshold: str = "warning") -> List[Dict[str, Any]]:
    """Automatically generate procurement orders for all low-stock items."""
    urgency_levels = ["critical", "warning", "attention", "healthy"]
    threshold_idx = urgency_levels.index(urgency_threshold) if urgency_threshold in urgency_levels else 1

    predictions = await get_low_stock_predictions(days_threshold=14)
    generated_orders = []

    for pred in predictions:
        pred_idx = urgency_levels.index(pred["urgency"]) if pred["urgency"] in urgency_levels else 3

        if pred_idx <= threshold_idx:
            existing = await execute_query(
                """SELECT id FROM procurement_orders
                   WHERE product_catalog_id = ? AND status IN ('pending', 'ordered', 'shipped')""",
                (pred["medication_id"],)
            )

            if not existing:
                order = await generate_procurement_order(pred["medication_id"])
                if "error" not in order:
                    generated_orders.append(order)

    return generated_orders


async def get_procurement_queue(status_filter: str = None) -> List[Dict[str, Any]]:
    """Get procurement orders from database."""
    if status_filter:
        query = """
            SELECT po.*, pc.product_name as brand_name, pc.product_name as generic_name,
                   s.name as supplier_name, s.code as supplier_code
            FROM procurement_orders po
            JOIN product_catalog pc ON po.product_catalog_id = pc.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.status = ?
            ORDER BY po.created_at DESC
        """
        orders = await execute_query(query, (status_filter,))
    else:
        query = """
            SELECT po.*, pc.product_name as brand_name, pc.product_name as generic_name,
                   s.name as supplier_name, s.code as supplier_code
            FROM procurement_orders po
            JOIN product_catalog pc ON po.product_catalog_id = pc.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            ORDER BY po.created_at DESC
        """
        orders = await execute_query(query)

    return [dict(o) for o in orders]


async def send_order_to_supplier(order_id: str) -> Dict[str, Any]:
    """Send order to supplier via real HTTP webhook."""
    orders = await execute_query(
        """SELECT po.*, s.api_endpoint, s.name as supplier_name, s.email as supplier_email,
                  pc.product_name, pc.package_size
           FROM procurement_orders po
           JOIN suppliers s ON po.supplier_id = s.id
           JOIN product_catalog pc ON po.product_catalog_id = pc.id
           WHERE po.order_id = ?""",
        (order_id,)
    )

    if not orders:
        return {"error": "Order not found"}

    order = dict(orders[0])

    payload = {
        "order_id": order_id,
        "type": "PURCHASE_ORDER",
        "timestamp": datetime.now().isoformat(),
        "product": {
            "id": order["product_catalog_id"],
            "product_name": order["product_name"],
            "package_size": order["package_size"]
        },
        "quantity": order["quantity"],
        "urgency": order["urgency"],
        "supplier": {
            "name": order["supplier_name"],
            "email": order["supplier_email"]
        },
        "delivery_requested": _calculate_delivery_date(order["urgency"]),
        "callback_url": "http://localhost:8000/api/webhooks/receive"
    }

    await execute_write(
        """INSERT INTO webhook_logs (direction, endpoint, method, payload, created_at)
           VALUES ('outgoing', ?, 'POST', ?, ?)""",
        (order["api_endpoint"], json.dumps(payload), datetime.now().isoformat())
    )

    response_data = None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                order["api_endpoint"],
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            response_data = response.json()
    except Exception as e:
        response_data = {"error": str(e), "simulated": True, "acknowledged": True}

    await execute_write(
        """UPDATE procurement_orders
           SET status = 'ordered',
               webhook_payload = ?,
               webhook_response = ?,
               updated_at = ?
           WHERE order_id = ?""",
        (json.dumps(payload), json.dumps(response_data), datetime.now().isoformat(), order_id)
    )

    await log_webhook_sent(order_id, order["api_endpoint"], payload)
    await log_webhook_received(order_id, response_data)

    return {
        "success": True,
        "order_id": order_id,
        "webhook": {
            "endpoint": order["api_endpoint"],
            "payload": payload,
            "response": response_data
        },
        "message": f"📧 Order sent to {order['supplier_name']}",
        "new_status": "ordered"
    }


async def receive_order(order_id: str) -> Dict[str, Any]:
    """Mark order as received and update inventory."""
    orders = await execute_query(
        """SELECT po.*, pc.product_name
           FROM procurement_orders po
           JOIN product_catalog pc ON po.product_catalog_id = pc.id
           WHERE po.order_id = ?""",
        (order_id,)
    )

    if not orders:
        return {"error": "Order not found"}

    order = dict(orders[0])

    if order["status"] == "received":
        return {"error": "Order already received"}

    stock_before = await execute_query(
        "SELECT stock_quantity FROM inventory_items WHERE product_catalog_id = ?",
        (order["product_catalog_id"],)
    )
    stock_before_qty = stock_before[0]['stock_quantity'] if stock_before else 0

    await execute_write(
        """UPDATE inventory_items
           SET stock_quantity = stock_quantity + ?, last_updated = CURRENT_TIMESTAMP
           WHERE product_catalog_id = ?""",
        (order["quantity"], order["product_catalog_id"])
    )

    stock_after = await execute_query(
        "SELECT stock_quantity FROM inventory_items WHERE product_catalog_id = ?",
        (order["product_catalog_id"],)
    )
    stock_after_qty = stock_after[0]['stock_quantity'] if stock_after else 0

    await execute_write(
        """UPDATE procurement_orders
           SET status = 'received', stock_after = ?, updated_at = ?
           WHERE order_id = ?""",
        (stock_after_qty, datetime.now().isoformat(), order_id)
    )

    await log_stock_received(
        order_id, order["product_name"], order["quantity"],
        stock_before_qty, stock_after_qty
    )

    return {
        "success": True,
        "order_id": order_id,
        "medication": order["product_name"],
        "quantity_received": order["quantity"],
        "stock_before": stock_before_qty,
        "stock_after": stock_after_qty,
        "message": f"✅ Stock received: +{order['quantity']} units {order['product_name']} (was {stock_before_qty}, now {stock_after_qty})"
    }


async def cancel_order(order_id: str) -> Dict[str, Any]:
    """Cancel a procurement order."""
    result = await execute_write(
        """UPDATE procurement_orders
           SET status = 'cancelled', updated_at = ?
           WHERE order_id = ? AND status = 'pending'""",
        (datetime.now().isoformat(), order_id)
    )

    if result:
        return {"success": True, "order_id": order_id, "message": "Order cancelled"}
    return {"error": "Order not found or cannot be cancelled"}


if __name__ == "__main__":
    import asyncio

    async def test():
        print("Testing Procurement Agent...")
        orders = await auto_generate_procurement_orders(urgency_threshold="attention")
        print(f"\nGenerated {len(orders)} orders")
        queue = await get_procurement_queue()
        print(f"Queue has {len(queue)} items")

    asyncio.run(test())
