"""
Ordering Agent — Pure LLM agent.

Every user message goes through a single LLM call with full conversation
history and current session state.  The LLM decides the action, understands
context ("go on", "ja", "3", "تمام", etc.) in any language without regex.

Design principles
─────────────────
1. ONE LLM call per user turn — no regex, no pattern matching, no NLU.
2. Full conversation history is injected so the model never loses context.
3. The model returns a strict JSON action object.
4. Safety guardrails (input + output) remain outside this agent.
5. The LLM handles ALL languages natively — no hardcoded word lists.
"""

from __future__ import annotations

import json
import re
import time
import httpx
from typing import Any, Dict, List

import sys
sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from config import (
    GROQ_API_KEY,
    GROQ_BASE_URL,
    GROQ_PRIMARY_MODEL,
    GROQ_FALLBACK_MODEL,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    NLU_MODEL,
    NLU_FALLBACK_MODELS,
)

# ── Language-aware fallback messages ────────────────────────────────────
_FALLBACK_MESSAGES = {
    "ar": "أعتذر، أواجه مشكلة في معالجة طلبك حالياً. هل يمكنك المحاولة مرة أخرى؟",
    "de": "Es tut mir leid, ich habe gerade Schwierigkeiten bei der Verarbeitung. Könnten Sie es noch einmal versuchen?",
    "hi": "I'm sorry, I'm having trouble processing that right now. Could you please try again?",
    "en": "I'm having trouble processing that right now. Could you try again?",
}


def _detect_script_language(text: str) -> str:
    """Fast script-based language detection (no LLM needed)."""
    for ch in text:
        # Arabic script
        if "\u0600" <= ch <= "\u06FF" or "\u0750" <= ch <= "\u077F":
            return "ar"
        # Devanagari (Hindi)
        if "\u0900" <= ch <= "\u097F":
            return "hi"
    # Check for German-ish words in Latin text
    lower = text.lower()
    german_cues = ["ich", "brauche", "bitte", "hallo", "tabletten", "warenkorb",
                   "bestellen", "gegen", "möchte", "haben", "etwas", "weiter"]
    if any(w in lower.split() for w in german_cues):
        return "de"
    return "en"


def _get_fallback_response(user_input: str) -> Dict[str, Any]:
    """Return a language-appropriate fallback when all LLM models fail."""
    lang = _detect_script_language(user_input)
    msg = _FALLBACK_MESSAGES.get(lang, _FALLBACK_MESSAGES["en"])
    return {
        "action": "respond",
        "message": msg,
        "tts_message": msg,
        "reasoning": "[FALLBACK] All LLM models failed or timed out",
        "_model_used": "fallback",
        "_detected_lang": lang,
    }

