"""
Webhook Routes
Receives and logs incoming webhooks for demo purposes.
Shows real HTTP communication in action.
"""
from fastapi import APIRouter, Request
from typing import Dict, Any
from datetime import datetime
import json
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_write, execute_query
from services.event_service import log_event, EventType, Agent

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/receive")
async def receive_webhook(request: Request) -> Dict[str, Any]:
    """
    Receive incoming webhook from suppliers (or simulated).
    
    This endpoint logs all incoming webhooks and returns an acknowledgment.
    In production, this would process supplier responses.
    """
    # Get raw payload
    try:
        payload = await request.json()
    except:
        payload = {"raw": await request.body()}
    
    # Log to database
    await execute_write(
        """INSERT INTO webhook_logs (direction, endpoint, method, payload, status_code, created_at)
           VALUES ('incoming', ?, 'POST', ?, 200, ?)""",
        ("/api/webhooks/receive", json.dumps(payload), datetime.now().isoformat())
    )
    
    # Log event
    await log_event(
        EventType.WEBHOOK_RECEIVED,
        Agent.WEBHOOK,
        f"📥 Webhook received: {payload.get('type', 'UNKNOWN')} for order {payload.get('order_id', 'N/A')}",
        {"payload": payload}
    )
    
    # Build response (simulating supplier acknowledgment)
    response = {
        "status": "acknowledged",
        "timestamp": datetime.now().isoformat(),
        "order_id": payload.get("order_id"),
        "message": "Order received and queued for processing",
        "estimated_dispatch": (datetime.now()).strftime("%Y-%m-%d"),
        "tracking_id": f"TRK-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    }
    
    return response


@router.get("/logs")
async def get_webhook_logs(direction: str = None, limit: int = 50) -> Dict[str, Any]:
    """
    Get webhook logs.
    
    Args:
        direction: Filter by 'incoming' or 'outgoing'
        limit: Number of logs to return
    """
    if direction:
        logs = await execute_query(
            """SELECT * FROM webhook_logs 
               WHERE direction = ?
               ORDER BY created_at DESC LIMIT ?""",
            (direction, limit)
        )
    else:
        logs = await execute_query(
            """SELECT * FROM webhook_logs 
               ORDER BY created_at DESC LIMIT ?""",
            (limit,)
        )
    
    result = []
    for log in logs:
        log_dict = dict(log)
        # Parse JSON fields
        if log_dict.get('payload'):
            try:
                log_dict['payload'] = json.loads(log_dict['payload'])
            except:
                pass
        if log_dict.get('response'):
            try:
                log_dict['response'] = json.loads(log_dict['response'])
            except:
                pass
        result.append(log_dict)
    
    return {
        "logs": result,
        "count": len(result)
    }


@router.delete("/logs")
async def clear_webhook_logs() -> Dict[str, str]:
    """Clear all webhook logs (for demo reset)."""
    await execute_write("DELETE FROM webhook_logs")
    return {"message": "Webhook logs cleared"}
