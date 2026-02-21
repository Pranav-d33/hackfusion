"""
Event Routes
API endpoints for activity log/event feed.
"""
from fastapi import APIRouter
from typing import Dict, Any
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from services.event_service import get_recent_events, clear_events

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("")
async def list_events(limit: int = 50, event_type: str = None, agent: str = None, customer_id: int = None) -> Dict[str, Any]:
    """
    Get recent events from the activity log.
    
    Args:
        limit: Number of events to return (max 100)
        event_type: Optional filter by event type
        agent: Optional filter by agent name
    """
    limit = min(limit, 100)
    events = await get_recent_events(limit, event_type, agent)

    if customer_id is not None:
        events = [e for e in events if e.get("metadata", {}).get("customer_id") == customer_id]
    
    return {
        "events": events,
        "count": len(events)
    }


@router.get("/types")
async def list_event_types() -> Dict[str, Any]:
    """Get available event types and agents for filtering."""
    return {
        "event_types": [
            "LOW_STOCK_DETECTED",
            "ORDER_GENERATED",
            "ORDER_SENT",
            "WEBHOOK_SENT",
            "WEBHOOK_RECEIVED",
            "STOCK_RECEIVED",
            "INVENTORY_UPDATED",
            "REFILL_ALERT",
            "REFILL_INITIATED",
            "CUSTOMER_ORDER",
            "SAFETY_CHECK"
        ],
        "agents": [
            "forecast_agent",
            "procurement_agent",
            "safety_agent",
            "refill_agent",
            "orchestrator",
            "webhook_service",
            "system"
        ]
    }


@router.delete("")
async def clear_all_events() -> Dict[str, str]:
    """Clear all events (for demo reset)."""
    await clear_events()
    return {"message": "All events cleared"}
