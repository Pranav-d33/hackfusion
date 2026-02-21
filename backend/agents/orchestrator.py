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

from agents.ordering_agent import handle as ordering_agent_handle, _detect_script_language
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


# ── Lightweight language utilities ───────────────────────────────────
_L10N = {
    "ask_rx": {
        "en": "{med} requires a prescription. Do you have one?",
        "de": "{med} ist verschreibungspflichtig. Hast du ein Rezept?",
        "ar": "هذا الدواء يحتاج إلى وصفة طبية. هل لديك وصفة؟",
        "hi": "यह दवा प्रिस्क्रिप्शन से मिलती है। क्या आपके पास प्रिस्क्रिप्शन है?",
    },
    "ask_quantity": {
        "en": "How many units of {med} would you like?",
        "de": "Wie viele Einheiten von {med} möchtest du?",
        "ar": "كم وحدة من {med} تريد؟",
        "hi": "{med} की कितनी यूनिट चाहिए?",
    },
    "ask_dose": {
        "en": "What dose for {med}?",
        "de": "Welche Dosierung für {med}?",
        "ar": "ما هي الجرعة لـ {med}؟",
        "hi": "{med} की कौनसी डोज़?",
    },
    "checkout_start": {
        "en": "Let me start the checkout process for you.",
        "de": "Ich starte jetzt den Checkout für dich.",
        "ar": "سأبدأ عملية الدفع لك الآن.",
        "hi": "मैं चेकआउट शुरू कर रहा हूँ। कृपया डिटेल्स कन्फर्म करें।",
    },
    "checkout_empty": {
        "en": "Your cart is empty. Add some items first!",
        "de": "Dein Warenkorb ist leer. Bitte füge zuerst Artikel hinzu!",
        "ar": "سلة التسوق فارغة. أضف بعض المنتجات أولاً!",
        "hi": "आपका कार्ट खाली है। पहले कुछ आइटम जोड़ें!",
    },
    "search_empty": {
        "en": "I couldn't find {name}. Could you check the spelling or tell me what condition you're treating?",
        "de": "Ich konnte {name} nicht finden. Bitte prüfe die Schreibweise oder beschreibe, wofür du es brauchst.",
        "ar": "لم أجد {name}. هل يمكنك التحقق من التهجئة أو إخباري بالحالة التي تعالجها؟",
        "hi": "मुझे {name} नहीं मिला। स्पेलिंग चेक करें या बताएं किस समस्या के लिए चाहिए?",
    },
    "lookup_empty": {
        "en": "I couldn't find any medications for \"{indication}\". Could you describe your symptoms differently or provide the medication name?",
        "de": "Ich habe keine Medikamente für \"{indication}\" gefunden. Kannst du die Symptome anders beschreiben oder den Medikamentennamen nennen?",
        "ar": "لم أجد أدوية لـ \"{indication}\". هل يمكنك وصف الأعراض بطريقة مختلفة أو ذكر اسم الدواء؟",
        "hi": "\"{indication}\" के लिए कोई दवा नहीं मिली। कृपया लक्षण दूसरे तरीके से बताएं या दवा का नाम दें।",
    },
    "add_not_found": {
        "en": "I couldn't find that medication. Could you try searching again?",
        "de": "Ich konnte dieses Medikament nicht finden. Bitte suche erneut.",
        "ar": "لم أتمكن من العثور على هذا الدواء. هل يمكنك البحث مرة أخرى؟",
        "hi": "यह दवा नहीं मिली। क्या आप दोबारा खोजेंगे?",
    },
    "select_prompt": {
        "en": "Please select an item by number, or ask for more details.",
        "de": "Bitte wähle einen Artikel per Nummer oder frage nach Details.",
        "ar": "اختر منتجًا برقم، أو اطلب المزيد من التفاصيل.",
        "hi": "कृपया नंबर से आइटम चुनें या डिटेल्स पूछें।",
    },
    "indication_lead": {
        "en": "The following medications are available for {indication}:",
        "de": "Folgende Medikamente sind verfügbar für {indication}:",
        "ar": "الأدوية التالية متوفرة لـ {indication}:",
        "hi": "{indication} के लिए ये दवाएं उपलब्ध हैं:",
    },
    "search_lead": {
        "en": "I found the following matches for your search:",
        "de": "Ich habe folgende Treffer gefunden:",
        "ar": "عثرت على النتائج التالية لبحثك:",
        "hi": "मुझे ये परिणाम मिले हैं:",
    },
    "single_rx": {
        "en": "{med} ({dosage}) is available at €{price:.2f}. This medication requires a valid prescription. Do you have one ready?",
        "de": "{med} ({dosage}) ist für €{price:.2f} verfügbar. Dieses Medikament braucht ein Rezept. Hast du eines?",
        "ar": "{med} ({dosage}) متوفر بسعر €{price:.2f}. هذا الدواء يحتاج إلى وصفة طبية. هل لديك وصفة؟",
        "hi": "{med} ({dosage}) €{price:.2f} पर उपलब्ध है। इस दवा के लिए प्रिस्क्रिप्शन ज़रूरी है। क्या आपके पास प्रिस्क्रिप्शन है?",
    },
    "single_otc": {
        "en": "{med} ({dosage}) is available at €{price:.2f}. How many units would you like to add to your cart?",
        "de": "{med} ({dosage}) ist für €{price:.2f} verfügbar. Wie viele Einheiten soll ich in den Warenkorb legen?",
        "ar": "{med} ({dosage}) متوفر بسعر €{price:.2f}. كم وحدة تريد إضافتها إلى سلة التسوق؟",
        "hi": "{med} ({dosage}) €{price:.2f} पर उपलब्ध है। कितनी यूनिट कार्ट में जोड़ूं?",
    },
    "add_success": {
        "en": "{med} ({qty} unit{plural}) has been added to your cart. Your cart now contains {cart_items} item{cart_plural}. Would you like to add more items or proceed to checkout?",
        "de": "{med} ({qty} Stück{plural}) wurde in deinen Warenkorb gelegt. Er enthält jetzt {cart_items} Artikel{cart_plural}. Möchtest du weiter einkaufen oder zur Kasse gehen?",
        "ar": "تمت إضافة {med} ({qty} وحدة{plural}) إلى سلة التسوق. السلة تحتوي الآن على {cart_items} منتج{cart_plural}. هل تريد إضافة المزيد أم المتابعة للدفع؟",
        "hi": "{med} ({qty} यूनिट{plural}) कार्ट में जोड़ दिया गया। कार्ट में अब {cart_items} आइटम{cart_plural} हैं। और कुछ चाहिए या चेकआउट करें?",
    },
    "no_alternatives": {
        "en": "No alternatives with the same active ingredient are available right now. Would you like to search for something else?",
        "de": "Keine Alternativen mit gleichem Wirkstoff verfügbar. Möchtest du etwas anderes suchen?",
        "ar": "لا توجد بدائل بنفس المادة الفعالة حاليًا. هل تريد البحث عن شيء آخر؟",
        "hi": "अभी समान एक्टिव इंग्रीडिएंट वाला कोई विकल्प नहीं है। कुछ और खोजना चाहेंगे?",
    },
    "available": {
        "en": "✓ Available",
        "de": "✓ Verfügbar",
        "ar": "✓ متوفر",
        "hi": "✓ उपलब्ध",
    },
    "out_of_stock_label": {
        "en": "✗ Unavailable",
        "de": "✗ Nicht verfügbar",
        "ar": "✗ غير متوفر",
        "hi": "✗ अनुपलब्ध",
    },
    "alt_lead": {
        "en": "These alternatives with the same active ingredient are available:",
        "de": "Folgende Alternativen mit dem gleichen Wirkstoff sind verfügbar:",
        "ar": "البدائل التالية متوفرة بنفس المادة الفعالة:",
        "hi": "समान एक्टिव इंग्रीडिएंट वाले ये विकल्प उपलब्ध हैं:",
    },
    "alt_pick": {
        "en": "Which one would you like to add to your cart?",
        "de": "Welches möchtest du in den Warenkorb legen?",
        "ar": "أيهم تريد إضافته إلى سلة التسوق؟",
        "hi": "कौनसा कार्ट में जोड़ना चाहेंगे?",
    },
    "inventory_status": {
        "en": "{name} is currently available. Would you like to add it to your cart?",
        "de": "{name} ist aktuell verfügbar. Soll ich es in den Warenkorb legen?",
        "ar": "{name} متوفر حاليًا. هل تريد إضافته إلى سلة التسوق؟",
        "hi": "{name} अभी उपलब्ध है। क्या कार्ट में जोड़ूं?",
    },
    "inventory_oos": {
        "en": "{name} is currently unavailable. Would you like me to check for alternatives?",
        "de": "{name} ist aktuell nicht verfügbar. Soll ich nach Alternativen suchen?",
        "ar": "{name} غير متوفر حاليًا. هل تريد أن أبحث عن بدائل؟",
        "hi": "{name} अभी उपलब्ध नहीं है। क्या विकल्प खोजूं?",
    },
}


