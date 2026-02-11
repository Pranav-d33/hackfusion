"""
Event Service
Logs all agent actions to the events table for activity tracking.
"""
from typing import Dict, Any, Optional, List
from datetime import datetime
import json
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_write, execute_query


# Event Types
class EventType:
    LOW_STOCK_DETECTED = "LOW_STOCK_DETECTED"
    ORDER_GENERATED = "ORDER_GENERATED"
    ORDER_SENT = "ORDER_SENT"
    WEBHOOK_SENT = "WEBHOOK_SENT"
    WEBHOOK_RECEIVED = "WEBHOOK_RECEIVED"
    STOCK_RECEIVED = "STOCK_RECEIVED"
    INVENTORY_UPDATED = "INVENTORY_UPDATED"
    REFILL_ALERT = "REFILL_ALERT"
    REFILL_INITIATED = "REFILL_INITIATED"
    CUSTOMER_ORDER = "CUSTOMER_ORDER"
    GUARDRAIL_TRIGGER = "GUARDRAIL_TRIGGER"

# Agents
class Agent:
    FORECAST = "forecast_agent"
    PROCUREMENT = "procurement_agent"
    SAFETY = "safety_agent"
    REFILL = "refill_agent"
    ORCHESTRATOR = "orchestrator"
    WEBHOOK = "webhook_service"
    SYSTEM = "system"


async def log_event(
    event_type: str,
    agent: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None
) -> int:
    """
    Log an event to the events table.
    
    Args:
        event_type: Type of event (from EventType class)
        agent: Agent that triggered the event (from Agent class)
        message: Human-readable event message
        metadata: Optional additional data as dict
    
    Returns:
        Event ID
    """
    try:
        event_id = await execute_write(
            """INSERT INTO events (event_type, agent, message, metadata_json)
               VALUES (?, ?, ?, ?)""",
            (
                event_type,
                agent,
                message,
                json.dumps(metadata) if metadata else None
            )
        )
        return event_id
    except Exception as e:
        print(f"Error logging event: {e}")
        return -1


async def get_recent_events(limit: int = 50, event_type: Any = None, agent: Any = None) -> List[Dict[str, Any]]:
    """
    Get recent events from the activity log.
    
    Args:
        limit: Maximum number of events to return
        event_type: Optional filter by event type (str or list[str])
        agent: Optional filter by agent (str or list[str])
    
    Returns:
        List of events ordered by most recent first
    """
    query = "SELECT * FROM events"
    params = []
    conditions = []
    
    if event_type:
        if isinstance(event_type, list):
            placeholders = ','.join(['?'] * len(event_type))
            conditions.append(f"event_type IN ({placeholders})")
            params.extend(event_type)
        else:
            conditions.append("event_type = ?")
            params.append(event_type)
    
    if agent:
        if isinstance(agent, list):
            placeholders = ','.join(['?'] * len(agent))
            conditions.append(f"agent IN ({placeholders})")
            params.extend(agent)
        else:
            conditions.append("agent = ?")
            params.append(agent)
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    
    events = await execute_query(query, tuple(params))
    
    result = []
    for e in events:
        event_dict = dict(e)
        # Parse metadata JSON
        if event_dict.get('metadata_json'):
            try:
                event_dict['metadata'] = json.loads(event_dict['metadata_json'])
            except:
                event_dict['metadata'] = None
        result.append(event_dict)
    
    return result


async def clear_events():
    """Clear all events (for testing)."""
    await execute_write("DELETE FROM events")


# Convenience functions for common events
async def log_low_stock_detected(medication: str, days_until_stockout: int, current_stock: int):
    """Log when forecast agent detects low stock."""
    return await log_event(
        EventType.LOW_STOCK_DETECTED,
        Agent.FORECAST,
        f"Low stock alert: {medication} has {current_stock} units, depletes in {days_until_stockout} days",
        {"medication": medication, "days_until_stockout": days_until_stockout, "current_stock": current_stock}
    )


async def log_order_generated(order_id: str, medication: str, quantity: int, supplier: str):
    """Log when procurement agent generates an order."""
    return await log_event(
        EventType.ORDER_GENERATED,
        Agent.PROCUREMENT,
        f"Order {order_id} generated: {quantity} units of {medication} from {supplier}",
        {"order_id": order_id, "medication": medication, "quantity": quantity, "supplier": supplier}
    )


async def log_webhook_sent(order_id: str, endpoint: str, payload: dict):
    """Log when webhook is sent to supplier."""
    return await log_event(
        EventType.WEBHOOK_SENT,
        Agent.WEBHOOK,
        f"Webhook sent for order {order_id} to {endpoint}",
        {"order_id": order_id, "endpoint": endpoint, "payload": payload}
    )


async def log_webhook_received(order_id: str, response: dict):
    """Log when webhook response is received."""
    return await log_event(
        EventType.WEBHOOK_RECEIVED,
        Agent.WEBHOOK,
        f"Webhook response received for order {order_id}",
        {"order_id": order_id, "response": response}
    )


async def log_stock_received(order_id: str, medication: str, quantity: int, stock_before: int, stock_after: int):
    """Log when stock is received and inventory updated."""
    return await log_event(
        EventType.STOCK_RECEIVED,
        Agent.PROCUREMENT,
        f"Stock received: +{quantity} units {medication} ({stock_before} -> {stock_after})",
        {
            "order_id": order_id,
            "medication": medication,
            "quantity": quantity,
            "stock_before": stock_before,
            "stock_after": stock_after
        }
    )


async def log_refill_alert(customer: str, medication: str, days_until_depletion: int):
    """Log customer refill alert."""
    return await log_event(
        EventType.REFILL_ALERT,
        Agent.REFILL,
        f"Refill alert: {customer}'s {medication} depletes in {days_until_depletion} days",
        {"customer": customer, "medication": medication, "days_until_depletion": days_until_depletion}
    )


async def log_safety_decision(medication: str, decision: str, reason: str, rx_required: bool):
    """Log RX safety decision."""
    return await log_event(
        "RX_SAFETY_DECISION",
        Agent.SAFETY,
        f"RX check: {medication} - {decision} ({reason})",
        {"medication": medication, "decision": decision, "reason": reason, "rx_required": rx_required}
    )


async def log_agent_step(agent: str, step: str, tool: str = None, duration_ms: int = None):
    """Log an agent step with optional tool call."""
    msg = f"Agent step: {step}"
    if tool:
        msg += f" [tool: {tool}]"
    if duration_ms:
        msg += f" ({duration_ms}ms)"
    return await log_event(
        "AGENT_STEP",
        agent,
        msg,
        {"step": step, "tool": tool, "duration_ms": duration_ms}
    )


async def log_guardrail_trigger(agent: str, trigger_type: str, reason: str, metadata: Dict[str, Any]):
    """
    Log a guardrail trigger event.
    
    Args:
        agent: The agent triggering the guardrail
        trigger_type: Type of trigger (e.g., 'medical_advice_block', 'max_quantity_cap')
        reason: Human readable reason
        metadata: Details about the event (raw values, capped values, inputs)
    """
    return await log_event(
        EventType.GUARDRAIL_TRIGGER,
        agent,
        f"🚨 Guardrail[{trigger_type}]: {reason}",
        metadata
    )