# ── System prompt ───────────────────────────────────────────────────────
ORDERING_SYSTEM_PROMPT = """\
You are **Mediloon**, an AI pharmacist assistant for a German online pharmacy.
You help customers order medications via voice or text in **English, German, Arabic, Hindi, or Hinglish**.

## YOUR CAPABILITIES
- Search medications by name, brand, or indication/symptom
- Show product details (price, stock, package size)
- Add items to cart after confirming quantity
- Handle prescription (RX) checks
- Suggest Tier-1 alternatives (same active ingredient only) when out of stock
- Process checkout

## STRICT SAFETY RULES — NEVER VIOLATE
1. NEVER give medical advice, diagnoses, or dosage recommendations.
2. NEVER recommend antibiotics or any specific drug class.
3. NEVER suggest medications across different active-ingredient classes.
4. If a user asks "which medicine should I take?" or similar, politely decline and ask them to specify the medication name or what their doctor prescribed.
5. Only suggest alternatives that share the SAME active ingredient (Tier-1).
6. For RX-required medications, ALWAYS ask for prescription confirmation before adding to cart.

## LANGUAGE BEHAVIOR
- Detect the user's language from their message.
- ALWAYS reply in the SAME language the user used.
- If user writes in German → reply in German.
- If user writes in Arabic → reply in Arabic.
- If user writes in English → reply in English.
- If user writes in Hindi or Hinglish (Hindi-English mix) → reply in ENGLISH.
  Hindi/Hinglish users understand English, so always respond in English for them.
  Examples of Hinglish: "mujhe paracetamol chahiye", "fever ki medicine do", "cart mein add karo"
- Keep responses concise and natural for voice readability.

## HOW TO RESPOND
Return ONLY a JSON object with these fields:

```json
{
  "action": "<action_type>",
  "message": "<user-facing message in their language>",
  "tts_message": "<shorter version for text-to-speech>",
  "tool": "<tool_name if action=tool_call, else omit>",
  "tool_args": {},
  "medication": {},
  "quantity": null,
  "dose": null,
  "reasoning": "<brief internal reasoning>"
}
```

### Action types:
- `tool_call` — call a tool. Set `tool` and `tool_args`.
  Tools available:
  • `vector_search` — args: `{"name": "<search query>"}`
  • `lookup_by_indication` — args: `{"indication": "<symptom/condition>"}`
  • `add_to_cart` — args: `{"med_id": <int>, "qty": <int>, "dose": "<string>"}`
  • `get_inventory` — args: `{"med_id": <int>}`
  • `get_tier1_alternatives` — args: `{"med_id": <int>}`
- `ask_rx` — ask if user has prescription. Set `medication` to the med object from state.
- `ask_quantity` — ask how many units. Set `medication`.
- `ask_dose` — ask for prescribed dose. Set `medication` and `quantity`.
- `respond` — just reply with a message (greetings, clarifications, etc.).
- `checkout` — process checkout.
- `end` — end/cancel the session.

## CONTEXT UNDERSTANDING — USE THE CONVERSATION HISTORY
You receive the full conversation history. Use it to understand what the user means:
- "yes", "go on", "sure", "ja", "klar", "نعم", "تمام", "yalla" etc. after showing results → user confirms, proceed with the flow.
- A bare number ("2", "three", "drei", "٣") after asking for quantity → that's the quantity.
- "the first one", "number 2", "das zweite" after showing a list → user selected that item.
- "as prescribed", "wie verordnet", "حسب الوصفة" for dose → use "As Prescribed".
- "checkout", "done", "bestellen", "fertig", "اطلب", "order karo" → process checkout.
- "cancel", "stop", "abbrechen", "إلغاء", "band karo", "ruko" → end session.
- Hindi/Hinglish: "haan" = yes, "nahi" = no, "aur do" = give more, "kitna" = how much, "ye wala" = this one, "pehla wala" = the first one.
- If the user says something you don't understand → ask for clarification politely.

When the user confirms after candidates were shown, look at the `medication` field in the
session state (pending_add_confirm, pending_rx_check) to know WHICH medication to act on.
Use the candidate IDs from the session state — do NOT invent IDs.

## IMPORTANT RULES FOR TOOL CALLS
- **ALWAYS translate tool arguments to English.** The database is in English.
  - If user says "mujhe fever hai" → call `lookup_by_indication` with `{"indication": "fever"}`.
  - If user says "kopfschmerzen" → call `lookup_by_indication` with `{"indication": "headache"}`.
- When you need to search for a medication, use `vector_search` with the English medication name if possible.
- When user describes a symptom/condition, use `lookup_by_indication`.
- When adding to cart, use the `med_id` from the candidates/state, NOT a made-up number.
- NEVER hallucinate medication IDs — only use IDs from the session state.

Return ONLY the JSON object. No markdown fences, no explanation outside JSON.
"""


# ── LLM call ────────────────────────────────────────────────────────────

def _parse_llm_content(content: str, model_name: str) -> Dict[str, Any] | None:
    """Parse raw LLM content string into a JSON dict. Returns None on failure."""
    content = content.strip()
    if not content:
        return None

    # Strip markdown fences if model wraps in ```json ... ```
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)

    # Strip <think>...</think> blocks (some models output these)
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    try:
        parsed = json.loads(content)
        parsed["_model_used"] = model_name
        return parsed
    except json.JSONDecodeError:
        # Try extracting a JSON object from within the text
        try:
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if match:
                parsed = json.loads(match.group())
                parsed["_model_used"] = model_name
                return parsed
        except Exception:
            pass
        print(f"[LLM] JSONDecodeError on {model_name}. Raw: {content[:200]}")
        return None


async def _call_groq(
    messages: List[Dict[str, str]],
    timeout: float = 10.0,
) -> Dict[str, Any] | None:
    """
    Try Groq API (primary provider — fast, generous free tier).
    Returns parsed JSON dict on success, None on any failure.
    """
    if not GROQ_API_KEY:
        return None

    groq_models = [GROQ_PRIMARY_MODEL, GROQ_FALLBACK_MODEL]

    for m in groq_models:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{GROQ_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": m,
                        "messages": messages,
                        "temperature": 0.3,
                        "max_tokens": 600,
                    },
                )

            if resp.status_code == 429:
                print(f"[Groq] 429 rate-limited on {m}, trying next...")
                continue

            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                err_msg = data["error"].get("message", str(data["error"])) if isinstance(data["error"], dict) else str(data["error"])
                print(f"[Groq] API error from {m}: {err_msg}")
                continue

            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )

            parsed = _parse_llm_content(content, f"groq/{m}")
            if parsed:
                return parsed

        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            print(f"[Groq] {type(e).__name__} on {m}: {e}")
            continue
        except Exception as e:
            print(f"[Groq] Unexpected error on {m}: {type(e).__name__}: {e}")
            continue

    return None


