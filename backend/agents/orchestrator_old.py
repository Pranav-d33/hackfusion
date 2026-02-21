"""
Agent Orchestrator
Main ADK-style Plan → Act → Observe loop.
"""
from typing import Dict, Any, Optional
import time
import uuid
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from nlu.nlu_service import parse_input
from planner.planner_service import plan_next_action
from agents.safety_agent import check_input_safety, validate_add_to_cart
from tools.query_tools import (
    lookup_by_indication, vector_search, get_inventory, 
    get_rx_flag, get_medication_details, get_tier1_alternatives
)
from tools.cart_tools import add_to_cart, get_cart, checkout, clear_cart
from tools.trace_tools import log_trace, get_trace

# Langfuse observability
from observability.langfuse_client import (
    init_langfuse, create_trace, get_trace_url, TracedOperation, flush, is_enabled
)

# In-memory conversation state (session-based)
_conversation_states: Dict[str, Dict[str, Any]] = {}

# ============================================================================
# FAST PATHS - Skip planner for simple, deterministic intents
# ============================================================================
SIMPLE_INTENTS = {
    "confirm_rx",    # "yes", "I have prescription"
    "deny_rx",       # "no", "I don't have"
    "checkout",      # "checkout", "done", "place order"
    "cancel",        # "cancel", "stop", "never mind"
}

