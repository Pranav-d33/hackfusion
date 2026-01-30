"""
Procurement Routes
API endpoints for procurement order management.
All operations persist to database and trigger real webhooks.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from agents.procurement_agent import (
    get_procurement_queue,
    generate_procurement_order,
    auto_generate_procurement_orders,
    send_order_to_supplier,
    receive_order,
    cancel_order,
    get_suppliers
)
from db.database import execute_write

router = APIRouter(prefix="/api/procurement", tags=["procurement"])


class GenerateOrderRequest(BaseModel):
    medication_id: int
    quantity: Optional[int] = None


@router.get("/queue")
async def get_queue(status: str = None):
    """
    Get current procurement queue from database.
    Optionally filter by status (pending, ordered, shipped, received, cancelled).
    """
    try:
        queue = await get_procurement_queue(status_filter=status)
        return {
            "count": len(queue),
            "orders": queue
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suppliers")
async def list_suppliers():
    """Get all active suppliers."""
    try:
        suppliers = await get_suppliers()
        return {
            "count": len(suppliers),
            "suppliers": suppliers
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_orders(urgency: str = "warning"):
    """
    Auto-generate procurement orders for low-stock items.
    Orders are persisted to database and logged to event feed.
    
    Urgency threshold: critical, warning, attention
    """
    valid_urgencies = ["critical", "warning", "attention"]
    if urgency not in valid_urgencies:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid urgency. Must be one of: {valid_urgencies}"
        )
    
    try:
        orders = await auto_generate_procurement_orders(urgency_threshold=urgency)
        return {
            "message": f"Generated {len(orders)} procurement orders",
            "orders": orders
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/order")
async def create_order(request: GenerateOrderRequest):
    """
    Generate a procurement order for a specific medication.
    Order is persisted to database.
    """
    try:
        order = await generate_procurement_order(
            medication_id=request.medication_id,
            quantity=request.quantity
        )
        if "error" in order:
            raise HTTPException(status_code=404, detail=order["error"])
        return order
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/send")
async def send_to_supplier(order_id: str):
    """
    Send procurement order to supplier via real HTTP webhook.
    
    This makes an actual HTTP POST to the supplier's endpoint,
    logs the webhook payload/response, and updates order status to 'ordered'.
    """
    try:
        result = await send_order_to_supplier(order_id)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/receive")
async def mark_received(order_id: str):
    """
    Mark order as received and UPDATE INVENTORY.
    
    This actually modifies the inventory table, adding the received
    quantity to current stock. Returns before/after stock levels.
    """
    try:
        result = await receive_order(order_id)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/cancel")
async def cancel_procurement_order(order_id: str):
    """Cancel a pending procurement order."""
    try:
        result = await cancel_order(order_id)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/queue")
async def clear_queue():
    """
    Clear all procurement orders (for demo reset).
    """
    await execute_write("DELETE FROM procurement_orders")
    return {"message": "Procurement queue cleared"}
