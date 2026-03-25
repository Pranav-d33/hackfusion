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
from observability.langfuse_client import (
    get_client as get_langfuse,
    is_enabled as langfuse_enabled,
    start_generation as start_langfuse_generation,
)

# ── Language-aware fallback messages ────────────────────────────────────
_FALLBACK_MESSAGES = {
    "ar": "أعتذر، أواجه مشكلة في معالجة طلبك حالياً. هل يمكنك المحاولة مرة أخرى؟",
    "de": "Es tut mir leid, ich habe gerade Schwierigkeiten bei der Verarbeitung. Könnten Sie es noch einmal versuchen?",
    "hi": "माफ़ कीजिए, अभी आपके अनुरोध को प्रोसेस करने में समस्या आ रही है। कृपया दोबारा कोशिश करें।",
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
    # Check for Hinglish (Hindi in Latin script)
    hinglish_cues = [
        "mujhe", "chahiye", "dawa", "dawai", "dawaiyaan", "karo", "karna",
        "kitna", "kitni", "paas", "hai", "hain", "nahi", "haan", "aapke",
        "kripya", "pehle", "kuch", "wala", "wali", "aur", "dedo", "bhi",
        "liye", "karein", "batao", "batayein", "dikha", "dikhao", "ruko",
        "band", "theek", "sahi", "achha", "checkout", "davaiyaan",
    ]
    words = lower.split()
    if sum(1 for w in words if w in hinglish_cues) >= 2:
        return "hi"
    return "en"


def _get_fallback_response(user_input: str, preferred_language: str | None = None) -> Dict[str, Any]:
    """Return a language-appropriate fallback when all LLM models fail."""
    preferred = (preferred_language or "").strip().lower()
    lang = preferred if preferred in _FALLBACK_MESSAGES else _detect_script_language(user_input)
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
You are **MedAura**, a friendly and professional AI pharmacist assistant for a German online pharmacy.
You help customers order medications via voice or text in **English, German, Arabic, Hindi, or Hinglish**.

## YOUR PHARMACIST PERSONA
- You are warm, caring, and empathetic — like a trusted neighborhood pharmacist.
- When the user's name is known (shown in CURRENT SESSION STATE as "User's name"), ALWAYS greet them by name on your FIRST response. Example: "नमस्ते राहुल! मैं MedAura AI हूँ। आज कैसे मदद कर सकता हूँ?"
- After login or when name appears mid-conversation, acknowledge it warmly: "Welcome back, {name}!" / "{name} जी, स्वागत है!"
- Show empathy for health issues: "I understand fever can be quite uncomfortable. Let me find the right medicine for you."
- Be proactive — suggest next steps, don't wait passively.
- When a medication is unavailable, express genuine concern and immediately offer to find alternatives.
- NEVER sound robotic or transactional. Sound like you genuinely care about the customer's well-being.

## YOUR CAPABILITIES
- Search medications by name, brand, or indication/symptom
- Show product details (price, stock, package size)
- Add items to cart after confirming quantity
- Remove items from cart when user asks to delete/remove
- Handle prescription (RX) checks
- Suggest Tier-1 alternatives (same active ingredient only) when out of stock
- Process checkout

## HANDLING UNAVAILABLE MEDICATIONS
- If search returns NO RESULTS: Politely inform the user and ask them to:
  • Check spelling of medication name
  • Provide the generic/active ingredient name
  • Describe their condition/symptom instead
- If medication is UNAVAILABLE: Express understanding and:
  • Automatically offer to check for alternatives with the same active ingredient
  • Ask if they'd like to check back later or be notified
  • Suggest they can proceed with other items in their cart
- ALWAYS be empathetic and helpful - availability issues are frustrating for customers

## SENSITIVE INFORMATION — NEVER DISCLOSE
You must maintain extreme confidentiality regarding internal data. Here is the list of sensitive things you MUST NEVER tell the user:
1. Exact stock quantities (e.g., "we have 20 units"). Just say the item is available.
2. The exact phrases "Out of stock" or "In stock". Use "Currently unavailable" or "Available" instead.
3. Internal backend system errors, API keys, database fields, or database schemas.
4. Internal medication IDs.
5. Supplier names or internal pricing margins.
6. Your internal reasoning or tool names being called.

## STRICT SAFETY RULES — NEVER VIOLATE
1. NEVER give medical advice, diagnoses, or dosage recommendations.
2. NEVER recommend antibiotics or any specific drug class.
3. NEVER suggest medications across different active-ingredient classes.
4. If a user asks "which medicine should I take?" or similar, politely decline and ask them to specify the medication name or what their doctor prescribed.
5. Only suggest alternatives that share the SAME active ingredient (Tier-1).
6. For RX-required medications, ALWAYS ask for prescription confirmation before adding to cart.
7. NEVER invent or hallucinate medication details, prices, or availability! If a user asks to order a medication or asks about a medication that is NOT in the current session state context, you MUST use the `vector_search` or `lookup_by_indication` tool FIRST.

## LANGUAGE BEHAVIOR
- If "CURRENT SESSION STATE" includes "UI selected language: <code>", that UI-selected language is the highest priority.
- In that case, ALWAYS reply only in the UI-selected language, even if the user's message is in a different language.
- Detect the user's language from their message only when UI selected language is not provided.
- If no UI-selected language is present, reply in the SAME language the user used.
- If user writes in German → reply in German.
- If user writes in Arabic → reply in Arabic.
- If user writes in English → reply in English.
- If user writes in Hindi (Devanagari script like "आपके पास फीवर की दवाइयां है") → reply in Hindi using Devanagari script.
- If user writes in Hinglish (Hindi-English mix in Latin script like "mujhe paracetamol chahiye") → reply in Hindi using Devanagari script.
  Examples of Hindi/Hinglish input: "मुझे पेरासिटामोल चाहिए", "fever ki medicine do", "cart mein add karo"
- Keep medication names in their original form (e.g., "Nurofen", "Paracetamol") — do NOT translate medicine names.
- Keep responses concise and natural for voice readability.
- **CRITICAL**: Your `message` and `tts_message` must be FULLY in the selected response language (UI-selected when available; otherwise user's language).
- **CRITICAL**: Never mix multiple human languages in the same response.
  DO NOT mix English words like "Stock", "Price", "in stock", "Available" into Hindi/Arabic/German responses.
  Use proper translations: "उपलब्ध" not "available", "कीमत" not "price", "स्टॉक" not "stock".

## CONVERSATION FLOW — ALWAYS LEAD THE CONVERSATION
You are a friendly, patient conversational assistant. You must ALWAYS drive the conversation forward.
- Be always patient and polite. If the user repeats a question or asks for options again, gracefully summarize the options instead of getting defensive (NEVER say "I already told you" or "मैंने पहले ही बताया था").
- After showing search results → ask user to pick one: "कौनसी दवा चुनेंगे?" / "Which one would you like?"
- After user selects a product → Check if they specified a quantity. If NOT, ask quantity: "कितनी यूनिट चाहिए?" / "How many units?" (DO NOT say "adding to cart" yet). If they DID specify a quantity, immediately use `add_to_cart`.
- After confirming/receiving quantity → output action `add_to_cart` or ask about prescription if RX required.
- After adding to cart → ask if they need anything else or want to checkout
- **NEVER** just show product info (name, price, availability) and stop. ALWAYS end with a question or next step.
- **NEVER** end your response with availability information alone.
- Every response MUST end with a clear, CONTEXTUALLY RELEVANT question or call-to-action for the user.
  - After search results → "कौनसी दवा पसंद करेंगे?" (Which medicine would you prefer?)
  - After out-of-stock → "क्या मैं विकल्प खोजूँ?" (Shall I look for alternatives?)
  - After adding to cart → "और कुछ चाहिए या चेकआउट करें?" (Need anything else or checkout?)
  - After cart shown → "चेकआउट करें या कुछ बदलाव करना है?" (Checkout or make changes?)
  - NEVER use a generic follow-up that doesn't match what just happened.

## OUT-OF-STOCK AWARENESS
- ALWAYS check the `Stock` field in CURRENT SESSION STATE candidates.
- If a candidate has `Stock: 0`, it is UNAVAILABLE. NEVER suggest adding it to cart.
- When user asks to order an item with `Stock: 0`, IMMEDIATELY tell them it's unavailable and offer to check alternatives.
- NEVER say "adding to cart" or "let me add" for an out-of-stock item.
- Example: "I'm sorry, Paracetamol apodiscounter 500 mg is currently unavailable. Shall I check for alternatives with the same active ingredient?"

## USER-FACING OUTPUT RULES
- Do NOT show internal data like stock quantities, medication IDs, or database fields.
- Show only: medication name, dosage/package size, price, and availability status (available/unavailable).
- Format prices with € symbol.
- Keep `message` concise but detailed enough for the screen.
- **CRITICAL for `message` vs `tts_message` (Voice Output)**: 
  - They should NOT be completely different messages. The `tts_message` MUST be a spoken version of `message` with the exact same core meaning and tone.
  - The `tts_message` MUST BE EXTREMELY SHORT and natural to say aloud.
  - If `message` contains a long list of medications, the `tts_message` should summarize it naturally instead of reading the whole list, but otherwise they must align perfectly.
  - E.g., if showing a list, the `tts_message` should just be: "मुझे ये दवाइयां मिली हैं। कृपया स्क्रीन पर देखकर चुनें।" (I found these medicines. Please select from the screen).
  - **MEDICINE NAMES IN TTS**: You MUST TRANSLITERATE medicine names into the native script of the response language for the `tts_message` so the voice engine reads them correctly.
    - Example (Hindi): "Nurofen 200 mg" -> "न्यूरोफेन 200 मिलीग्राम"
    - Example (Arabic): "Paracetamol 500 mg" -> "باراسيتامول ٥٠٠ مجم"
    - Do this ONLY for the `tts_message`. The regular `message` should retain the original Latin name (e.g. "Nurofen").
- **CRITICAL**: If your action is `ask_quantity`, your message must ONLY ask for the quantity (e.g. "How many units would you like?"). DO NOT say "Adding to cart..." beforehand.

## HOW TO RESPOND
Return ONLY a JSON object with these fields:

```json
{
  "action": "<action_type>",
  "message": "<user-facing message in their language>",
  "tts_message": "<shorter version for text-to-speech>",
  "tool": "<tool_name if action=tool_call, else omit>",
  "tool_args": {},
  "ui_action": "<ui action name if action=ui_action, else omit>",
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
  • `remove_from_cart` — args: `{"cart_item_id": <int>}` (preferred) OR `{"item_name": "<name from cart>"}`
  • `get_inventory` — args: `{"med_id": <int>}`
  • `get_tier1_alternatives` — args: `{"med_id": <int>}`
- `ui_action` — control the user interface. Set `ui_action` to one of:
  • `open_cart`, `close_modal`, `open_my_orders`, `open_upload_prescription`, `open_trace`
  Provide a short verbal confirmation in `tts_message` (e.g., "Closing the window." or "Here is your cart.") and omit the `message` if it's purely a UI change.
- `ask_rx` — ask if user has prescription. Set `medication` to the med object from state.
- `ask_quantity` — ask how many units. Set `medication`. DO NOT say you are adding anything to the cart yet.
- `ask_dose` — ask for prescribed dose. Set `medication` and `quantity`.
- `respond` — just reply with a message (greetings, clarifications, etc.).
- `checkout` — initiate checkout (when user first says "checkout" or similar).
- `confirm_checkout` — **USE THIS when the user confirms an order after being shown delivery details or order summary.**
  This is the FINAL step that places the order. Use when user says "yes", "confirm", "कंफर्म", "ja", "تأكيد", "haan" etc. after seeing their order summary with delivery address.
  We only support Cash on Delivery (COD) — no online payment needed.
- `end` — end/cancel the session.

## CONTEXT UNDERSTANDING — USE THE CONVERSATION HISTORY
You receive the full conversation history. Use it to understand what the user means:
- "yes", "go on", "sure", "ja", "klar", "نعم", "تمام", "yalla" etc. after showing results → user confirms, proceed with the flow.
- A number mentioned in response to quantity (e.g. "2", "3", "15 tablets", "give me 5") → that's the quantity. DO NOT ask quantity again! Return `action: tool_call`, `tool: add_to_cart`, and set `qty`.
- "the first one", "number 2", "das zweite" after showing a list → user selected that item.
- "as prescribed", "wie verordnet", "حسب الوصفة" for dose → use "As Prescribed".
- "checkout", "done", "bestellen", "fertig", "اطلب", "order karo" → use action `checkout`.
- "remove this", "delete from cart", "cart se hatao", "warenkorb entfernen" after cart is shown → use `tool_call` with `tool: "remove_from_cart"` and pass `cart_item_id` (from session state cart list) when possible.
- After showing order summary/delivery details, user says "yes", "confirm", "कंफर्म", "haan", "ja", "bestätigen", "تأكيد", "ok" → use action `confirm_checkout` to finalize the order.
  IMPORTANT: Do NOT keep asking for confirmation in a loop. Once delivery details have been shown and the user confirms, use `confirm_checkout` immediately.
- "cancel", "stop", "abbrechen", "إلغاء", "band karo", "ruko" → end session.
- Hindi/Hinglish: "haan" = yes, "nahi" = no, "aur do" = give more, "kitna" = how much, "ye wala" = this one, "pehla wala" = the first one.
- If the user says something you don't understand → ask for clarification politely.

## ORDER LIMITS — ENFORCE THESE PROACTIVELY
- Each order can contain at most **20 different medicines** (distinct medication types).
- Each medicine line can have at most **10 units**.
- The total cart cannot exceed **30 units** across all items combined.
- If the user tries to add a **21st different medicine**, you MUST tell them clearly (in their language):
  - English: "I'm sorry, you can only have up to 20 different medicines per order."
  - Hindi: "माफ़ कीजिए, एक ऑर्डर में अधिकतम 20 अलग-अलग दवाइयाँ ही जोड़ी जा सकती हैं।"
  - German: "Leider kannst du maximal 20 verschiedene Medikamente pro Bestellung hinzufügen."
  - Arabic: "عذراً، يمكنك إضافة 20 نوع مختلف من الأدوية كحد أقصى لكل طلب."
  - Then offer to checkout with what's in the cart, or remove an item first.
- NEVER try to call `add_to_cart` if you know the cart already has 20 different medicines.
- If the system returns a warning that the order limit is reached, relay the message in the user's language clearly.

## CHECKOUT FLOW
1. User says "checkout" → return `action: "checkout"`. The system will ask for login/address.
2. System sends "Checkout. Deliver to: <address>" → return `action: "checkout"` again. The system will show order summary.
3. User confirms ("confirm", "कंफर्म", "yes", "haan", "ja") → return `action: "confirm_checkout"`. This finalizes the order.
   Payment is always Cash on Delivery (COD). Do NOT ask about payment method.
   NEVER loop back to "Let me start checkout" after the user has already confirmed.
## EXAMPLE RESPONSES FOR UNAVAILABLE ITEMS:
- NOT FOUND: "I couldn't find [medication name] in our inventory. Could you double-check the spelling, or would you like to describe what you need it for?"
- UNAVAILABLE (no alternatives): "I'm sorry, [medication name] is currently unavailable. Would you like me to check when it will be available again?"
- UNAVAILABLE (with alternatives): "Unfortunately [medication name] is currently unavailable. However, I found [alternative name] which has the same active ingredient. Would you like to see this option?"

When the user confirms after candidates were shown, look at the `medication` field in the
session state (pending_add_confirm, pending_rx_check) to know WHICH medication to act on.
Use the candidate IDs from the session state — do NOT invent IDs.

## IMPORTANT RULES FOR TOOL CALLS
- **ALWAYS translate tool arguments to English.** The database is in English.
  - If user says "mujhe fever hai" → call `lookup_by_indication` with `{"indication": "fever"}`.
  - If user says "kopfschmerzen" → call `lookup_by_indication` with `{"indication": "headache"}`.
- IF a user asks to add a medication but it is NOT in the CURRENT SESSION STATE candidates (check BOTH brand_name AND generic_name fields), YOU MUST FIRST use `vector_search` to find it. Do NOT jump straight to `ask_quantity` or `add_to_cart`.
  - However, if a candidate's brand_name OR generic_name contains the medication name the user mentioned, treat it as a MATCH and proceed with that candidate — do NOT re-search.
- **VOICE / STT MISINTERPRETATION AWARENESS**: Users often interact via voice. Speech-to-text frequently produces misspellings or phonetically similar but incorrect names. If the user mentions a medication name that SOUNDS SIMILAR to an existing candidate (e.g. "Neuropen" for "Nurofen", "Iboprofen" for "Ibuprofen", "Paracetamall" for "Paracetamol"), you MUST treat it as the same medication and proceed with the existing candidate. Do NOT re-search for the misspelled name. Use the candidate's ID from the session state.
- When you need to search for a medication, use `vector_search` with the English medication name if possible.
- When user describes a symptom/condition, use `lookup_by_indication`.
- When adding to cart, use the `med_id` from the candidates/state, NOT a made-up number.
- When removing from cart, use `cart_item_id` from the cart list in CURRENT SESSION STATE whenever possible.
- NEVER hallucinate medication IDs or assume they are available — search first.
- NEVER claim that an item was removed unless you actually call `remove_from_cart`.
- When calling a tool, keep your `message` field minimal (e.g., "" or a very brief note). The system will generate a proper response with actual results.
- **CRITICAL for tool call `tts_message`**: Even though `message` is minimal during tool calls, the `tts_message` MUST include the medicine/search term name so the user hears what is being searched. Examples:
  - Searching for Paracetamol → `tts_message`: "मैं पेरासिटामोल खोज रहा हूँ।" (I'm searching for Paracetamol)
  - Searching for fever medicine → `tts_message`: "मैं बुखार की दवाइयाँ खोज रहा हूँ।" (I'm searching for fever medicines)
  - NEVER use generic phrases like "मैं खोज रहा हूँ" (I'm searching) without naming WHAT you're searching for.

Return ONLY the JSON object. No markdown fences, no explanation outside JSON.

## EXAMPLE GOOD vs BAD RESPONSES (Hindi)
BAD (just dumps info, no question, no med name in TTS): 
{"message": "Nurofen 200 mg — Available — Price: €10.98", "tts_message": "Nurofen 200 mg — Available — Price: €10.98"}

GOOD (leads forward, medicine name transliterated in TTS): 
{"message": "बुखार के लिए ये दवाइयाँ उपलब्ध हैं:\n1. Nurofen 200 mg (12 tablets) — €10.98 — उपलब्ध\n\nकौन सी दवा पसंद करेंगे?", "tts_message": "बुखार के लिए न्यूरोफेन 200 मिलीग्राम उपलब्ध है, कीमत लगभग 11 यूरो। कौन सी दवा कार्ट में जोड़ूं?"}

BAD (English in Hindi mode, TTS has no medicine name): 
{"message": "Nurofen is available.", "tts_message": "दवा उपलब्ध है। क्या कार्ट में जोड़ूं?"}

GOOD (proper Hindi, medicine name in TTS, contextual follow-up): 
{"message": "Nurofen (12 tablets) €10.98 पर उपलब्ध है। क्या इसे कार्ट में जोड़ दूँ?", "tts_message": "न्यूरोफेन 200 मिलीग्राम उपलब्ध है, लगभग 11 यूरो में। क्या कार्ट में जोड़ूं?"}

BAD (tool call TTS without medicine name):
{"action": "tool_call", "tool": "vector_search", "message": "", "tts_message": "मैं खोज रहा हूँ।"}

GOOD (tool call TTS WITH medicine name):
{"action": "tool_call", "tool": "vector_search", "message": "", "tts_message": "मैं पेरासिटामोल खोज रहा हूँ।"}

BAD (out-of-stock but says adding):
{"action": "add_to_cart", "message": "पेरासिटामोल को कार्ट में जोड़ रहा हूँ।"}

GOOD (out-of-stock handled properly):
{"action": "respond", "message": "Paracetamol apodiscounter 500 mg फिलहाल उपलब्ध नहीं है। क्या मैं समान सक्रिय घटक वाले विकल्प खोजूँ?", "tts_message": "पेरासिटामोल फिलहाल स्टॉक में नहीं है। क्या मैं आपके लिए कोई विकल्प खोजूँ?"}
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
            
        print(f"[LLM] JSONDecodeError on {model_name}. Attempting aggressive fallback parsing. Raw: {content[:200]}")
        return {
            "action": "respond",
            "message": content.strip()[:500],
            "tts_message": content.strip()[:200],  # Keep TTS short
            "reasoning": "Fallback JSON created from plain text due to DecodeError",
            "_model_used": f"{model_name}_forced_json_fallback"
        }

async def _call_groq(
    messages: List[Dict[str, str]],
    timeout: float = 10.0,
    trace_id: str | None = None,
) -> Dict[str, Any] | None:
    """
    Try Groq API (primary provider - fast, generous free tier).
    Returns parsed JSON dict on success, None on any failure.
    """
    if not GROQ_API_KEY:
        return None

    groq_models = [GROQ_PRIMARY_MODEL, GROQ_FALLBACK_MODEL, "llama-3.2-11b-vision-preview", "mixtral-8x7b-32768"]
    langfuse = get_langfuse() if langfuse_enabled() else None

    for m in groq_models:
        generation = None
        start_time = time.time()
        try:
            # Start Langfuse generation span
            if langfuse and trace_id:
                generation = start_langfuse_generation(
                    trace_id=trace_id,
                    name="groq_llm_call",
                    model=m,
                    input=messages,
                    metadata={"provider": "groq", "temperature": 0.3, "max_tokens": 600},
                )

            async with httpx.AsyncClient(timeout=timeout) as client:
                    json_payload = {
                        "model": m,
                        "messages": messages,
                        "temperature": 0.3,
                        "max_tokens": 600,
                    }
                    if "llama" in m.lower() or "mixtral" in m.lower():
                        json_payload["response_format"] = {"type": "json_object"}

                    resp = await client.post(
                        f"{GROQ_BASE_URL}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {GROQ_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=json_payload,
                    )

            if resp.status_code == 429:
                print(f"[Groq] 429 rate-limited on {m}, trying next...")
                if generation:
                    try:
                        generation.end(level="WARNING", status_message="Rate limited")
                    except: pass
                continue

            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                err_msg = data["error"].get("message", str(data["error"])) if isinstance(data["error"], dict) else str(data["error"])
                print(f"[Groq] API error from {m}: {err_msg}")
                if generation:
                    try:
                        generation.update(level="ERROR", status_message=err_msg)
                        generation.end()
                    except: pass
                continue

            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            usage = data.get("usage", {})

            # Log successful generation to Langfuse
            if generation:
                try:
                    generation.update(
                        output=content,
                        usage={
                            "input": usage.get("prompt_tokens", 0),
                            "output": usage.get("completion_tokens", 0),
                            "total": usage.get("total_tokens", 0),
                        },
                        metadata={"latency_ms": int((time.time() - start_time) * 1000)}
                    )
                    generation.end()
                except Exception as e:
                    print(f"[Langfuse] Failed to end generation: {e}")
            
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
    trace_id: str | None = None,
) -> Dict[str, Any] | None:
    """
    Try OpenRouter API (secondary fallback).
    Returns parsed JSON dict on success, None on any failure.
    """
    if not OPENROUTER_API_KEY:
        return None

    models_to_try = [NLU_MODEL] + NLU_FALLBACK_MODELS
    langfuse = get_langfuse() if langfuse_enabled() else None

    for m in models_to_try:
        generation = None
        start_time = time.time()
        try:
            # Start Langfuse generation span
            if langfuse and trace_id:
                generation = start_langfuse_generation(
                    trace_id=trace_id,
                    name="openrouter_llm_call",
                    model=m,
                    input=messages,
                    metadata={"provider": "openrouter", "temperature": 0.3, "max_tokens": 600},
                )

            async with httpx.AsyncClient(timeout=timeout) as client:
                    json_payload = {
                        "model": m,
                        "messages": messages,
                        "temperature": 0.3,
                    }
                    if "gemini" not in m.lower():
                        json_payload["max_tokens"] = 600
                    if "llama" in m.lower() or "mistral" in m.lower() or "mixtral" in m.lower():
                        json_payload["response_format"] = {"type": "json_object"}

                    resp = await client.post(
                        f"{OPENROUTER_BASE_URL}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=json_payload,
                    )

            if resp.status_code == 429:
                print(f"[OpenRouter] 429 on {m}, trying next...")
                if generation:
                    try:
                        generation.update(level="WARNING", status_message="Rate limited")
                        generation.end()
                    except: pass
                continue

            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                err_msg = data["error"].get("message", str(data["error"])) if isinstance(data["error"], dict) else str(data["error"])
                print(f"[OpenRouter] API error from {m}: {err_msg}")
                if generation:
                    try:
                        generation.update(level="ERROR", status_message=err_msg)
                        generation.end()
                    except: pass
                continue

            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            usage = data.get("usage", {})

            # Log successful generation to Langfuse
            if generation:
                try:
                    generation.update(
                        output=content,
                        usage={
                            "input": usage.get("prompt_tokens", 0),
                            "output": usage.get("completion_tokens", 0),
                            "total": usage.get("total_tokens", 0),
                        },
                        metadata={"latency_ms": int((time.time() - start_time) * 1000)}
                    )
                    generation.end()
                except Exception as e:
                    print(f"[Langfuse] Failed to end generation: {e}")

            parsed = _parse_llm_content(content, m)
            if parsed:
                return parsed

        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            print(f"[OpenRouter] {type(e).__name__} on {m}: {e}")
            if generation:
                try:
                    generation.update(level="ERROR", status_message=str(e))
                    generation.end()
                except: pass
            continue
        except Exception as e:
            if generation:
                try:
                    generation.update(level="ERROR", status_message=str(e))
                    generation.end()
                except: pass
            print(f"[OpenRouter] Unexpected error on {m}: {type(e).__name__}: {e}")
            continue

    return None


async def _call_llm(
    messages: List[Dict[str, str]],
    user_input: str = "",
    preferred_language: str | None = None,
    trace_id: str | None = None,
) -> Dict[str, Any]:
    """
    Dual-provider LLM call.

    Priority order:
      - Groq (fast, reliable free tier)
      - OpenRouter (fallback, free models often rate-limited)
      - Language-aware static fallback
    """
    # 1. Try Groq first (fast + reliable)
    result = await _call_groq(messages, trace_id=trace_id)
    if result:
        return result

    # 2. Fall back to OpenRouter
    print("[LLM] Groq unavailable, falling back to OpenRouter...")
    result = await _call_openrouter(messages, trace_id=trace_id)
    if result:
        return result

    # 3. All providers failed
    print("[LLM] All providers failed — returning static fallback")
    return _get_fallback_response(user_input, preferred_language=preferred_language)


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

    preferred_lang = str(state.get("preferred_language") or "").strip().lower()
    preferred_label = {
        "en": "English",
        "de": "German",
        "ar": "Arabic",
        "hi": "Hindi",
    }.get(preferred_lang)
    if preferred_label:
        messages.append({
            "role": "system",
            "content": (
                f"## LANGUAGE OVERRIDE\n"
                f"The user has selected {preferred_label} in the app UI.\n"
                f"You MUST respond ONLY in {preferred_label} for both `message` and `tts_message`.\n"
                f"Do not auto-switch language based on user text unless the selected UI language changes."
            ),
        })

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
            f"  {i+1}. {c.get('brand_name','')} (generic: {c.get('generic_name','')}) — {c.get('dosage','')} — "
            f"Stock: {c.get('stock_quantity',0)} — Price: €{c.get('price',0)} — "
            f"RX: {'Yes' if c.get('rx_required') else 'No'} — ID: {c.get('id')}"
            for i, c in enumerate(candidates[:5])
        ]
        parts.append("Candidates currently shown to user:\n" + "\n".join(cand_strs))

    # Pending states
    if state.get("customer_name"):
        parts.append(f"User's name: {state.get('customer_name')}. Greet or acknowledge them politely.")
    if state.get("preferred_language"):
        parts.append(f"UI selected language: {state.get('preferred_language')}")
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
        distinct_count = len(items)
        limit_note = ""
        if distinct_count >= 18:
            remaining = 20 - distinct_count
            limit_note = f" ⚠️ ORDER LIMIT: {distinct_count}/20 medicines. {remaining} slot(s) left." if remaining > 0 else " ⚠️ ORDER LIMIT REACHED: 20/20 medicines. Cannot add more distinct medicines."
        item_lines = [
            f"  {i+1}. {item.get('brand_name','')} (generic: {item.get('generic_name','')}) — "
            f"Qty: {item.get('quantity', 1)} — CartItemID: {item.get('cart_item_id')} — MedID: {item.get('medication_id')}"
            for i, item in enumerate(items[:10])
        ]
        parts.append(
            f"Cart has {len(items)} item(s) [{distinct_count}/20 distinct medicines]{limit_note}:\n" + "\n".join(item_lines)
        )


    # Checkout state
    if state.get("pending_checkout_confirm"):
        parts.append("CHECKOUT IS PENDING — user needs to confirm. If user says yes/confirm/कंफर्म/haan/ja, use action 'confirm_checkout'.")
    if state.get("pending_checkout_address"):
        parts.append(f"Delivery address on file: {state['pending_checkout_address']}")

    # User insights (refill patterns)
    insights = state.get("user_insights")
    if insights:
        pats = insights.get("patterns", []) if isinstance(insights, dict) else insights
        if isinstance(pats, list) and pats:
            pats = pats[:3]
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
    Main entry point - called by the orchestrator for every user turn.

    Every message goes to the LLM. No regex. No fast paths.
    The LLM has the full conversation history + state to decide what to do.

    Returns an action dict with at minimum:
      action, message, tts_message, reasoning
    and optionally:
      tool, tool_args, medication, quantity, dose
    """
    start = time.time()

    messages = _build_messages(user_input, state)
    trace_id = state.get("trace_id")
    result = await _call_llm(
        messages,
        user_input=user_input,
        preferred_language=state.get("preferred_language"),
        trace_id=trace_id,
    )

    # Ensure required fields exist
    result.setdefault("action", "respond")
    result.setdefault("message", "How can I help you?")
    result.setdefault("tts_message", result.get("message", ""))
    result.setdefault("reasoning", "")
    result["latency_ms"] = int((time.time() - start) * 1000)

    return result
