"""
Tool Layer - Trace Tools
Agent trace logging for observability.
"""
from typing import Dict, Any, List
from datetime import datetime
import json

# In-memory trace storage (session-based)
_trace_store: Dict[str, List[Dict[str, Any]]] = {}


def log_trace(session_id: str, step: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Log a trace entry for the agent's execution.
    
    Args:
        session_id: User session ID
        step: Step name (e.g., 'parse', 'plan', 'tool_call', 'response')
        data: Step data
    
    Returns:
        Trace entry
    """
    if session_id not in _trace_store:
        _trace_store[session_id] = []
    
    entry = {
        "timestamp": datetime.now().isoformat(),
        "step": step,
        "data": data,
    }
    
    _trace_store[session_id].append(entry)
    
    # Keep only last 50 entries per session
    if len(_trace_store[session_id]) > 50:
        _trace_store[session_id] = _trace_store[session_id][-50:]
    
    return entry


def get_trace(session_id: str) -> List[Dict[str, Any]]:
    """
    Get all trace entries for a session.
    
    Args:
        session_id: User session ID
    
    Returns:
        List of trace entries
    """
    return _trace_store.get(session_id, [])


def get_latest_trace(session_id: str, count: int = 10) -> List[Dict[str, Any]]:
    """
    Get the latest trace entries for a session.
    
    Args:
        session_id: User session ID
        count: Number of entries to return
    
    Returns:
        List of latest trace entries
    """
    traces = _trace_store.get(session_id, [])
    return traces[-count:] if traces else []


def clear_trace(session_id: str) -> bool:
    """
    Clear all trace entries for a session.
    
    Args:
        session_id: User session ID
    
    Returns:
        Success status
    """
    if session_id in _trace_store:
        del _trace_store[session_id]
    return True


def format_trace_for_display(session_id: str) -> str:
    """
    Format trace as readable JSON for the trace panel.
    
    Args:
        session_id: User session ID
    
    Returns:
        Formatted JSON string
    """
    traces = get_trace(session_id)
    return json.dumps(traces, indent=2, default=str)
