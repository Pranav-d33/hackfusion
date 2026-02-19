"""
Agent Orchestrator (v2) — Simplified LLM-first pipeline.

Pipeline: Safety Check → Ordering Agent (single LLM call) → Execute Action → Output Guard

Replaces the old NLU → Planner → Execute cascade with a single ordering
agent that handles intent understanding, context resolution, and action
planning in one step.
"""
from typing import Dict, Any, Optional
import time
import uuid
import sys
sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from agents.ordering_agent import handle as ordering_agent_handle
from agents.safety_agent import check_input_safety, validate_add_to_cart
from tools.query_tools import (
    lookup_by_indication, vector_search, get_inventory,
    get_rx_flag, get_medication_details, get_tier1_alternatives,
)
from tools.cart_tools import add_to_cart, get_cart, checkout, clear_cart
from tools.trace_tools import log_trace, get_trace

# Langfuse observability
from observability.langfuse_client import (
    init_langfuse, create_trace, get_trace_url, TracedOperation, flush, is_enabled,
)

# ── Session state ───────────────────────────────────────────────────────
_conversation_states: Dict[str, Dict[str, Any]] = {}


# ── Static output guard ────────────────────────────────────────────────
FORBIDDEN_OUTPUT_PATTERNS = [
    "take this medication",
    "i recommend",
    "you should take",
    "dosage is",
    "mg per day",
    "antibiotic",
]


def validate_output_static(message: str) -> Dict[str, Any]:
    """Fast static check (~0 ms) for forbidden phrases in agent output."""
    if not message:
        return {"safe": True}
    msg_lower = message.lower()
    for p in FORBIDDEN_OUTPUT_PATTERNS:
        if p in msg_lower:
            return {
                "safe": False,
                "reason": f"forbidden_pattern:{p}",
                "message": (
                    "I'm happy to help you order your medications, but for "
                    "dosage guidance or medical advice please consult your "
                    "doctor. Is there anything else I can help with?"
                ),
            }
    return {"safe": True}


# ── Langfuse init ───────────────────────────────────────────────────────
_langfuse_initialized = init_langfuse()


# ── Session helpers ─────────────────────────────────────────────────────
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
            "conversation_history": [],
        }
    return _conversation_states[session_id]


def update_session_state(session_id: str, updates: Dict[str, Any]):
    """Merge updates into session state."""
    state = get_session_state(session_id)
    state.update(updates)
    _conversation_states[session_id] = state


