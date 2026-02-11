"""
Observability Routes
API endpoints for traces, execution logs, safety decisions, and feedback.
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
import sys
import json
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
    agent_events = await get_recent_events(
        limit=limit,
        event_type=[
            'AGENT_STEP', 'TOOL_CALL', 'SAFETY_CHECK',
            'ORDER_GENERATED', 'WEBHOOK_SENT', 'WEBHOOK_RECEIVED',
            'STOCK_RECEIVED', 'LOW_STOCK_DETECTED', 'CUSTOMER_ORDER'
        ],
        agent=['orchestrator', 'procurement_agent', 'forecast_agent', 'safety_agent']
    )
    
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
    
    # Get safety-related events using filtering
    safety_events = await get_recent_events(
        limit=limit,
        event_type=['SAFETY_CHECK', 'RX_VALIDATION', 'RX_SAFETY_DECISION']
    )
    
    # Also include any messages containing relevant keywords (requires manual filter as DB doesn't support regex/contains easily on message)
    # But usually type filtering should catch most
    
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
    
    if workflow_type == "procurement":
        workflow_events = await get_recent_events(
            limit=limit,
            event_type=['ORDER_GENERATED', 'WEBHOOK_SENT', 'WEBHOOK_RECEIVED', 'STOCK_RECEIVED'],
            agent=['procurement_agent']
        )
    elif workflow_type == "refill":
        workflow_events = await get_recent_events(
            limit=limit,
            event_type=['REFILL_ALERT', 'REFILL_INITIATED'],
            agent=['refill_agent']
        )
    else:
        # Get generic relevant events if no type specified
        workflow_events = await get_recent_events(limit=limit)
    
    return {
        "traces": workflow_events[:limit],
        "count": len(workflow_events[:limit]),
        "workflow_type": workflow_type,
    }


# ============================================================================
# RAG EVALUATION ENDPOINTS
# ============================================================================
from evaluation.store import get_latest_metrics, load_metrics
from evaluation.ragas_service import evaluator
import asyncio

@router.get("/rag-metrics")
async def get_rag_metrics() -> Dict[str, Any]:
    """
    Get the latest RAG evaluation metrics.
    Returns faithfulness, context_precision, answer_relevancy.
    """
    latest = get_latest_metrics()
    history = load_metrics()
    
    return {
        "latest": latest,
        "history": history[:10], # Last 10 runs for trend analysis
        "count": len(history)
    }

@router.post("/run-eval")
async def run_rag_evaluation(limit: int = 10):
    """
    Trigger an async RAG evaluation run.
    """
    # 1. Fetch recent traces with retrieval context
    # ideally we want to filter for traces that actually HAVE retrieval
    traces = await execute_query(
        """SELECT * FROM traces 
           WHERE metadata LIKE '%retrieved_context%' 
           ORDER BY created_at DESC 
           LIMIT ?""",
        (limit * 2,)
    )
    
    samples = []
    for t in traces:
        t_dict = dict(t)
        meta = json.loads(t_dict.get("metadata", "{}"))
        
        # Only evaluate if we have the necessary components
        if meta.get("retrieved_context") and meta.get("user_input") and meta.get("final_response"):
            samples.append({
                "question": meta["user_input"],
                "answer": meta["final_response"],
                "context": meta["retrieved_context"]
            })
            
    if not samples:
        return {"message": "No suitable traces found for evaluation", "count": 0}
        
    # Limit to requested amount
    samples = samples[:limit]
    
    # 2. Run evaluation in background
    asyncio.create_task(evaluator.run_batch_evaluation(samples))
    
    return {
        "message": f"Started evaluation on {len(samples)} samples",
        "status": "running"
    }

@router.post("/run-eval-test")
async def run_rag_evaluation_test():
    """
    Test endpoint: Run evaluation on synthetic data to verify pipeline works.
    Use this if you don't have enough real traces yet.
    """
    synthetic_samples = [
        {
            "question": "What is the dosage for Panado?",
            "answer": "The typical dosage for Panado (Paracetamol) is 500mg to 1000mg every 4-6 hours.",
            "context": ["Panado contains Paracetamol. Adult dosage is 1-2 tablets (500mg-1000mg) every 4 to 6 hours."]
        },
        {
            "question": "Can I take Amoxicillin for a headache?",
            "answer": "No, Amoxicillin is an antibiotic and should not be used for headaches.",
            "context": ["Amoxicillin is a penicillin antibiotic used to treat bacterial infections.", "Headaches are typically treated with analgesics like Paracetamol or Ibuprofen."]
        }
    ]
    
    asyncio.create_task(evaluator.run_batch_evaluation(synthetic_samples))
    
    return {
        "message": "Started test evaluation on synthetic data",
        "status": "running"
    }

