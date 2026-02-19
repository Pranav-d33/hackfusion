"""
Warehouse Routes
Mock warehouse fulfillment endpoints for agentic tool use demonstration.
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from datetime import datetime
import json
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query, execute_write

# Import Langfuse for tracing
try:
    from observability.langfuse_client import create_trace, TracedOperation, flush, is_enabled
    LANGFUSE_AVAILABLE = True
except ImportError:
    LANGFUSE_AVAILABLE = False

router = APIRouter(prefix="/api/warehouse", tags=["warehouse"])


@router.post("/fulfill")
async def fulfill_order(order_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mock warehouse fulfillment endpoint.
    
    This simulates the agent's ability to trigger real-world actions:
    - Log to console (visible to judges)
    - Trace with Langfuse (observability)
    - Return confirmation
    - Trigger Procurement if stock low
    - Simulate Failures
    """
    order_id = order_data.get("order_id", f"ORD-{int(datetime.now().timestamp())}")
    items = order_data.get("items", [])
    session_id = order_data.get("session_id", "unknown")
    timestamp = datetime.now().isoformat()
    
    # Imports for dual logging & logic
    from services.event_service import log_event, EventType, Agent
    from agents.procurement_agent import auto_generate_procurement_orders
    import random

    # 1. Start Trace & Log Event
    trace = None
    if LANGFUSE_AVAILABLE and is_enabled():
        trace = create_trace(
            name="warehouse_fulfillment",
            session_id=session_id,
            metadata={"order_id": order_id, "item_count": len(items)},
        )

    await log_event(
        "WAREHOUSE_FULFILLMENT_TRIGGERED",
        Agent.SYSTEM,
        f"🏭 Warehouse processing Order #{order_id}",
        {"order_id": order_id, "items_count": len(items)}
    )
    
    # Log to console (visible to judges)
    print("\n" + "=" * 60)
    print("🏭 WAREHOUSE FULFILLMENT TRIGGERED")
    print("=" * 60)
    print(f"  Order ID:    {order_id}")
    print(f"  Items:       {len(items)}")
    
    # 2. Simulate Failure (10% chance)
    if random.random() < 0.10:
        error_msg = "⚠️ Warehouse Error: Automated retrieval system offline"
        print(f"  {error_msg}")
        
        await log_event(
            "FULFILLMENT_FAILED",
            Agent.SYSTEM,
            f"❌ Fulfillment failed for Order #{order_id}: System Offline",
            {"order_id": order_id, "reason": "simulation_failure"}
        )
        
        if trace:
            with TracedOperation(trace, "fulfill_order", "span") as op:
                op.log_input(order_data)
                op.log_output({"status": "failed", "error": error_msg})
            flush()
            
        return {
            "success": False,
            "order_id": order_id,
            "status": "failed",
            "message": error_msg,
            "simulated_failure": True
        }

    # 3. Process Items (Check Low Stock & Trigger Procurement)
    # Note: Inventory decrement is handled in cart_tools.py (Immediate Reservation)
    # We only verify and trigger procurement here.
    
    stock_triggers = 0
    
    for item in items:
        prod_id = item.get("product_catalog_id") or item.get("medication_id")
        brand_name = item.get("brand_name") or item.get("product_name", "Unknown")
        print(f"    - {brand_name} x{item.get('quantity', 1)} (Processed)")

        # Check current stock to see if we need to reorder
        # (We read fresh state from DB)
        stock_data = await execute_query(
            "SELECT stock_quantity FROM inventory_items WHERE product_catalog_id = ?",
            (prod_id,)
        )
        current_stock = stock_data[0]['stock_quantity'] if stock_data else 0
        
        # Simple threshold check (e.g. < 50 units triggers reorder)
        REORDER_THRESHOLD = 50 
        if current_stock < REORDER_THRESHOLD:
            print(f"     📉 Low Stock Detected ({current_stock} units). Triggering Procurement...")
            stock_triggers += 1
            
            await log_event(
                EventType.LOW_STOCK_DETECTED,
                Agent.FORECAST,
                f"📉 Low stock for {brand_name} ({current_stock} left)",
                {"medication": brand_name, "current_stock": current_stock}
            )

    # 4. Trigger Procurement Agent if needed
    procurement_result = None
    if stock_triggers > 0:
        print("  🤖 Triggering Procurement Agent...")
        try:
            # Look for "warning" or "attention" levels
            orders = await auto_generate_procurement_orders(urgency_threshold="healthy") 
            procurement_result = {"triggered": True, "orders_generated": len(orders)}
            
            if orders:
                await log_event(
                    "PROCUREMENT_TRIGGERED",
                    Agent.PROCUREMENT,
                    f"🤖 Auto-generated {len(orders)} procurement orders",
                    {"count": len(orders)}
                )
        except Exception as e:
            print(f"  ⚠️ Procurement Trigger Failed: {e}")
            procurement_result = {"error": str(e)}

    # 5. Success Trace & Response
    if trace:
        with TracedOperation(trace, "fulfill_order", "span") as op:
            op.log_input(order_data)
            op.log_output({
                "status": "fulfilled", 
                "procurement": procurement_result
            })
        flush()

    print("=" * 60 + "\n")
    
    return {
        "success": True,
        "order_id": order_id,
        "status": "fulfilled",
        "timestamp": timestamp,
        "message": f"Order {order_id} fulfilled successfully",
        "procurement_triggered": stock_triggers > 0,
        "procurement_details": procurement_result
    }


@router.post("/webhook")
async def receive_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mock webhook receiver for external integrations.
    Demonstrates the system's ability to receive external triggers.
    """
    event_type = payload.get("event_type", "unknown")
    timestamp = datetime.now().isoformat()
    
    print("\n" + "-" * 40)
    print(f"📥 WEBHOOK RECEIVED: {event_type}")
    print(f"   Payload: {json.dumps(payload, indent=2)[:200]}...")
    print("-" * 40 + "\n")
    
    return {
        "received": True,
        "event_type": event_type,
        "timestamp": timestamp,
    }