async def _call_openrouter(
    messages: List[Dict[str, str]],
    timeout: float = 12.0,
) -> Dict[str, Any] | None:
    """
    Try OpenRouter API (secondary fallback).
    Returns parsed JSON dict on success, None on any failure.
    """
    if not OPENROUTER_API_KEY:
        return None

    models_to_try = [NLU_MODEL] + NLU_FALLBACK_MODELS

    for m in models_to_try:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": m,
                        "messages": messages,
                        "temperature": 0.3,
                        "max_tokens": 600,
                    },
                )

            if resp.status_code == 429:
                print(f"[OpenRouter] 429 on {m}, trying next...")
                continue

            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                err_msg = data["error"].get("message", str(data["error"])) if isinstance(data["error"], dict) else str(data["error"])
                print(f"[OpenRouter] API error from {m}: {err_msg}")
                continue

            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )

            parsed = _parse_llm_content(content, m)
            if parsed:
                return parsed

        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            print(f"[OpenRouter] {type(e).__name__} on {m}: {e}")
            continue
        except Exception as e:
            print(f"[OpenRouter] Unexpected error on {m}: {type(e).__name__}: {e}")
            continue

    return None


async def _call_llm(
    messages: List[Dict[str, str]],
    user_input: str = "",
) -> Dict[str, Any]:
    """
    Dual-provider LLM call.

    Priority order:
      1. Groq  (fast ~200-500ms, reliable free tier)
      2. OpenRouter  (fallback, free models often rate-limited)
      3. Language-aware static fallback
    """
    # 1. Try Groq first (fast + reliable)
    result = await _call_groq(messages)
    if result:
        return result

    # 2. Fall back to OpenRouter
    print("[LLM] Groq unavailable, falling back to OpenRouter...")
    result = await _call_openrouter(messages)
    if result:
        return result

    # 3. All providers failed
    print("[LLM] All providers failed — returning static fallback")
    return _get_fallback_response(user_input)


# ── Build prompt messages ───────────────────────────────────────────────

def _build_messages(
    user_input: str,
    state: Dict[str, Any],
) -> List[Dict[str, str]]:
    """
    Build the message list for the LLM.
    System prompt + session state context + conversation history + new user msg.
    """
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": ORDERING_SYSTEM_PROMPT},
    ]

    # Inject current state so the LLM knows what's on screen / pending
    state_context = _build_state_context(state)
    if state_context:
        messages.append({
            "role": "system",
            "content": f"## CURRENT SESSION STATE\n{state_context}",
        })

    # Conversation history (last 10 turns = 20 messages max)
    history = state.get("conversation_history", [])
    for msg in history[-20:]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"],
        })

    # Current user message
    messages.append({"role": "user", "content": user_input})

    return messages


def _build_state_context(state: Dict[str, Any]) -> str:
    """Summarise current session state for the LLM."""
    parts: List[str] = []

    # Candidates currently shown
    candidates = state.get("candidates", [])
    if candidates:
        cand_strs = [
            f"  {i+1}. {c.get('brand_name','')} — {c.get('dosage','')} — "
            f"Stock: {c.get('stock_quantity',0)} — Price: €{c.get('price',0)} — "
            f"RX: {'Yes' if c.get('rx_required') else 'No'} — ID: {c.get('id')}"
            for i, c in enumerate(candidates[:5])
        ]
        parts.append("Candidates currently shown to user:\n" + "\n".join(cand_strs))

    # Pending states
    if state.get("pending_rx_check"):
        med = state["pending_rx_check"]
        parts.append(f"WAITING for RX confirmation for: {med.get('brand_name')} (ID {med.get('id')})")
    if state.get("pending_qty_dose_check"):
        med = state["pending_qty_dose_check"]
        parts.append(f"WAITING for quantity/dose for: {med.get('brand_name')} (ID {med.get('id')})")
    if state.get("pending_add_confirm"):
        med = state["pending_add_confirm"]
        parts.append(f"WAITING for user to confirm adding: {med.get('brand_name')} (ID {med.get('id')})")

    # Collected values
    if state.get("collected_quantity"):
        parts.append(f"Collected quantity so far: {state['collected_quantity']}")
    if state.get("collected_dose"):
        parts.append(f"Collected dose so far: {state['collected_dose']}")

    # Cart summary
    cart = state.get("cart", {})
    if cart.get("items"):
        items = cart["items"]
        parts.append(f"Cart has {len(items)} item(s)")

    # User insights (refill patterns)
    insights = state.get("user_insights")
    if insights and insights.get("patterns"):
        pats = insights["patterns"][:3]
        pat_strs = [
            f"  - {p.get('product_name','?')} (avg every {p.get('avg_days_between',30)} days)"
            for p in pats
        ]
        parts.append("User's refill patterns:\n" + "\n".join(pat_strs))

    return "\n".join(parts)


# ── Public interface ────────────────────────────────────────────────────

async def handle(
    user_input: str,
    state: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Main entry point — called by the orchestrator for every user turn.

    Every message goes to the LLM. No regex. No fast paths.
    The LLM has the full conversation history + state to decide what to do.

    Returns an action dict with at minimum:
      action, message, tts_message, reasoning
    and optionally:
      tool, tool_args, medication, quantity, dose
    """
    start = time.time()

    messages = _build_messages(user_input, state)
    result = await _call_llm(messages, user_input=user_input)

    # Ensure required fields exist
    result.setdefault("action", "respond")
    result.setdefault("message", "How can I help you?")
    result.setdefault("tts_message", result.get("message", ""))
    result.setdefault("reasoning", "")
    result["latency_ms"] = int((time.time() - start) * 1000)

    return result