# ── Main pipeline ───────────────────────────────────────────────────────
async def process_message(
    session_id: str,
    user_input: str,
) -> Dict[str, Any]:
    """
    Process a single user turn through the full pipeline.

    1. Safety check (input guard)
    2. Ordering agent (fast path or single LLM call)
    3. Execute returned action (tool calls, state mutations)
    4. Output guard
    5. Return response
    """
    start_time = time.time()

    if not session_id:
        session_id = str(uuid.uuid4())

    state = get_session_state(session_id)
    state["turn_count"] += 1

    # Pre-fetch user intelligence on first turn
    if state["turn_count"] == 1:
        try:
            from services.user_intelligence_service import get_user_refill_patterns
            customer_id = state.get("customer_id", 2)
            insights = await get_user_refill_patterns(customer_id)
            if insights:
                state["user_insights"] = insights
                log_trace(session_id, "user_insights", insights)
        except Exception as e:
            print(f"Error fetching user insights: {e}")

    # Langfuse trace
    trace = create_trace(
        name="agent_turn",
        session_id=session_id,
        metadata={"user_input": user_input, "turn": state["turn_count"]},
    )
    trace_id = trace.id if trace else None
    trace_url = get_trace_url(trace_id) if trace_id else None

    # ── Step 1: Input safety ────────────────────────────────────────
    with TracedOperation(trace, "safety_check", "span") as op:
        safety = await check_input_safety(user_input)
        op.log_input({"user_input": user_input})
        op.log_output(safety)

    log_trace(session_id, "safety_check", {
        "source": "Orchestrator", "target": "SafetyAgent",
        "action": "validate_input", "input": user_input, "result": safety,
    })

    if not safety.get("safe", True):
        # Add to history so context is preserved
        state.setdefault("conversation_history", []).append(
            {"role": "user", "content": user_input}
        )
        state["conversation_history"].append(
            {"role": "assistant", "content": safety["message"]}
        )
        flush()
        return {
            "session_id": session_id,
            "message": safety["message"],
            "tts_message": safety["message"],
            "blocked": True,
            "reason": safety.get("reason"),
            "trace": get_trace(session_id),
            "trace_id": trace_id,
            "trace_url": trace_url,
            "latency_ms": int((time.time() - start_time) * 1000),
        }

    # ── Step 2: Ordering agent (fast path or LLM) ──────────────────
    with TracedOperation(trace, "ordering_agent", "generation") as op:
        op.log_input({"user_input": user_input, "state_summary": _state_summary(state)})
        agent_result = await ordering_agent_handle(user_input, state)
        op.log_output(agent_result)

    log_trace(session_id, "ordering_agent", {
        "source": "Orchestrator", "target": "OrderingAgent",
        "action": agent_result.get("action", "respond"),
        "fast_path": agent_result.get("fast_path", False),
        "reasoning": agent_result.get("reasoning", ""),
        "model": agent_result.get("_model_used", "fast_path"),
        "input": user_input,
    })

    # Add user message to history
    history = state.setdefault("conversation_history", [])
    history.append({"role": "user", "content": user_input})
    if len(history) > 20:
        state["conversation_history"] = history[-20:]

    # ── Step 3: Execute action ──────────────────────────────────────
    with TracedOperation(trace, "execute_action", "span") as op:
        op.log_input({"agent_result": agent_result})
        result = await execute_action(session_id, agent_result, state)
        op.log_output(result)

    log_trace(session_id, "execute", {
        "source": "Orchestrator", "target": "ToolExecutor",
        "action": agent_result.get("action"),
        "result_action": result.get("action_taken"),
    })

    # Add assistant response to history
    assistant_msg = result.get("message", "")
    if assistant_msg:
        state["conversation_history"].append({"role": "assistant", "content": assistant_msg})

    flush()

    # ── Step 4: Output guard ────────────────────────────────────────
    output_safety = validate_output_static(result.get("message", ""))
    if not output_safety.get("safe", True):
        log_trace(session_id, "output_guardrail_block", {
            "original": result["message"],
            "reason": output_safety.get("reason"),
        })
        result["message"] = output_safety["message"]
        result["tts_message"] = "I cannot provide that information for safety reasons."

    # ── Step 5: Build response ──────────────────────────────────────
    latency_ms = int((time.time() - start_time) * 1000)

    return {
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


# ── Action executor ─────────────────────────────────────────────────────
async def execute_action(
    session_id: str,
    plan: Dict[str, Any],
    state: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute the action returned by the ordering agent."""
    action = plan.get("action", "respond")

    # ── tool_call ───────────────────────────────────────────────────
    if action == "tool_call":
        return await execute_tool_call(session_id, plan, state)

    # ── ask_rx ──────────────────────────────────────────────────────
    if action == "ask_rx":
        med = plan.get("medication") or {}
        update_session_state(session_id, {
            "pending_rx_check": med or None,
            "selected_medication": med or None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        default_msg = f"{med.get('brand_name', 'This medication')} requires a prescription. Do you have one?"
        return {
            "message": plan.get("message", default_msg),
            "tts_message": plan.get("tts_message", plan.get("message", default_msg)),
            "action_taken": "ask_rx",
            "needs_input": True,
        }

    # ── ask_quantity ────────────────────────────────────────────────
    if action == "ask_quantity":
        med = plan.get("medication") or {}
        update_session_state(session_id, {
            "pending_qty_dose_check": med or None,
            "selected_medication": med or None,
            "pending_add_confirm": None,
            "pending_rx_check": None,
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        default_msg = f"How many units of {med.get('brand_name', 'this medication')} would you like?"
        return {
            "message": plan.get("message", default_msg),
            "tts_message": plan.get("tts_message", plan.get("message", default_msg)),
            "action_taken": "ask_quantity",
            "needs_input": True,
        }

    # ── ask_dose ────────────────────────────────────────────────────
    if action == "ask_dose":
        med = plan.get("medication") or {}
        qty = plan.get("quantity", 1)
        update_session_state(session_id, {
            "pending_qty_dose_check": med or None,
            "collected_quantity": qty,
        })
        default_msg = f"What dose for {med.get('brand_name', 'this medication')}?"
        return {
            "message": plan.get("message", default_msg),
            "tts_message": plan.get("tts_message", plan.get("message", default_msg)),
            "action_taken": "ask_dose",
            "needs_input": True,
        }

    # ── checkout ────────────────────────────────────────────────────
    if action == "checkout":
        customer_id = state.get("customer_id", 2)
        result = await checkout(session_id, customer_id=customer_id)
        if result.get("error"):
            return {
                "message": "Your cart is empty. Add some items first!",
                "action_taken": "checkout_failed",
                "needs_input": True,
            }
        return {
            "message": result.get("message", "Order placed!") + " Inventory updated.",
            "tts_message": "Order placed successfully!",
            "action_taken": "checkout",
            "order": result,
            "end_conversation": True,
        }

    # ── end / cancel ────────────────────────────────────────────────
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
            "message": plan.get("message", "Session cleared."),
            "tts_message": plan.get("tts_message", plan.get("message")),
            "action_taken": "end",
            "end_conversation": True,
        }

    # ── default: respond ────────────────────────────────────────────
    return {
        "message": plan.get("message", "How can I help you?"),
        "tts_message": plan.get("tts_message", plan.get("message")),
        "action_taken": "respond",
        "needs_input": True,
    }


# ── Tool executor ───────────────────────────────────────────────────────
async def execute_tool_call(
    session_id: str,
    plan: Dict[str, Any],
    state: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute a tool call from the agent's plan."""
    tool = plan.get("tool")
    args = plan.get("tool_args", {})

    log_trace(session_id, "tool_call", {
        "source": "Orchestrator", "target": f"Tool:{tool}",
        "args": args,
    })

    # ── lookup_by_indication ────────────────────────────────────────
    if tool == "lookup_by_indication":
        indication = args.get("indication", "")
        results = await lookup_by_indication(indication)
        if not results:
            results = await vector_search(indication)
        if not results:
            return {
                "message": plan.get(
                    "message",
                    f"I couldn't find products for '{indication}'. Could you provide the exact medication name?",
                ),
                "candidates": [],
                "action_taken": "lookup_empty",
            }
        update_session_state(session_id, {
            "candidates": results,
            "pending_rx_check": None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
        })
        med_list = "\n".join(
            f"{i+1}. {m['brand_name']} ({m.get('generic_name','')} {m.get('dosage','')}) — €{m.get('price',0)} — Stock: {m.get('stock_quantity',0)}"
            for i, m in enumerate(results[:5])
        )
        msg = plan.get("message") or (
            f"Here are medications for {indication}:\n{med_list}\n\nWhich one would you like?"
        )
        tts = plan.get("tts_message") or (
            f"I found {', '.join(m['brand_name'] for m in results[:3])} for {indication}. Which one?"
        )
        return {
            "message": msg,
            "tts_message": tts,
            "candidates": results[:5],
            "action_taken": "lookup_indication",
        }

    # ── vector_search ───────────────────────────────────────────────
    if tool == "vector_search":
        name = args.get("name", "")
        results = await vector_search(name)
        if not results and name:
            results = await lookup_by_indication(name)
        if not results:
            return {
                "message": plan.get(
                    "message",
                    f"Couldn't find '{name}'. Could you check the spelling or describe the condition?",
                ),
                "candidates": [],
                "action_taken": "search_empty",
            }
        update_session_state(session_id, {
            "candidates": results,
            "pending_rx_check": None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
        })

        if len(results) == 1:
            med = results[0]
            if med.get("rx_required"):
                update_session_state(session_id, {
                    "pending_rx_check": med,
                    "selected_medication": med,
                })
                return {
                    "message": plan.get("message") or f"Found {med['brand_name']}. This requires a prescription. Do you have one?",
                    "tts_message": plan.get("tts_message") or f"Found {med['brand_name']}. Do you have a prescription?",
                    "candidates": results,
                    "action_taken": "ask_rx",
                }
            else:
                update_session_state(session_id, {
                    "selected_medication": med,
                    "pending_add_confirm": med,
                })
                return {
                    "message": plan.get("message") or f"Found {med['brand_name']} ({med.get('dosage','')}) — €{med.get('price',0)}. Would you like to add it?",
                    "tts_message": plan.get("tts_message") or f"Found {med['brand_name']}. Want to add it?",
                    "candidates": results,
                    "action_taken": "search_single",
                }

        med_list = "\n".join(
            f"{i+1}. {m['brand_name']} ({m.get('dosage','')}) — €{m.get('price',0)} — Stock: {m.get('stock_quantity',0)}"
            for i, m in enumerate(results[:5])
        )
        msg = plan.get("message") or f"Found several matches:\n{med_list}\n\nWhich one?"
        tts = plan.get("tts_message") or f"Found {', '.join(m['brand_name'] for m in results[:3])}. Which one?"
        return {
            "message": msg,
            "tts_message": tts,
            "candidates": results[:5],
            "action_taken": "search_multiple",
        }

    # ── add_to_cart ─────────────────────────────────────────────────
    if tool == "add_to_cart":
        med_id = args.get("med_id")
        qty = args.get("qty", 1)
        dose = args.get("dose")

        med = await get_medication_details(med_id)
        validation = validate_add_to_cart(med, rx_confirmed=True)

        if not validation.get("allowed"):
            if validation.get("suggest_alternatives"):
                alternatives = await get_tier1_alternatives(med_id)
                if alternatives:
                    update_session_state(session_id, {"candidates": alternatives})
                    alt_list = "\n".join(
                        f"{i+1}. {a['brand_name']} ({a.get('dosage','')})"
                        for i, a in enumerate(alternatives[:3])
                    )
                    return {
                        "message": f"{validation['message']}\n\nAlternatives:\n{alt_list}",
                        "candidates": alternatives,
                        "action_taken": "out_of_stock_alternatives",
                    }
            return {"message": validation["message"], "action_taken": "add_blocked"}

        cart = await add_to_cart(session_id, med_id, qty, dose=dose)
        update_session_state(session_id, {
            "pending_rx_check": None,
            "pending_qty_dose_check": None,
            "pending_add_confirm": None,
            "selected_medication": None,
            "collected_quantity": None,
            "collected_dose": None,
        })

        msg = plan.get("message") or (
            f"Added {med['brand_name']} ({qty} units) to your cart. "
            f"Cart has {cart['item_count']} item(s). Checkout or add more?"
        )
        return {
            "message": msg,
            "tts_message": plan.get("tts_message") or f"Added {med['brand_name']}. Checkout or add more?",
            "cart": cart,
            "action_taken": "add_to_cart",
        }

    # ── get_inventory ───────────────────────────────────────────────
    if tool == "get_inventory":
        med_id = args.get("med_id")
        inv = await get_inventory(med_id)
        return {
            "message": f"{inv.get('brand_name','Item')}: {inv.get('stock_quantity',0)} in stock",
            "inventory": inv,
            "action_taken": "check_inventory",
        }

    # ── get_tier1_alternatives ──────────────────────────────────────
    if tool == "get_tier1_alternatives":
        med_id = args.get("med_id")
        alts = await get_tier1_alternatives(med_id)
        if not alts:
            return {
                "message": "No alternatives found with the same active ingredient.",
                "action_taken": "no_alternatives",
            }
        update_session_state(session_id, {"candidates": alts})
        alt_list = "\n".join(
            f"{i+1}. {a['brand_name']} ({a.get('dosage','')}) — Stock: {a.get('stock_quantity',0)}"
            for i, a in enumerate(alts[:5])
        )
        return {
            "message": f"Alternatives available:\n{alt_list}\n\nWhich one?",
            "candidates": alts,
            "action_taken": "show_alternatives",
        }

    # ── upload_prescription ─────────────────────────────────────────
    if tool == "upload_prescription":
        return await _handle_prescription_upload(session_id, args, state)

    # ── Unknown tool ────────────────────────────────────────────────
    return {
        "message": "Something went wrong. Please try again.",
        "action_taken": "tool_error",
    }


# ── Prescription upload (kept from v1) ──────────────────────────────────
async def _handle_prescription_upload(
    session_id: str, args: Dict[str, Any], state: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle prescription image upload and OCR → cart or verify flow."""
    image_path = args.get("file_path", "mock_prescription.jpg")

    from services.ocr_service import extract_text_from_image, parse_prescription_text

    ocr_result = await extract_text_from_image(image_path)
    if "error" in ocr_result:
        return {"message": f"Failed to read prescription: {ocr_result['error']}", "action_taken": "upload_failed"}

    parsed_rx = await parse_prescription_text(ocr_result["text"])
    meds_found = parsed_rx.get("medications", [])
    unknown_items = parsed_rx.get("unknown_items", [])

    if not meds_found and not unknown_items:
        return {
            "message": "Couldn't identify any medicines from the prescription. Try again or type them manually.",
            "action_taken": "upload_empty",
        }

    cart = await get_cart(session_id)

    if cart["item_count"] == 0:
        # Scan-to-cart mode
        from tools.cart_tools import search_medications as _search
        added, oos, unknown = [], [], list(unknown_items)
        for med in meds_found:
            query = f"{med['brand_name']} {med.get('dosage','')}"
            results = await _search(query)
            match = results[0] if results else None
            if match and match.get("stock_quantity", 0) > 0:
                await add_to_cart(session_id, match["id"], 1)
                added.append(match["brand_name"])
            elif match:
                alts = await _search(match.get("active_ingredient", ""), limit=3)
                alts = [a for a in alts if a["id"] != match["id"] and a.get("stock_quantity", 0) > 0]
                oos.append({"requested": match["brand_name"], "alternatives": alts})
            else:
                unknown.append(med["brand_name"])

        parts = []
        if added:
            parts.append(f"Added to cart: {', '.join(added)}.")
        for o in oos:
            alt_names = [a["brand_name"] for a in o["alternatives"]]
            parts.append(f"{o['requested']} is out of stock." + (f" Alternatives: {', '.join(alt_names)}." if alt_names else ""))
        if unknown:
            parts.append(f"Could not find: {', '.join(unknown)}.")
        if added:
            update_session_state(session_id, {"rx_verified": True, "pending_rx_check": None})
        return {"message": "\n".join(parts) or "No items found.", "action_taken": "scan_to_cart_processed"}
    else:
        # Verify existing cart
        from agents.safety_agent import validate_prescription
        validation = await validate_prescription(parsed_rx, cart["items"])
        if validation["valid"]:
            update_session_state(session_id, {"rx_verified": True, "pending_rx_check": None})
            return {"message": f"Prescription verified! Items approved.", "action_taken": "upload_verified_success"}
        return {"message": validation["message"], "action_taken": "upload_verified_failed"}


# ── Helpers ─────────────────────────────────────────────────────────────
def _state_summary(state: Dict[str, Any]) -> Dict[str, Any]:
    """Compact summary for trace logging (avoid dumping full candidates)."""
    return {
        "turn": state.get("turn_count"),
        "n_candidates": len(state.get("candidates", [])),
        "pending_rx": bool(state.get("pending_rx_check")),
        "pending_qty": bool(state.get("pending_qty_dose_check")),
        "pending_add": bool(state.get("pending_add_confirm")),
        "cart_items": state.get("cart", {}).get("item_count", 0),
    }


def clear_session(session_id: str):
    """Clear session state."""
    _conversation_states.pop(session_id, None)