def _localize(key: str, lang: str, **kwargs) -> str:
    variants = _L10N.get(key, {})
    lang_key = lang if lang in variants else "en"
    template = variants.get(lang_key) or variants.get("en") or ""
    try:
        return template.format(**kwargs)
    except Exception:
        return template


def _fmt_candidate(i: int, m: dict, lang: str) -> str:
    """Format a single medication candidate for display — localized, no raw stock counts."""
    dosage = (m.get('dosage') or '').strip()
    name = f"{m['brand_name']} ({dosage})" if dosage else m['brand_name']
    price = float(m.get('price', 0))
    stock = m.get('stock_quantity', 0)
    status = _localize("available", lang) if stock > 0 else _localize("out_of_stock_label", lang)
    return f"{i+1}. {name} — €{price:.2f} — {status}"


def _detect_user_lang(user_input: str | None, state: Dict[str, Any]) -> str:
    """Detect user language from current input or recent history."""
    history = state.get("conversation_history", [])
    
    # If input is very short (like 'M' or '20') or just numbers, 
    # the script detector might falsely default to 'en', so we prefer history.
    if user_input:
        is_short_or_numeric = len(user_input.strip()) <= 3 or user_input.strip().isdigit()
        if is_short_or_numeric:
            for msg in reversed(history):
                if msg.get("role") == "user":
                    prev_lang = _detect_script_language(msg.get("content", ""))
                    if prev_lang != "en":
                        return prev_lang

        # Otherwise rely on current input detection
        lang = _detect_script_language(user_input)
        if lang != "en":
            return lang

    # Fallback to history for empty input or if current input yielded 'en'
    for msg in reversed(history):
        if msg.get("role") == "user":
            lang = _detect_script_language(msg.get("content", ""))
            if lang != "en":
                return lang

    return "en"


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
            "customer_id": None,
            "candidates": [],
            "selected_medication": None,
            "pending_rx_check": None,
            "pending_qty_dose_check": None,
            "pending_add_confirm": None,
            "pending_checkout_confirm": None,
            "pending_checkout_address": None,
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
    customer_id: Optional[int] = None,
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
    if customer_id:
        state["customer_id"] = customer_id
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
    # Pass trace_id to agent for LLM observability
    state["trace_id"] = trace_id
    
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
        result = await execute_action(session_id, agent_result, state, user_input)
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

    # ── Step 4.5: Persist trace to DB for observability dashboard ───
    try:
        from db.database import execute_write
        import json
        await execute_write(
            """INSERT INTO traces (trace_id, session_id, name, input_text, output_text, metadata_json, latency_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                trace_id or str(uuid.uuid4()),
                session_id,
                "agent_turn",
                user_input,
                result.get("message", ""),
                json.dumps({
                    "turn": state["turn_count"],
                    "action_taken": result.get("action_taken"),
                    "candidates_count": len(result.get("candidates", [])),
                    "cart_items": result.get("cart", {}).get("item_count", 0),
                    "retrieved_context": state.get("candidates", [])[:3],  # for RAG eval
                }),
                int((time.time() - start_time) * 1000),
            )
        )
    except Exception as e:
        print(f"Warning: Failed to persist trace to DB: {e}")

    # ── Step 5: Build response ──────────────────────────────────────
    latency_ms = int((time.time() - start_time) * 1000)
    detected_lang = _detect_user_lang(user_input, state)

    # End the root trace and flush all pending data to Langfuse
    if trace and hasattr(trace, 'end'):
        try:
            trace.end()
        except Exception:
            pass
    flush()

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
        "language": detected_lang,
    }


# ── Action executor ─────────────────────────────────────────────────────
async def execute_action(
    session_id: str,
    plan: Dict[str, Any],
    state: Dict[str, Any],
    user_input: str | None = None,
) -> Dict[str, Any]:
    """Execute the action returned by the ordering agent."""
    lang = _detect_user_lang(user_input, state)
    action = plan.get("action", "respond")

    # ── Map hallucinated tool actions to tool_call ──────────────────
    legacy_tool_actions = [
        "add_to_cart", "vector_search", "lookup_by_indication", 
        "get_inventory", "get_tier1_alternatives"
    ]
    if action in legacy_tool_actions:
        plan["tool"] = action
        action = "tool_call"
        
    # ── tool_call ───────────────────────────────────────────────────
    if action == "tool_call":
        return await execute_tool_call(session_id, plan, state, lang)

    # ── ask_rx ──────────────────────────────────────────────────────
    if action == "ask_rx":
        med = plan.get("medication") or {}
        # Resolve medication from session state if LLM didn't provide ID
        if not med.get("id"):
            med = (
                state.get("selected_medication")
                or state.get("pending_rx_check")
                or (state.get("candidates", [{}])[0] if state.get("candidates") else {})
            ) or med
        update_session_state(session_id, {
            "pending_rx_check": med or None,
            "selected_medication": med or None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        default_msg = _localize("ask_rx", lang, med=med.get("brand_name", "This medication"))
        return {
            "message": plan.get("message", default_msg),
            "tts_message": plan.get("tts_message", plan.get("message", default_msg)),
            "action_taken": "ask_rx",
            "needs_input": True,
        }

    # ── ask_quantity ────────────────────────────────────────────────
    if action == "ask_quantity":
        med = plan.get("medication") or {}
        # Resolve medication from session state if LLM didn't provide ID
        if not med.get("id"):
            med = (
                state.get("selected_medication")
                or state.get("pending_add_confirm")
                or state.get("pending_qty_dose_check")
                or (state.get("candidates", [{}])[0] if state.get("candidates") else {})
            ) or med
        update_session_state(session_id, {
            "pending_qty_dose_check": med or None,
            "selected_medication": med or None,
            "pending_add_confirm": None,
            "pending_rx_check": None,
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        default_msg = _localize("ask_quantity", lang, med=med.get("brand_name", "this medication"))
        return {
            "message": plan.get("message", default_msg),
            "tts_message": plan.get("tts_message", plan.get("message", default_msg)),
            "action_taken": "ask_quantity",
            "needs_input": True,
        }

    # ── ask_dose ────────────────────────────────────────────────────
    if action == "ask_dose":
        med = plan.get("medication") or {}
        # Resolve medication from session state if LLM didn't provide ID
        if not med.get("id"):
            med = (
                state.get("selected_medication")
                or state.get("pending_qty_dose_check")
                or (state.get("candidates", [{}])[0] if state.get("candidates") else {})
            ) or med
        qty = plan.get("quantity", 1)
        update_session_state(session_id, {
            "pending_qty_dose_check": med or None,
            "collected_quantity": qty,
        })
        default_msg = _localize("ask_dose", lang, med=med.get("brand_name", "this medication"))
        return {
            "message": plan.get("message", default_msg),
            "tts_message": plan.get("tts_message", plan.get("message", default_msg)),
            "action_taken": "ask_dose",
            "needs_input": True,
        }

    # ── checkout / confirm_checkout ──────────────────────────────────
    if action in ("checkout", "confirm_checkout"):
        # Search ALL recent conversation history for a delivery address
        delivery_address = state.get("pending_checkout_address")
        history = state.get("conversation_history", [])
        if not delivery_address:
            import re as _re
            for msg in reversed(history):
                if msg.get("role") == "user":
                    content = msg.get("content", "")
                    lower = content.lower()
                    if "deliver to:" in lower or "delivery address" in lower:
                        addr_match = _re.search(
                            r'deliver(?:y\s+address)?\s*(?:to)?\s*:?\s*(.+)',
                            content, _re.IGNORECASE | _re.DOTALL,
                        )
                        delivery_address = addr_match.group(1).strip() if addr_match else content
                        break

        # If we have an address OR this is confirm_checkout OR pending_checkout_confirm is set, execute
        should_execute = bool(delivery_address) or action == "confirm_checkout" or state.get("pending_checkout_confirm")

        if should_execute:
            if delivery_address:
                update_session_state(session_id, {"pending_checkout_address": delivery_address})

            customer_id = state.get("customer_id") or 2
            result = await checkout(session_id, customer_id=customer_id, delivery_address=delivery_address)
            if result.get("error"):
                empty_msg = _localize("checkout_empty", lang)
                return {
                    "message": empty_msg,
                    "tts_message": empty_msg,
                    "action_taken": "checkout_failed",
                    "needs_input": True,
                }

            # Build final COD order confirmation message
            order_id = result.get("order_id", "N/A")
            items_summary = ", ".join(
                f"{item.get('brand_name', 'Item')} x{item.get('quantity', 1)}"
                for item in result.get("items", [])
            )
            total = result.get("total", 0)
            addr_display = delivery_address or "your registered address"

            confirm_msg = (
                f"Order #{order_id} has been confirmed.\n\n"
                f"Items: {items_summary}\n"
                f"Total: \u20ac{total:.2f}\n"
                f"Delivery to: {addr_display}\n"
                f"Payment method: Cash on Delivery (COD)\n\n"
                f"Your order has been placed and your account updated. "
                f"Thank you for choosing Mediloon."
            )
            tts_msg = (
                f"Order number {order_id} confirmed! "
                f"Payment is Cash on Delivery. "
                f"Thank you for ordering with Mediloon!"
            )

            # Clear checkout state
            update_session_state(session_id, {
                "pending_checkout_address": None,
                "pending_checkout_confirm": None,
            })

            return {
                "message": confirm_msg,
                "tts_message": tts_msg,
                "action_taken": "checkout",
                "order": result,
                "end_conversation": True,
            }
        else:
            # No address yet — signal frontend to run login → address → checkout flow
            cart_data = await get_cart(session_id)
            if not cart_data.get("items"):
                empty_msg = _localize("checkout_empty", lang)
                return {
                    "message": empty_msg,
                    "tts_message": empty_msg,
                    "action_taken": "checkout_failed",
                    "needs_input": True,
                }
            # Mark checkout as pending so next confirmation closes the loop
            update_session_state(session_id, {"pending_checkout_confirm": True})
            start_msg = _localize("checkout_start", lang)
            return {
                "message": plan.get("message", start_msg),
                "tts_message": plan.get("tts_message", plan.get("message", start_msg)),
                "cart": cart_data,
                "action_taken": "checkout_ready",
                "needs_input": True,
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
    lang: str,
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
            fallback_msg = _localize("lookup_empty", lang, indication=indication)
            return {
                "message": plan.get("message", fallback_msg),
                "tts_message": plan.get("tts_message", fallback_msg),
                "candidates": [],
                "action_taken": "lookup_empty",
            }
        update_session_state(session_id, {
            "candidates": results,
            "pending_rx_check": None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
        })
        med_list = "\n".join(_fmt_candidate(i, m, lang) for i, m in enumerate(results[:5]))
        # Always build the real medication list — never trust the LLM's placeholder message
        lead = _localize("indication_lead", lang, indication=indication)
        select_prompt = _localize("select_prompt", lang)
        msg = f"{lead}\n{med_list}\n\n{select_prompt}"
        tts = plan.get("tts_message") or select_prompt
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
            fallback_msg = plan.get("message") or _localize("search_empty", lang, name=name)
            return {
                "message": fallback_msg,
                "tts_message": plan.get("tts_message", fallback_msg),
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
                msg = plan.get("message") or _localize(
                    "single_rx",
                    lang,
                    med=med["brand_name"],
                    dosage=med.get("dosage", ""),
                    price=float(med.get("price", 0)),
                )
                return {
                    "message": msg,
                    "tts_message": plan.get("tts_message", msg),
                    "candidates": results,
                    "action_taken": "ask_rx",
                }
            else:
                update_session_state(session_id, {
                    "selected_medication": med,
                    "pending_add_confirm": med,
                })
                msg = plan.get("message") or _localize(
                    "single_otc",
                    lang,
                    med=med["brand_name"],
                    dosage=med.get("dosage", ""),
                    price=float(med.get("price", 0)),
                )
                return {
                    "message": msg,
                    "tts_message": plan.get("tts_message", msg),
                    "candidates": results,
                    "action_taken": "search_single",
                }

        med_list = "\n".join(_fmt_candidate(i, m, lang) for i, m in enumerate(results[:5]))
        lead = _localize("search_lead", lang)
        select_prompt = _localize("select_prompt", lang)
        msg = f"{lead}\n{med_list}\n\n{select_prompt}"
        tts = plan.get("tts_message", select_prompt)
        return {
            "message": msg,
            "tts_message": tts,
            "candidates": results[:5],
            "action_taken": "search_multiple",
        }

    # ── add_to_cart ─────────────────────────────────────────────────
    if tool == "add_to_cart":
        med_id = args.get("med_id") or plan.get("med_id")
        if not med_id and plan.get("medication") and isinstance(plan["medication"], dict):
            med_id = plan["medication"].get("id")
            
        qty = args.get("qty") or args.get("quantity") or plan.get("quantity") or plan.get("qty") or 1
        dose = args.get("dose") or plan.get("dose")

        # Validate med_id — if LLM hallucinated, try to resolve from session state
        med = await get_medication_details(med_id) if med_id else None
        if not med:
            # Try selected_medication or pending states first
            fallback_med = (
                state.get("selected_medication")
                or state.get("pending_add_confirm")
                or state.get("pending_qty_dose_check")
            )
            if fallback_med and fallback_med.get("id"):
                med_id = fallback_med["id"]
                med = await get_medication_details(med_id)
            # Try first candidate if still nothing
            if not med:
                candidates = state.get("candidates", [])
                if candidates:
                    med_id = candidates[0]["id"]
                    med = await get_medication_details(med_id)
            if not med:
                msg = _localize("add_not_found", lang)
                return {
                    "message": msg,
                    "tts_message": msg,
                    "action_taken": "add_blocked",
                }

        # Determine whether RX is confirmed from session state instead of assuming True.
        pending = state.get("pending_rx_check")
        rx_confirmed = (not med.get("rx_required", False)) or bool(state.get("rx_verified")) or (pending and pending.get("id") == med.get("id"))
        validation = validate_add_to_cart(med, rx_confirmed=rx_confirmed)

        if not validation.get("allowed"):
            if validation.get("suggest_alternatives"):
                alternatives = await get_tier1_alternatives(med_id)
                if alternatives:
                    update_session_state(session_id, {"candidates": alternatives})
                    # Filter only in-stock alternatives
                    in_stock_alts = [a for a in alternatives if a.get('stock_quantity', 0) > 0]
                    display_alts = in_stock_alts[:3] if in_stock_alts else alternatives[:3]
                    
                    alt_list = "\n".join(_fmt_candidate(i, a, lang) for i, a in enumerate(display_alts))
                    alt_lead = _localize("alt_lead", lang)
                    alt_pick = _localize("alt_pick", lang)
                    msg = f"{validation['message']}\n\n{alt_lead}\n{alt_list}\n\n{alt_pick}"
                    tts = f"{validation['message']} I found {', '.join(a['brand_name'] for a in display_alts[:2])} as alternatives. Interested?"
                    
                    return {
                        "message": msg,
                        "tts_message": tts,
                        "candidates": display_alts,
                        "action_taken": "out_of_stock_alternatives",
                    }
                else:
                    no_alt_msg = _localize("no_alternatives", lang)
                    full_msg = f"{validation['message']} {no_alt_msg}"
                    return {
                        "message": full_msg,
                        "tts_message": plan.get("tts_message", full_msg),
                        "action_taken": "out_of_stock_no_alternatives",
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
            "candidates": [],
            "cart": cart,
        })

        msg = _localize(
            "add_success",
            lang,
            med=med["brand_name"],
            qty=qty,
            plural="s" if qty != 1 else "",
            cart_items=cart["item_count"],
            cart_plural="s" if cart.get("item_count", 0) != 1 else "",
        )
        return {
            "message": msg,
            "tts_message": plan.get("tts_message", msg),
            "cart": cart,
            "candidates": [],
            "action_taken": "add_to_cart",
        }

    # ── get_inventory ───────────────────────────────────────────────
    if tool == "get_inventory":
        med_id = args.get("med_id")
        inv = await get_inventory(med_id)
        name = inv.get('brand_name', 'Item')
        stock = inv.get('stock_quantity', 0)
        if stock > 0:
            msg = _localize("inventory_status", lang, name=name)
        else:
            msg = _localize("inventory_oos", lang, name=name)
        return {
            "message": msg,
            "tts_message": msg,
            "inventory": inv,
            "action_taken": "check_inventory",
            "needs_input": True,
        }

    # ── get_tier1_alternatives ──────────────────────────────────────
    if tool == "get_tier1_alternatives":
        med_id = args.get("med_id")
        alts = await get_tier1_alternatives(med_id)
        if not alts:
            no_alt_msg = plan.get("message") or _localize("no_alternatives", lang)
            return {
                "message": no_alt_msg,
                "tts_message": plan.get("tts_message", no_alt_msg),
                "action_taken": "no_alternatives",
            }
        update_session_state(session_id, {"candidates": alts})
        alt_list = "\n".join(_fmt_candidate(i, a, lang) for i, a in enumerate(alts[:5]))
        alt_lead = _localize("alt_lead", lang)
        alt_pick = _localize("alt_pick", lang)
        return {
            "message": f"{alt_lead}\n{alt_list}\n\n{alt_pick}",
            "tts_message": alt_pick,
            "candidates": alts,
            "action_taken": "show_alternatives",
            "needs_input": True,
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
