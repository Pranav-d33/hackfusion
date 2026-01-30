"""
Observability Routes
API endpoints for traces, execution logs, safety decisions, and feedback.
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from services.event_service import (
    get_recent_events, log_event, EventType, Agent
)
from observability.langfuse_client import (
    get_client, is_enabled, get_trace_url, LANGFUSE_HOST
)
from db.database import execute_query, execute_write

router = APIRouter(prefix="/api/observability", tags=["observability"])


class FeedbackRequest(BaseModel):
    trace_id: str
    session_id: Optional[str] = None
    rating: str  # "positive" or "negative"
    comment: Optional[str] = None


@router.get("/status")
async def get_observability_status() -> Dict[str, Any]:
    """Get observability system status."""
    return {
        "langfuse_enabled": is_enabled(),
        "langfuse_host": LANGFUSE_HOST if is_enabled() else None,
        "event_logging": True,
    }


@router.get("/traces")
async def get_recent_traces(limit: int = 20) -> Dict[str, Any]:
    """
    Get recent traces with public URLs.
    Pulls from the traces table if available.
    """
    limit = min(limit, 50)
    
    try:
        traces = await execute_query(
            """SELECT * FROM traces 
               ORDER BY created_at DESC 
               LIMIT ?""",
            (limit,)
        )
        
        result = []
        for t in traces:
            trace_dict = dict(t)
            # Add computed public URL
            if trace_dict.get('trace_id'):
                trace_dict['public_url'] = get_trace_url(trace_dict['trace_id'])
            result.append(trace_dict)
        
        return {
            "traces": result,
            "count": len(result),
            "langfuse_enabled": is_enabled(),
        }
    except Exception as e:
        # Table might not exist yet
        return {
            "traces": [],
            "count": 0,
            "langfuse_enabled": is_enabled(),
            "error": str(e)
        }


@router.get("/execution-logs")
async def get_execution_logs(limit: int = 30) -> Dict[str, Any]:
    """
    Get detailed agent execution logs.
    Shows agent steps, tool calls, and timing.
    """
    limit = min(limit, 100)
    
    # Get agent-related events
    events = await get_recent_events(
        limit=limit,
        event_type=None,  # Get all types
        agent=None
    )
    
    # Filter to agent-related events
    agent_events = [
        e for e in events 
        if e.get('event_type') in [
            'AGENT_STEP', 'TOOL_CALL', 'SAFETY_CHECK',
            'ORDER_GENERATED', 'WEBHOOK_SENT', 'WEBHOOK_RECEIVED',
            'STOCK_RECEIVED', 'LOW_STOCK_DETECTED', 'CUSTOMER_ORDER'
        ] or e.get('agent') in ['orchestrator', 'procurement_agent', 'forecast_agent', 'safety_agent']
    ]
    
    return {
        "logs": agent_events,
        "count": len(agent_events),
    }


@router.get("/safety-decisions")
async def get_safety_decisions(limit: int = 20) -> Dict[str, Any]:
    """
    Get RX safety decision audit log.
    Shows all prescription validation decisions.
    """
    limit = min(limit, 50)
    
    # Get safety-related events
    events = await get_recent_events(limit=limit)
    
    # Filter to safety decisions
    safety_events = [
        e for e in events 
        if e.get('event_type') in ['SAFETY_CHECK', 'RX_VALIDATION', 'RX_SAFETY_DECISION']
        or 'rx' in e.get('message', '').lower()
        or 'prescription' in e.get('message', '').lower()
        or 'safety' in e.get('message', '').lower()
    ]
    
    return {
        "decisions": safety_events,
        "count": len(safety_events),
    }


@router.post("/feedback")
async def submit_feedback(request: FeedbackRequest) -> Dict[str, str]:
    """
    Submit feedback on an agent response.
    Used for feedback loops and model improvement.
    """
    try:
        # Log the feedback as an event
        await log_event(
            event_type="USER_FEEDBACK",
            agent=Agent.SYSTEM,
            message=f"Feedback received: {request.rating} for trace {request.trace_id}",
            metadata={
                "trace_id": request.trace_id,
                "session_id": request.session_id,
                "rating": request.rating,
                "comment": request.comment,
            }
        )
        
        # Also try to store in feedback table if it exists
        try:
            await execute_write(
                """INSERT INTO feedback (trace_id, session_id, rating, comment)
                   VALUES (?, ?, ?, ?)""",
                (request.trace_id, request.session_id, request.rating, request.comment)
            )
        except Exception:
            pass  # Table might not exist
        
        # If Langfuse is enabled, try to score the trace
        client = get_client()
        if client and request.trace_id:
            try:
                score_value = 1.0 if request.rating == "positive" else 0.0
                client.score(
                    trace_id=request.trace_id,
                    name="user_feedback",
                    value=score_value,
                    comment=request.comment,
                )
            except Exception:
                pass
        
        return {"message": "Feedback recorded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflow-traces")
async def get_workflow_traces(workflow_type: str = None, limit: int = 20) -> Dict[str, Any]:
    """
    Get traces for specific workflows (procurement, refill).
    """
    limit = min(limit, 50)
    
    events = await get_recent_events(limit=limit * 2)  # Get more to filter
    
    if workflow_type == "procurement":
        workflow_events = [
            e for e in events
            if e.get('event_type') in ['ORDER_GENERATED', 'WEBHOOK_SENT', 'WEBHOOK_RECEIVED', 'STOCK_RECEIVED']
            or e.get('agent') == 'procurement_agent'
        ]
    elif workflow_type == "refill":
        workflow_events = [
            e for e in events
            if e.get('event_type') in ['REFILL_ALERT', 'REFILL_INITIATED']
            or e.get('agent') == 'refill_agent'
        ]
    else:
        workflow_events = events
    
    return {
        "traces": workflow_events[:limit],
        "count": len(workflow_events[:limit]),
        "workflow_type": workflow_type,
    }
