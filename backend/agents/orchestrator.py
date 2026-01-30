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

# Initialize Langfuse on module load
_langfuse_initialized = init_langfuse()


def get_session_state(session_id: str) -> Dict[str, Any]:
    """Get or create session state."""
    if session_id not in _conversation_states:
        _conversation_states[session_id] = {
            "candidates": [],
            "selected_medication": None,
            "pending_rx_check": None,
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
        nlu_result = await parse_input(user_input)
        op.log_output(nlu_result)
    log_trace(session_id, "nlu_parse", {
        "source": "Orchestrator",
        "target": "NLU",
        "action": "parse_intent",
        "input": user_input,
        "result": nlu_result
    })
    
    # Add user message to conversation history
    conversation_history = state.get("conversation_history", [])
    conversation_history.append({"role": "user", "content": user_input})
    
    # Keep only last 10 turns (20 messages) to prevent token overflow
    if len(conversation_history) > 20:
        conversation_history = conversation_history[-20:]
    
    state["conversation_history"] = conversation_history
    
    # Step 3: Plan next action
    with TracedOperation(trace, "planner", "generation") as op:
        op.log_input({"nlu_result": nlu_result, "state": state})
        plan = await plan_next_action(nlu_result, state)
        op.log_output(plan)
    log_trace(session_id, "plan", {
        "source": "Orchestrator",
        "target": "Planner",
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
    
    # Step 5: Output Guardrail - Validate final response
    # Re-use check_input_safety but for output to catch self-leakage
    final_message = result.get("message", "")
    output_safety = await check_input_safety(final_message)
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
        })
        return {
            "message": plan.get("message", f"{medication.get('brand_name', 'This medication')} requires a prescription. Do you have one?"),
            "tts_message": "This medication requires a prescription. Do you have one?",
            "action_taken": "ask_rx",
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
            return {
                "message": f"I've carefully checked our pharmaceutical database for '{indication}', but it appears we are currently out of stock for specific treatments. Would you like to check for a symptoms-based alternative?",
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
                })
                return {
                    "message": f"Found {med['brand_name']} ({med['generic_name']} {med['dosage']}). This requires a prescription. Do you have one?",
                    "tts_message": f"Found {med['brand_name']}. This requires a prescription. Do you have one?",
                    "candidates": results,
                    "action_taken": "ask_rx",
                }
            else:
                # OTC - can add directly
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
        validation = validate_add_to_cart(med, rx_confirmed=True)
        
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
        cart = await add_to_cart(session_id, med_id, qty)
        
        # Clear pending state
        update_session_state(session_id, {
            "pending_rx_check": None,
            "selected_medication": None,
        })
        
        return {
            "message": f"I've added {med['brand_name']} ({med['dosage']}) to your dispensing list. You currently have {cart['item_count']} item(s) prepared. Shall we proceed to secure checkout, or is there anything else I can dispense for you?",
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