def rule_first_plan(nlu_result: Dict[str, Any], state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Rule-first planner: Handle deterministic cases without LLM.
    Returns None if LLM planner is needed.
    
    Uses Mediloon Pharmacist personality for all responses.
    """
    intent = nlu_result.get("intent", "unclear")
    value = nlu_result.get("value")
    confidence = nlu_result.get("confidence", 0)
    
    # Only use fast path for high-confidence simple intents
    if confidence < 0.7:
        return None
    
    # FAST PATH: Prescription confirmation
    if intent == "confirm_rx" and state.get("pending_rx_check"):
        med = state["pending_rx_check"]
        # Proceed to quantity collection instead of direct add
        return {
            "action": "ask_quantity",
            "medication": med,
            "message": f"Excellent! I've verified your prescription confirmation. How many strips or units of {med.get('brand_name', 'this medication')} would you like me to prepare?",
            "tts_message": f"Great! Prescription confirmed. How many units would you like?",
            "reasoning": "[FAST PATH] RX confirmed, moving to quantity collection",
            "fast_path": True,
        }
    
    # FAST PATH: Quantity Response
    if intent == "quantity_response" and state.get("pending_qty_dose_check"):
        med = state["pending_qty_dose_check"]
        
        # Prioritize structured extraction from nlu_result
        extracted_qty = nlu_result.get("quantity", {}).get("count")
        if extracted_qty is not None:
            qty = int(extracted_qty)
        else:
            try:
                qty = int(value) if value else 1
            except (ValueError, TypeError):
                qty = 1
        
        return {
            "action": "ask_dose",
            "medication": med,
            "quantity": qty,
            "message": f"Got it, {qty} unit(s). And what dosage has been prescribed for you? You can say 'as prescribed' if you'd like me to note that.",
            "tts_message": f"{qty} units. What is the prescribed dose?",
            "reasoning": "[FAST PATH] Quantity received, moving to dose collection",
            "fast_path": True,
        }

    # FAST PATH: Dose Response
    if intent == "dose_response" and state.get("pending_qty_dose_check"):
        med = state["pending_qty_dose_check"]
        dose = value or "As Prescribed"
        qty = state.get("collected_quantity", 1)
        return {
            "action": "tool_call",
            "tool": "add_to_cart",
            "tool_args": {"med_id": med["id"], "qty": qty, "dose": dose},
            "message": f"Perfect. I'm adding {med['brand_name']} ({qty} units, Dose: {dose}) to your dispensing list. Would you like anything else?",
            "tts_message": f"Added {med['brand_name']} to your cart. Anything else?",
            "reasoning": "[FAST PATH] Dose received, adding to cart",
            "fast_path": True,
        }

    # FAST PATH: Just add it (Skip/Default)
    if intent == "just_add_it" and state.get("pending_qty_dose_check"):
        med = state["pending_qty_dose_check"]
        qty = state.get("collected_quantity", 1)
        dose = state.get("collected_dose", "As Prescribed")
        return {
            "action": "tool_call",
            "tool": "add_to_cart",
            "tool_args": {"med_id": med["id"], "qty": qty, "dose": dose},
            "message": f"Understood. I've added {med['brand_name']} with standard settings to your list. Would you like anything else?",
            "tts_message": f"Added {med['brand_name']} to your cart. Need anything else?",
            "reasoning": "[FAST PATH] User skipped collection, using defaults",
            "fast_path": True,
        }
    
    # FAST PATH: Prescription denial - DETERMINISTIC SAFETY BLOCK  
    if intent == "deny_rx" and state.get("pending_rx_check"):
        med = state["pending_rx_check"]
        return {
            "action": "respond",
            "message": f"I completely understand. As your pharmacist, I'm required to ensure all prescription medications are dispensed safely. Unfortunately, I cannot add {med.get('brand_name', 'this medication')} without a valid prescription. Would you like me to check for any over-the-counter alternatives that might help?",
            "tts_message": "No problem. I can't dispense prescription medications without documentation. Would you like me to suggest some OTC alternatives?",
            "reasoning": "[FAST PATH] RX denied, blocked by rule",
            "fast_path": True,
        }
    
    # FAST PATH: User says "yes" / "add it" after being shown a single OTC result
    # The system asked "Would you like me to add it?" and user confirmed
    if intent in ("confirm_rx", "just_add_it") and state.get("pending_add_confirm"):
        med = state["pending_add_confirm"]
        return {
            "action": "ask_quantity",
            "medication": med,
            "message": f"Great! How many units of {med.get('brand_name', 'this medication')} would you like?",
            "tts_message": f"How many units of {med.get('brand_name', 'this medication')}?",
            "reasoning": "[FAST PATH] User confirmed OTC add, collecting quantity",
            "fast_path": True,
        }

    # FAST PATH: Checkout
    if intent == "checkout":
        return {
            "action": "checkout",
            "message": "Perfect! I'm preparing your order now. Please review your cart summary and I'll guide you through the final steps.",
            "tts_message": "Preparing your order now. Let me guide you through checkout.",
            "reasoning": "[FAST PATH] Checkout requested",
            "fast_path": True,
        }
    
    # FAST PATH: Cancel
    if intent == "cancel":
        return {
            "action": "end",
            "message": "No problem at all. I've cleared your current session. Feel free to reach out whenever you need help with your medications. Take care!",
            "tts_message": "Session cleared. Feel free to come back anytime. Take care!",
            "reasoning": "[FAST PATH] Cancel requested",
            "fast_path": True,
        }
    
    # FAST PATH: Add to cart when candidates are available
    if intent == "add_to_cart" and state.get("candidates"):
        candidates = state["candidates"]
        selection = value or "1"
        
        # Try numeric index first ("add the first one", "2")
        med = None
        try:
            idx = int(selection) - 1
            if 0 <= idx < len(candidates):
                med = candidates[idx]
        except (ValueError, TypeError):
            # Not a number — try matching by name ("add paracetamol")
            if value:
                val_lower = value.lower()
                for c in candidates:
                    if (val_lower in c.get("brand_name", "").lower() or
                        val_lower in c.get("generic_name", "").lower()):
                        med = c
                        break
                # If still no match, default to first candidate
                if not med:
                    med = candidates[0]
        
        if med:
            # Extract details if already in input
            qty = nlu_result.get("quantity", {}).get("count")
            dose = nlu_result.get("dosage", {}).get("raw")
            
            # DETERMINISTIC RX CHECK - no LLM needed
            if med.get("rx_required"):
                return {
                    "action": "ask_rx",
                    "medication": med,
                    "quantity": qty,
                    "dose": dose,
                    "message": f"Great choice! {med['brand_name']} ({med.get('generic_name', '')}) is an excellent option. Since this is a prescription medication, I need to verify - do you have a valid prescription from your healthcare provider?",
                    "tts_message": f"{med['brand_name']} requires a prescription. Do you have one ready?",
                    "reasoning": "[FAST PATH] RX required, asking for confirmation",
                    "fast_path": True,
                }
            else:
                # OTC — check for embedded quantity from compound input
                embedded_qty = nlu_result.get("_embedded_quantity")
                if embedded_qty:
                    qty = embedded_qty
                
                # If both qty and dose provided upfront, add directly
                if qty and dose:
                     return {
                        "action": "tool_call",
                        "tool": "add_to_cart",
                        "tool_args": {"med_id": med["id"], "qty": int(qty), "dose": dose},
                        "message": f"Perfect! I'm adding {med['brand_name']} ({qty} units) to your cart. Would you like anything else?",
                        "tts_message": f"Adding {med['brand_name']} to your cart.",
                        "reasoning": "[FAST PATH] OTC with details provided, adding directly",
                        "fast_path": True,
                    }
                
                # If quantity provided but no dose, skip to dose collection
                if qty:
                    return {
                        "action": "ask_dose",
                        "medication": med,
                        "quantity": int(qty),
                        "message": f"Great! {int(qty)} unit(s) of {med['brand_name']}. And what dosage has been prescribed? You can say 'as prescribed' if you'd like.",
                        "tts_message": f"{int(qty)} units. What is the prescribed dose?",
                        "reasoning": "[FAST PATH] OTC med with quantity, skipping to dose collection",
                        "fast_path": True,
                    }
                
                return {
                    "action": "ask_quantity",
                    "medication": med,
                    "quantity": qty,
                    "dose": dose,
                    "message": f"Great! I can certainly help you with {med['brand_name']}. This is an over-the-counter medication. How many units would you like me to add?",
                    "tts_message": f"How many {med['brand_name']} would you like?",
                    "reasoning": "[FAST PATH] OTC med selected, starting details collection",
                    "fast_path": True,
                }

    # FAST PATH: add_to_cart intent with a medicine NAME but NO candidates in state
    # e.g. user says "Add Paracetamol" as the very first message
    if intent == "add_to_cart" and value and not state.get("candidates"):
        return {
            "action": "tool_call",
            "tool": "vector_search",
            "tool_args": {"name": value},
            "reasoning": f"[FAST PATH] add_to_cart with name '{value}' but no candidates — searching first",
            "fast_path": True,
        }
    
    # FAST PATH: Indication query - direct tool call
    if intent == "indication_query" and value:
        return {
            "action": "tool_call",
            "tool": "lookup_by_indication",
            "tool_args": {"indication": value},
            "reasoning": f"[FAST PATH] Looking up medications for {value}",
            "fast_path": True,
        }
    
    # FAST PATH: Brand/medication query - direct tool call
    if intent in ("brand_query", "medication_query") and value:
        return {
            "action": "tool_call",
            "tool": "vector_search",
            "tool_args": {"name": value},
            "reasoning": f"[FAST PATH] Searching for medication: {value}",
            "fast_path": True,
        }
    
    # No fast path available - need LLM planner
    return None


# ============================================================================
# POST-NLU CONTEXT RESOLVER - Fix misclassified intents using state
# ============================================================================
def _resolve_intent_with_context(nlu_result: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post-NLU resolution: Use conversation state to fix misclassified intents.
    
    Common fix: NLU says brand_query for "go with crocin" but candidates exist,
    so it should be add_to_cart (selecting from candidates, not re-searching).
    """
    intent = nlu_result.get("intent", "unclear")
    value = nlu_result.get("value")
    candidates = state.get("candidates", [])
    pending_qty = state.get("pending_qty_dose_check")
    pending_add = state.get("pending_add_confirm")
    
    # RULE 1: brand_query / medication_query + matching candidate → add_to_cart
    if intent in ("brand_query", "medication_query") and value and candidates:
        val_lower = value.lower()
        for c in candidates:
            cname = c.get("brand_name", "").lower()
            gname = c.get("generic_name", "").lower()
            if (val_lower in cname or cname in val_lower or
                val_lower in gname or gname in val_lower):
                nlu_result = nlu_result.copy()
                nlu_result["intent"] = "add_to_cart"
                nlu_result["value"] = c.get("brand_name", value)
                nlu_result["_context_resolved"] = True
                nlu_result["confidence"] = max(nlu_result.get("confidence", 0), 0.85)
                return nlu_result
    
    # RULE 2: indication_query but user also mentioned a medicine name matching candidate
    # e.g. "crocin, 20 units" might be parsed as indication or brand but has qty embedded
    if intent == "add_to_cart" and value and candidates:
        # Carry forward quantity if present in the NLU result
        qty = nlu_result.get("quantity", {})
        if qty and qty.get("count"):
            # Store the extracted quantity so rule_first_plan can use it
            nlu_result = nlu_result.copy()
            nlu_result["_embedded_quantity"] = int(qty["count"])
    
    # RULE 3: Bare number when waiting for quantity
    if intent in ("unclear", "brand_query") and value and (pending_qty or pending_add):
        import re
        if re.match(r'^\d+$', str(value).strip()):
            nlu_result = nlu_result.copy()
            nlu_result["intent"] = "quantity_response"
            nlu_result["confidence"] = 0.9
            nlu_result["_context_resolved"] = True
            return nlu_result
    
    return nlu_result


# ============================================================================
# STATIC OUTPUT VALIDATOR - Cheap, no LLM
# ============================================================================
FORBIDDEN_OUTPUT_PATTERNS = [
    "take this medication",
    "i recommend",
    "you should take",
    "dosage is",
    "mg per day",
    "antibiotic",
]

def validate_output_static(message: str) -> Dict[str, Any]:
    """
    Static output validation - no LLM, ~5ms.
    Checks for forbidden patterns in agent output.
    """
    if not message:
        return {"safe": True}
    
    message_lower = message.lower()
    for pattern in FORBIDDEN_OUTPUT_PATTERNS:
        if pattern in message_lower:
            return {
                "safe": False,
                "reason": f"forbidden_pattern:{pattern}",
                "message": "I'm happy to help you order your medications, but for dosage guidance or medical advice, please consult with your doctor or healthcare provider. They know your medical history best! Is there anything else I can help you with regarding your order?",
            }
    
    return {"safe": True}

# Initialize Langfuse on module load
_langfuse_initialized = init_langfuse()


def get_session_state(session_id: str) -> Dict[str, Any]:
    """Get or create session state."""
    if session_id not in _conversation_states:
        _conversation_states[session_id] = {
            "candidates": [],
            "selected_medication": None,
            "pending_rx_check": None,
            "pending_qty_dose_check": None,
            "pending_add_confirm": None,
            "collected_quantity": None,
            "collected_dose": None,
            "cart": {"items": [], "item_count": 0},
            "last_action": None,
            "turn_count": 0,
            "conversation_history": [],  # Store last N turns for context
        }
    return _conversation_states[session_id]


def update_session_state(session_id: str, updates: Dict[str, Any]):
    """Update session state."""
    state = get_session_state(session_id)
    state.update(updates)
    _conversation_states[session_id] = state


async def process_message(
    session_id: str,
    user_input: str,
) -> Dict[str, Any]:
    """
    Process a user message through the agent pipeline.
    
    Args:
        session_id: User session ID
        user_input: Raw user input (text or STT output)
    
    Returns:
        Agent response with message, state, trace_id and trace_url
    """
    start_time = time.time()
    
    # Generate session if not provided
    if not session_id:
        session_id = str(uuid.uuid4())
    
    state = get_session_state(session_id)
    state["turn_count"] += 1
    
    # Pre-fetch user intelligence on first turn
    if state["turn_count"] == 1:
        from services.user_intelligence_service import get_user_refill_patterns
        # Use customer_id from state or default to 2 (Rajesh Kumar)
        customer_id = state.get("customer_id", 2)
        try:
            insights = await get_user_refill_patterns(customer_id)
            if insights:
                state["user_insights"] = insights
                log_trace(session_id, "user_insights", insights)
        except Exception as e:
            print(f"Error fetching user insights: {e}")

    # Create Langfuse trace for this conversation turn
    trace = create_trace(
        name="agent_turn",
        session_id=session_id,
        metadata={"user_input": user_input, "turn": state["turn_count"]},
    )
    trace_id = trace.id if trace else None
    trace_url = get_trace_url(trace_id) if trace_id else None
    
    # Step 1: Safety check on input
    with TracedOperation(trace, "safety_check", "span") as op:
        safety_check = await check_input_safety(user_input)
        op.log_input({"user_input": user_input})
        op.log_output(safety_check)
    log_trace(session_id, "safety_check", {
        "source": "Orchestrator",
        "target": "SafetyAgent",
        "action": "validate_input",
        "input": user_input,
        "result": safety_check
    })
    
    if not safety_check.get("safe", True):
        flush()
        return {
            "session_id": session_id,
            "message": safety_check["message"],
            "tts_message": safety_check["message"],
            "blocked": True,
            "reason": safety_check.get("reason"),
            "trace": get_trace(session_id),
            "trace_id": trace_id,
            "trace_url": trace_url,
            "latency_ms": int((time.time() - start_time) * 1000),
        }
    
    # Step 2: Parse input with NLU
    with TracedOperation(trace, "nlu_parse", "generation") as op:
        op.log_input({"user_input": user_input})
        nlu_result = await parse_input(user_input, conversation_state=state)
        op.log_output(nlu_result)
    log_trace(session_id, "nlu_parse", {
        "source": "Orchestrator",
        "target": "NLU",
        "action": "parse_intent",
        "input": user_input,
        "result": nlu_result
    })
    
    # ---- POST-NLU CONTEXT RESOLUTION ----
    # If NLU says brand_query but the value matches an existing candidate, remap to add_to_cart
    nlu_result = _resolve_intent_with_context(nlu_result, state)
    
    # Add user message to conversation history
    conversation_history = state.get("conversation_history", [])
    conversation_history.append({"role": "user", "content": user_input})
    
    # Keep only last 10 turns (20 messages) to prevent token overflow
    if len(conversation_history) > 20:
        conversation_history = conversation_history[-20:]
    
    state["conversation_history"] = conversation_history
    
    # Step 3: Plan next action - TRY FAST PATH FIRST
    plan = rule_first_plan(nlu_result, state)
    
    if plan:
        # Fast path succeeded - no LLM call needed
        log_trace(session_id, "plan", {
            "source": "Orchestrator",
            "target": "RuleFirstPlanner",
            "action": "fast_path",
            "input": nlu_result,
            "result": plan
        })
    else:
        # Fall back to LLM planner for complex/unclear cases
        with TracedOperation(trace, "planner", "generation") as op:
            op.log_input({"nlu_result": nlu_result, "state": state})
            plan = await plan_next_action(nlu_result, state)
            op.log_output(plan)
        log_trace(session_id, "plan", {
            "source": "Orchestrator",
            "target": "LLMPlanner",
            "action": "generate_plan",
            "input": nlu_result,
            "result": plan
        })
    
    # Step 4: Execute action
    with TracedOperation(trace, "execute_action", "span") as op:
        op.log_input({"plan": plan})
        result = await execute_action(session_id, plan, state)
        op.log_output(result)
    log_trace(session_id, "execute", {
        "source": "Orchestrator",
        "target": "ToolExecutor",
        "action": "execute_plan",
        "plan": plan,
        "result": result
    })
    
    # Add assistant response to conversation history
    assistant_message = result.get("message", "")
    if assistant_message:
        state["conversation_history"].append({"role": "assistant", "content": assistant_message})
    
    # Flush traces
    flush()
    
    # Step 5: Output Guardrail - Static validation (no LLM, ~5ms)
    final_message = result.get("message", "")
    output_safety = validate_output_static(final_message)
    if not output_safety.get("safe", True):
        # Override with safety block
        result["message"] = output_safety["message"]
        result["tts_message"] = "I cannot provide that information for safety reasons."
        log_trace(session_id, "output_guardrail_block", {
             "original_message": final_message,
             "block_reason": output_safety.get("reason"),
             "replacement": output_safety["message"]
        })
    
    # Step 5: Prepare response
    latency_ms = int((time.time() - start_time) * 1000)
    
    response = {
        "session_id": session_id,
        "message": result.get("message", ""),
        "tts_message": result.get("tts_message", result.get("message", "")),
        "candidates": result.get("candidates", []),
        "cart": result.get("cart", await get_cart(session_id)),
        "action_taken": result.get("action_taken"),
        "needs_input": result.get("needs_input", True),
        "end_conversation": result.get("end_conversation", False),
        "trace": get_trace(session_id),
        "trace_id": trace_id,
        "trace_url": trace_url,
        "latency_ms": latency_ms,
    }
    
    return response



async def execute_action(
    session_id: str,
    plan: Dict[str, Any],
    state: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute the planned action.
    
    Args:
        session_id: User session ID
        plan: Action plan from planner
        state: Current session state
    
    Returns:
        Execution result
    """
    action = plan.get("action", "respond")
    
    # Handle tool calls
    if action == "tool_call":
        return await execute_tool_call(session_id, plan, state)
    
    # Handle RX confirmation request
    if action == "ask_rx":
        medication = plan.get("medication")
        update_session_state(session_id, {
            "pending_rx_check": medication,
            "selected_medication": medication,
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        return {
            "message": plan.get("message", f"{medication.get('brand_name', 'This medication')} requires a prescription. Do you have one?"),
            "tts_message": "This medication requires a prescription. Do you have one?",
            "action_taken": "ask_rx",
            "needs_input": True,
        }
    
    # Handle Quantity Collection
    if action == "ask_quantity":
        medication = plan.get("medication")
        update_session_state(session_id, {
            "pending_qty_dose_check": medication,
            "selected_medication": medication,
            "pending_add_confirm": None,  # Clear add confirm since we're now in qty flow
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        return {
            "message": plan.get("message", f"How many units of {medication.get('brand_name')} would you like?"),
            "tts_message": plan.get("tts_message", "How many units?"),
            "action_taken": "ask_quantity",
            "needs_input": True,
        }

    # Handle Dose Collection
    if action == "ask_dose":
        medication = plan.get("medication")
        qty = plan.get("quantity", 1)
        update_session_state(session_id, {
            "pending_qty_dose_check": medication,
            "collected_quantity": qty,
        })
        return {
            "message": plan.get("message", f"What is the prescribed dose for {medication.get('brand_name')}?"),
            "tts_message": plan.get("tts_message", "What is the dose?"),
            "action_taken": "ask_dose",
            "needs_input": True,
        }

    # Handle checkout
    if action == "checkout":
        # Use customer_id from session or default to demo customer (ID=2)
        customer_id = state.get("customer_id", 2)  # Default to Rajesh Kumar for demo
        result = await checkout(session_id, customer_id=customer_id)
        if result.get("error"):
            return {
                "message": "Your cart is empty. Add some items first.",
                "action_taken": "checkout_failed",
                "needs_input": True,
            }
        return {
            "message": result.get("message", "Order placed successfully!") + " Inventory has been updated.",
            "tts_message": "Order placed successfully!",
            "action_taken": "checkout",
            "order": result,
            "end_conversation": True,
        }
    
    # Handle end/cancel
    if action == "end":
        await clear_cart(session_id)
        update_session_state(session_id, {
            "candidates": [],
            "pending_rx_check": None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
            "selected_medication": None,
        })
        return {
            "message": plan.get("message", "Order cancelled."),
            "action_taken": "end",
            "end_conversation": True,
        }
    
    # Default respond
    return {
        "message": plan.get("message", "How can I help you?"),
        "tts_message": plan.get("tts_message", plan.get("message")),
        "action_taken": "respond",
        "needs_input": True,
    }


async def execute_tool_call(
    session_id: str,
    plan: Dict[str, Any],
    state: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute a tool call from the plan.
    
    Args:
        session_id: User session ID
        plan: Tool call plan
        state: Current session state
    
    Returns:
        Tool execution result
    """
    tool = plan.get("tool")
    tool_args = plan.get("tool_args", {})
    
    log_trace(session_id, "tool_call", {
        "source": "Orchestrator",
        "target": f"Tool:{tool}",
        "action": "call_tool",
        "args": tool_args
    })
    
    # Lookup by indication
    if tool == "lookup_by_indication":
        indication = tool_args.get("indication", "")
        results = await lookup_by_indication(indication)
        
        if not results:
            # Try vector search as a fallback before giving up
            results = await vector_search(indication)
        
        if not results:
            return {
                "message": f"I wasn't able to find a specific product for '{indication}' in our current inventory. Could you provide the exact medication name or brand you're looking for? You can also describe it differently and I'll search again.",
                "candidates": [],
                "action_taken": "lookup_empty",
            }
        
        # Update state with candidates
        update_session_state(session_id, {
            "candidates": results,
            "pending_rx_check": None,
        })
        
        # Build response
        med_list = [f"{i+1}. {m['brand_name']} ({m['generic_name']} {m['dosage']})" for i, m in enumerate(results[:5])]
        message = f"I've located the following medications appropriate for {indication} in our inventory:\n" + "\n".join(med_list) + "\n\nWhich of these treatments has been recommended by your healthcare provider?"
        tts = f"I've found {', '.join([m['brand_name'] for m in results[:3]])} for {indication}. Which treatment would you like to proceed with?"
        
        return {
            "message": message,
            "tts_message": tts,
            "candidates": results[:5],
            "action_taken": "lookup_indication",
        }
    
    # Vector search
    if tool == "vector_search":
        name = tool_args.get("name", "")
        results = await vector_search(name)
        
        # If vector search returns nothing, try indication lookup as fallback
        if not results and name:
            results = await lookup_by_indication(name)
        
        if not results:
            return {
                "message": f"I was unable to locate a medication matching '{name}' in our current inventory. Could you please double-check the spelling or provide the condition it is intended to treat?",
                "candidates": [],
                "action_taken": "search_empty",
            }
        
        # Update state with candidates
        update_session_state(session_id, {
            "candidates": results,
            "pending_rx_check": None,
        })
        
        if len(results) == 1:
            med = results[0]
            # Single result - check if RX required
            if med.get("rx_required"):
                update_session_state(session_id, {
                    "pending_rx_check": med,
                    "selected_medication": med,
                    "pending_add_confirm": None,
                })
                return {
                    "message": f"Found {med['brand_name']} ({med['generic_name']} {med['dosage']}). This requires a prescription. Do you have one?",
                    "tts_message": f"Found {med['brand_name']}. This requires a prescription. Do you have one?",
                    "candidates": results,
                    "action_taken": "ask_rx",
                }
            else:
                # OTC - set pending_add_confirm so "yes" triggers add
                update_session_state(session_id, {
                    "selected_medication": med,
                    "pending_add_confirm": med,
                    "pending_rx_check": None,
                })
                return {
                    "message": f"I've located {med['brand_name']} ({med['generic_name']} {med['dosage']}). This is an over-the-counter medication. Would you like me to add it to your dispensing list?",
                    "tts_message": f"I've found {med['brand_name']}. Would you like me to add it to your dispensing list?",
                    "candidates": results,
                    "action_taken": "search_single",
                }
        
        # Multiple results
        med_list = [f"{i+1}. {m['brand_name']} ({m['generic_name']} {m['dosage']})" for i, m in enumerate(results[:5])]
        message = f"I've found several matches in our inventory:\n" + "\n".join(med_list) + "\n\nWhich of these specific formulations are you looking for?"
        tts = f"I've found {', '.join([m['brand_name'] for m in results[:3]])}. Which of these are you looking for?"
        
        return {
            "message": message,
            "tts_message": tts,
            "candidates": results[:5],
            "action_taken": "search_multiple",
        }
    
    # Add to cart
    if tool == "add_to_cart":
        med_id = tool_args.get("med_id")
        qty = tool_args.get("qty", 1)
        
        # Get medication details
        med = await get_medication_details(med_id)
        
        # Validate
        # Respect session state for RX confirmation (do not assume True)
        pending = state.get("pending_rx_check")
        rx_confirmed = (not med.get("rx_required", False)) or bool(state.get("rx_verified")) or (pending and pending.get("id") == med.get("id"))
        validation = validate_add_to_cart(med, rx_confirmed=rx_confirmed)
        
        if not validation.get("allowed"):
            if validation.get("suggest_alternatives"):
                alternatives = await get_tier1_alternatives(med_id)
                if alternatives:
                    update_session_state(session_id, {"candidates": alternatives})
                    alt_list = [f"{i+1}. {a['brand_name']} ({a['dosage']})" for i, a in enumerate(alternatives[:3])]
                    return {
                        "message": validation["message"] + f"\n\nAlternatives with the same ingredient:\n" + "\n".join(alt_list),
                        "candidates": alternatives,
                        "action_taken": "out_of_stock_alternatives",
                    }
            return {
                "message": validation["message"],
                "action_taken": "add_blocked",
            }
        
        # Add to cart
        cart = await add_to_cart(session_id, med_id, qty, dose=tool_args.get("dose"))
        
        # Clear pending state
        update_session_state(session_id, {
            "pending_rx_check": None,
            "pending_qty_dose_check": None,
            "pending_add_confirm": None,
            "selected_medication": None,
            "collected_quantity": None,
            "collected_dose": None,
        })
        
        message = f"I've added {med['brand_name']} ({med['dosage']}"
        if tool_args.get("dose"):
            message += f", Dose: {tool_args.get('dose')}"
        message += f") to your dispensing list. You currently have {cart['item_count']} item(s) prepared. Shall we proceed to secure checkout, or is there anything else I can dispense for you?"
        
        return {
            "message": message,
            "tts_message": f"Added {med['brand_name']} to your list. Shall we proceed to checkout?",
            "cart": cart,
            "action_taken": "add_to_cart",
        }
    
    # Get inventory
    if tool == "get_inventory":
        med_id = tool_args.get("med_id")
        result = await get_inventory(med_id)
        return {
            "message": f"{result.get('brand_name', 'Item')}: {result.get('stock_quantity', 0)} in stock",
            "inventory": result,
            "action_taken": "check_inventory",
        }
    
    # Upload Prescription (Simulated)
    if tool == "upload_prescription":
        image_path = tool_args.get("file_path", "mock_prescription.jpg")
        
        # 1. OCR Extraction
        from services.ocr_service import extract_text_from_image, parse_prescription_text
        ocr_result = await extract_text_from_image(image_path)
        
        if "error" in ocr_result:
             return {
                "message": f"Failed to read prescription: {ocr_result['error']}",
                "action_taken": "upload_failed",
            }
            
        # 2. Parse Text
        parsed_rx = await parse_prescription_text(ocr_result["text"])
        meds_found = parsed_rx.get("medications", [])
        unknown_items = parsed_rx.get("unknown_items", [])
        
        if not meds_found and not unknown_items:
             return {
                "message": "I processed the prescription but couldn't identify any medicines. Please try again or type the names manually.",
                "action_taken": "upload_empty",
                "extracted_data": parsed_rx
            }

        # 3. Check Cart State
        cart = await get_cart(session_id)
        
        # MODE A: Scan to Cart (Cart is Empty)
        if cart["item_count"] == 0:
            from tools.cart_tools import search_medications, get_inventory
            
            added_items = []
            oos_items = [] # Out of Stock items with alternatives
            
            for med in meds_found:
                # 1. Search for item to check availability
                # Use simplified search
                query = f"{med['brand_name']} {med.get('dosage', '')}"
                results = await search_medications(query)
                
                # Filter for exact/good match
                match = None
                if results:
                    # Simple heuristic: pick first
                    match = results[0]
                
                if match:
                    # Check stock
                    if match.get("stock_quantity", 0) > 0:
                        await add_to_cart(session_id, match["id"], 1)
                        added_items.append(match["brand_name"])
                    else:
                        # Find alternatives
                        alts = await search_medications(match.get("active_ingredient", ""), limit=3)
                        # Filter out the OOS item itself
                        alts = [a for a in alts if a["id"] != match["id"] and a.get("stock_quantity", 0) > 0]
                        
                        oos_items.append({
                            "requested": match["brand_name"],
                            "alternatives": alts
                        })
                else:
                    unknown_items.append(med["brand_name"])
            
            # Update state to reflect these are verified (if any added)
            if added_items:
                update_session_state(session_id, {
                    "rx_verified": True,
                    "pending_rx_check": None
                })
            
            # Construct Message
            msg_parts = []
            if added_items:
                msg_parts.append(f"✅ Added to cart: {', '.join(added_items)}.")
            
            if oos_items:
                for oos in oos_items:
                    alt_names = [a['brand_name'] for a in oos['alternatives']]
                    if alt_names:
                        msg_parts.append(f"⚠️ {oos['requested']} is out of stock. Alternatives available: {', '.join(alt_names)}.")
                    else:
                        msg_parts.append(f"⚠️ {oos['requested']} is out of stock.")
            
            if unknown_items:
                 msg_parts.append(f"❓ Could not find: {', '.join(unknown_items)}.")
            
            final_msg = "\n".join(msg_parts)
            if not final_msg:
                final_msg = "No valid items found to add."
                
            return {
                "message": final_msg,
                "action_taken": "scan_to_cart_processed",
                "added_items": added_items,
                "oos_items": oos_items,
                "unknown_items": unknown_items
            }
            
        # MODE B: Verify Existing Cart (Cart has items)
        else:
            from agents.safety_agent import validate_prescription
            validation = await validate_prescription(parsed_rx, cart["items"])
            
            # Update session state with validation result
            if validation["valid"]:
                 update_session_state(session_id, {
                    "rx_verified": True,
                    "pending_rx_check": None
                })
                 return {
                    "message": f"✅ Prescription verified! Found: {', '.join([m['brand_name'] for m in meds_found])}. All cart items approved.",
                    "action_taken": "upload_verified_success",
                    "extracted_data": parsed_rx
                }
            else:
                 return {
                    "message": f"⚠️ {validation['message']}",
                    "action_taken": "upload_verified_failed",
                    "extracted_data": parsed_rx
                }

    # Default
    return {
        "message": "Something went wrong. Please try again.",
        "action_taken": "tool_error",
    }


def clear_session(session_id: str):
    """Clear session state."""
    if session_id in _conversation_states:
        del _conversation_states[session_id]
