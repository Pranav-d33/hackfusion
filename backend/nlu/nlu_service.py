"""
NLU Service
Natural Language Understanding using OpenRouter LLM.

LLM-FIRST APPROACH WITH MODEL CASCADE:
- Tier 1: Quick regex for OBVIOUS intents (cancel, checkout, yes+state, bare numbers+state)
- Tier 2: LLM cascade — tries primary model → fallback models on 429/failure
- Tier 3: Multilingual regex fallback (EN + DE + AR keywords) — last resort
- Smart caching for trivial intents (yes/no/checkout/cancel)
"""
from typing import Dict, Any, Optional
import httpx
import json
import re
import sys
import hashlib
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, NLU_MODEL, NLU_FALLBACK_MODELS, NLU_FORCE_REGEX
from nlu.extraction_utils import enhance_nlu_result

# OpenRouter API endpoint
OPENROUTER_CHAT_URL = f"{OPENROUTER_BASE_URL}/chat/completions"

# ============================================================================
# SMART NLU CACHE - Only cache high-confidence, simple intents
# ============================================================================
_nlu_cache: Dict[str, Dict[str, Any]] = {}
CACHEABLE_INTENTS = {"confirm_rx", "deny_rx", "checkout", "cancel"}

def _get_cache_key(text: str) -> str:
    """Generate cache key from normalized input."""
    return hashlib.md5(text.lower().strip().encode()).hexdigest()


# ============================================================================
# POST-LLM VALUE CLEANING
# ============================================================================
# Filler words/phrases that the LLM may leave in the extracted "value"
_FILLER_PREFIXES = [
    "i want to order", "i want to get", "i want to buy", "i want",
    "i need to order", "i need to get", "i need to buy", "i need",
    "can i get", "can i have", "can i order", "can you get me",
    "please give me", "give me", "get me", "order me",
    "i'd like to order", "i'd like", "i would like",
    "to order", "to get", "to buy",
    "order", "buy", "get",
]

_FILLER_SUFFIXES_RE = re.compile(
    r'\s+(\d+)\s*(strip|strips|tab|tabs|tablet|tablets|cap|caps|capsule|capsules|'
    r'bottle|bottles|pack|packs|box|boxes|sachet|sachets|vial|vials|'
    r'ampule|ampules|unit|units|pieces?|nos?|numbers?)\s*$',
    re.IGNORECASE
)

def _clean_nlu_value(nlu_result: dict, raw_input: str) -> dict:
    """
    Clean the extracted 'value' field from LLM NLU output.
    Strips filler words, trailing quantities, and normalizes.
    """
    value = nlu_result.get("value")
    if not value or not isinstance(value, str):
        return nlu_result

    intent = nlu_result.get("intent", "")
    # Only clean values for search-related intents
    if intent not in ("brand_query", "medication_query", "indication_query", "add_to_cart"):
        return nlu_result

    cleaned = value.strip()

    # Strip leading filler phrases (case-insensitive, longest-first)
    lower = cleaned.lower()
    for filler in sorted(_FILLER_PREFIXES, key=len, reverse=True):
        if lower.startswith(filler):
            cleaned = cleaned[len(filler):].strip()
            lower = cleaned.lower()
            break  # Only strip one prefix

    # Strip trailing quantity+unit (e.g., "100 units", "20 strips")
    cleaned = _FILLER_SUFFIXES_RE.sub('', cleaned).strip()

    # Strip leading/trailing "some", "any", "a", "the", "of"
    cleaned = re.sub(r'^(some|any|a|an|the|of)\s+', '', cleaned, flags=re.IGNORECASE).strip()

    # If cleaning left nothing, fall back to original value
    if not cleaned:
        return nlu_result

    nlu_result = nlu_result.copy()
    nlu_result["value"] = cleaned
    if cleaned.lower() != value.lower():
        nlu_result["_original_value"] = value
    return nlu_result

def _should_cache(result: Dict[str, Any]) -> bool:
    """Only cache high-confidence, simple intents without values."""
    return (
        result.get("confidence", 0) > 0.9 and
        result.get("intent") in CACHEABLE_INTENTS and
        result.get("value") is None
    )

# ============================================================================
# NLU SYSTEM PROMPT — LLM-driven, multi-turn context reasoning
# ============================================================================
NLU_SYSTEM_PROMPT = """You are a pharmacy order NLU parser. Users may speak in ANY language (German, Arabic, Hindi, Tamil, French, Spanish, etc.). Understand the meaning regardless of language and ALWAYS respond in English JSON.

Given the conversation so far, classify the LATEST user message into a structured JSON intent.

INTENTS:
- medication_query: user asks about a generic medicine name
- brand_query: user asks about a brand name (ONLY when no candidates have been shown yet)
- indication_query: user describes a condition/symptom (fever, cold, diabetes)
- add_to_cart: user selects/confirms a medicine from shown options (by name, number, or description)
- confirm_rx: user confirms they have a prescription (when asked about prescription)
- deny_rx: user says they don't have a prescription
- quantity_response: user provides a quantity/amount (when asked how many)
- dose_response: user provides dosage info or says "as prescribed"
- just_add_it: user wants to proceed/skip/accept defaults — ANY affirmative continuation
- general_question: user asks a general or medical question (not an order action)
- checkout: user wants to finish/place order
- cancel: user wants to stop/cancel
- unclear: truly cannot determine intent

CRITICAL RULES — REASON FROM CONVERSATION FLOW:
1. If assistant just asked "how many units?", then a number like "20" = quantity_response.
2. If assistant just asked about dosage, any continuation/affirmative = just_add_it.
3. If candidates were shown and user mentions one by name = add_to_cart (NOT brand_query).
4. If user provides medicine name + quantity together (e.g. "crocin 20") = add_to_cart with value = medicine name ONLY.
5. After a general question was answered, "go on" / "ok" / "sure" / "continue" = just_add_it.
6. "yes" after a prescription question = confirm_rx. "yes" after "would you like to add?" = just_add_it.
7. Use the conversation context to determine the CORRECT intent — don't just pattern match the words.

CRITICAL VALUE EXTRACTION RULES:
- "value" must contain ONLY the clean entity (medicine name, condition, or selection). NEVER include filler words.
- Strip ALL filler: "I want to order", "can I get", "please give me", "I need", quantities, units.
- EXAMPLES of correct extraction:
  Input: "i want to order Aveeno Skin Relief Body Lotion 100 units" → value: "Aveeno Skin Relief Body Lotion"
  Input: "can I get some paracetamol" → value: "paracetamol"
  Input: "I need medicine for fever" → value: "fever" (indication_query)
  Input: "order 20 strips of crocin" → value: "crocin"
  Input: "Nurofen 200mg bitte" → value: "Nurofen"
  Input: "ich brauche Panthenol Spray" → value: "Panthenol Spray"
- If user says BOTH a medicine name AND quantity (e.g. "Aveeno 100 units"), set intent=brand_query, value=MEDICINE NAME ONLY.
  The quantity will be extracted separately by the system.

OUTPUT: Return ONLY a valid JSON object, nothing else.
{"intent": "...", "value": "extracted entity or null", "confidence": 0.0-1.0}"""


async def parse_input(user_input: str, conversation_state: dict = None) -> Dict[str, Any]:
    """
    Parse user input into structured intent and entities.
    
    Uses multi-turn conversation history for LLM-driven context reasoning.
    The LLM sees the actual conversation flow and can naturally understand
    what "go on", "sure", or "crocin 20" means from context.
    
    Args:
        user_input: Raw user text input
        conversation_state: Conversation state with history, candidates, pending checks
    
    Returns:
        Parsed NLU result with intent, value, and confidence
    """
    if not user_input or not user_input.strip():
        return {
            "intent": "unclear",
            "value": None,
            "raw_text": user_input,
            "confidence": 0.0,
            "fallback_message": "Hi! I'm your MedAura pharmacist. Just tell me the name of the medication you're looking for, or the health condition you need help with, and I'll find the best options for you!",
        }
    
    # CHECK CACHE FIRST (only for simple stateless intents like "yes", "no")
    cache_key = _get_cache_key(user_input)
    if cache_key in _nlu_cache:
        cached = _nlu_cache[cache_key].copy()
        cached["cached"] = True
        return cached
    
    # TIER 1: Quick regex for OBVIOUS state-dependent intents
    # This avoids burning an LLM call for "yes", "10", "cancel", "checkout"
    tier1 = _tier1_obvious_parse(user_input, conversation_state)
    if tier1 and tier1.get("confidence", 0) >= 0.85:
        return enhance_nlu_result(tier1, user_input)
    
    # If force-regex mode is enabled (for testing), skip LLM entirely
    if NLU_FORCE_REGEX:
        result = _fallback_parse(user_input, conversation_state)
        return enhance_nlu_result(result, user_input)
    
    # TIER 2: LLM CASCADE — try primary model, then fallbacks on 429
    models_to_try = [NLU_MODEL] + NLU_FALLBACK_MODELS + ["openrouter/auto"]
    # De-duplicate and skip obvious vision/VL models for text-only NLU calls
    cleaned_models = []
    seen_models = set()
    for model in models_to_try:
        m = (model or "").strip()
        if not m or m in seen_models:
            continue
        lm = m.lower()
        if any(tag in lm for tag in ["vision", "-vl", "/vl", "multimodal"]):
            print(f"NLU skipping text-incompatible model: {m}")
            continue
        seen_models.add(m)
        cleaned_models.append(m)
    models_to_try = cleaned_models
    
    try:
        # Build multi-turn messages with conversation history
        messages = _build_nlu_messages(user_input, conversation_state)
        
        data = None
        last_err = None
        
        for model in models_to_try:
            for attempt in range(2):  # 2 retries per model
                try:
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        response = await client.post(
                            OPENROUTER_CHAT_URL,
                            headers={
                                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                                "Content-Type": "application/json",
                            },
                            json={
                                "model": model,
                                "messages": messages,
                                "temperature": 0.1,
                                "max_tokens": 200,
                            },
                        )
                        if response.status_code == 429:
                            import asyncio as _aio
                            wait = 1 + attempt
                            print(f"NLU {model} rate-limited, retrying in {wait}s (attempt {attempt+1}/2)")
                            await _aio.sleep(wait)
                            last_err = f"429 rate limited ({model})"
                            continue
                        response.raise_for_status()
                        data = response.json()
                        break
                except httpx.TimeoutException:
                    print(f"NLU {model} timeout (attempt {attempt+1}/2)")
                    last_err = f"timeout ({model})"
                    continue
            
            if data is not None:
                break  # Got a response, stop trying models
            else:
                print(f"NLU model {model} exhausted, trying next...")
        
        if data is None:
            raise Exception(f"NLU request failed across all models: {last_err}")
        
        message = data["choices"][0]["message"]
        content = (message.get("content") or "").strip()
        
        # Some models (thinking/reasoning) put output in 'reasoning' field
        if not content:
            reasoning_text = (message.get("reasoning") or "").strip()
            if reasoning_text:
                content = reasoning_text
        
        # Try to parse JSON from response
        result = _extract_json(content)
        
        if result:
            # Ensure required fields
            result.setdefault("intent", "unclear")
            result.setdefault("value", None)
            result.setdefault("raw_text", user_input)
            result.setdefault("confidence", 0.5)
            
            # POST-LLM VALUE CLEANING: Strip filler words the LLM may have left
            result = _clean_nlu_value(result, user_input)
            
            # Enhance with regex-based dosage/quantity extraction
            result = enhance_nlu_result(result, user_input)
            
            # CACHE HIGH-CONFIDENCE SIMPLE INTENTS
            if _should_cache(result):
                _nlu_cache[cache_key] = result.copy()
            
            return result
        
        # Fallback to regex parsing if JSON extraction failed
        fallback = _fallback_parse(user_input, conversation_state)
        return enhance_nlu_result(fallback, user_input)
        
    except httpx.TimeoutException:
        print(f"NLU Timeout - using fallback parser")
        fallback = _fallback_parse(user_input, conversation_state)
        return enhance_nlu_result(fallback, user_input)
        
    except Exception as e:
        print(f"NLU Error: {e}")
        fallback = _fallback_parse(user_input, conversation_state)
        return enhance_nlu_result(fallback, user_input)


# ============================================================================
# MULTI-TURN MESSAGE BUILDER
# ============================================================================
def _build_nlu_messages(user_input: str, conversation_state: dict = None) -> list:
    """
    Build multi-turn message array for the NLU LLM.
    
    Instead of a single "user_input" message, we pass:
    1. System prompt
    2. Recent conversation history (last 4 messages = ~2 turns)
    3. Current state context (candidates, pending checks)
    4. The actual user input to classify
    
    This lets the LLM naturally reason from the conversation flow.
    """
    messages = [{"role": "system", "content": NLU_SYSTEM_PROMPT}]
    
    if conversation_state:
        # Add recent conversation history as actual chat turns
        history = conversation_state.get("conversation_history", [])
        # Last 4 messages (~2 turns of user+assistant)
        recent = history[-4:] if len(history) > 4 else history
        for msg in recent:
            role = msg.get("role", "user")
            content = msg.get("content", "")[:300]  # Truncate long messages
            if role in ("user", "assistant"):
                messages.append({"role": role, "content": content})
        
        # Add state summary as a system hint
        state_hint = _build_state_hint(conversation_state)
        if state_hint:
            messages.append({"role": "system", "content": state_hint})
    
    # Final message: the user input to classify
    messages.append({"role": "user", "content": f"[CLASSIFY THIS] {user_input.strip()}"})
    
    return messages


def _build_state_hint(conversation_state: dict) -> str:
    """Build a concise state hint so the LLM knows the current flow position."""
    hints = []
    
    candidates = conversation_state.get("candidates", [])
    if candidates:
        names = [c.get("brand_name", "?") for c in candidates[:5]]
        hints.append(f"Candidates shown: [{', '.join(names)}]")
    
    pending_qty = conversation_state.get("pending_qty_dose_check")
    if pending_qty:
        hints.append(f"Collecting qty/dose for: {pending_qty.get('brand_name', '?')}")
    
    pending_add = conversation_state.get("pending_add_confirm")
    if pending_add:
        hints.append(f"Awaiting add confirmation for: {pending_add.get('brand_name', '?')}")
    
    pending_rx = conversation_state.get("pending_rx_check")
    if pending_rx:
        hints.append(f"Awaiting RX confirmation for: {pending_rx.get('brand_name', '?')}")
    
    if not hints:
        return ""
    
    return "STATE: " + " | ".join(hints)


# ============================================================================
# JSON EXTRACTION
# ============================================================================
def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from text, handling markdown code blocks."""
    text = re.sub(r'```json?\s*', '', text)
    text = re.sub(r'```\s*$', '', text)
    text = text.strip()
    
    match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ============================================================================
# REGEX FALLBACK - State-aware, used when LLM fails/times out/rate-limited
# This must be robust enough to handle ALL common user inputs without LLM.
# ============================================================================

# ============================================================================
# TIER 1: Quick regex for OBVIOUS state-dependent intents
# These are patterns where no LLM is needed — saves cost and latency
# ============================================================================

# Multilingual affirmatives
_AFFIRMATIVE_RE = re.compile(
    r'^('
    # English
    r'yes|yeah|yep|yea|sure|ok|okay|go\s*ahead|please|do\s*it|add\s*it|'
    r'go\s*on|continue|proceed|that\s*one|confirm|affirmative|absolutely|'
    r'definitely|of\s*course|yes\s*please|alright|fine|'
    # German (including compound phrases with optional comma)
    r'ja|klar|genau|jawohl|in\s*ordnung|natürlich|selbstverständlich|gut|'
    r'ja[,]?\s*bitte(?:\s*hinzufügen)?|bitte\s*hinzufügen|machen\s*sie|bitte\s*ja|'
    r'hinzufügen|das\s*nehme\s*ich|'
    # Arabic
    r'نعم|أجل|طيب|حسنا|موافق|تمام|أكيد|بالتأكيد|ماشي|اي|ايوه|يعني\s*نعم'
    r')\s*[.!؟?]?\s*$',
    re.IGNORECASE | re.UNICODE
)

# Multilingual cancel patterns
_CANCEL_RE = re.compile(
    r'\b('
    r'cancel|stop|never\s*mind|quit|exit|abort|'
    # German
    r'abbrechen|aufhören|stopp|vergiss\s*es|egal|nicht\s*mehr|'
    # Arabic
    r'إلغاء|توقف|لا\s*أريد|خلاص|مش\s*عايز'
    r')\b',
    re.IGNORECASE | re.UNICODE
)

# Multilingual checkout patterns
_CHECKOUT_RE = re.compile(
    r'\b('
    r'checkout|check\s*out|finish|place\s*order|complete|done|'
    r"that's\s*all|that's\s*it|"
    # German
    r'bezahlen|kasse|fertig|das\s*wäre?\s*alles|'
    # Arabic
    r'ادفع|اطلب|خلص|انتهيت|كفاية'
    r')\b',
    re.IGNORECASE | re.UNICODE
)

# Multilingual denial patterns
_DENY_RE = re.compile(
    r'\b('
    r"no|nope|nah|don't\s*have|do\s*not\s*have|i\s*haven't|"
    # German
    r'nein|habe\s*ich\s*nicht|kein|keine|'
    # Arabic
    r'لا|لأ|ما\s*عندي'
    r')\b',
    re.IGNORECASE | re.UNICODE
)


def _tier1_obvious_parse(user_input: str, conversation_state: dict = None) -> Optional[Dict[str, Any]]:
    """
    Tier 1: Fast regex for OBVIOUS intents that don't need an LLM call.
    Returns None if the input is not obviously classifiable.
    Only returns results with confidence >= 0.85 (high certainty).
    """
    text = user_input.strip()
    state = conversation_state or {}
    pending_add = state.get("pending_add_confirm")
    pending_qty = state.get("pending_qty_dose_check")
    pending_rx = state.get("pending_rx_check")
    has_candidates = bool(state.get("candidates"))

    # 1. Cancel (takes priority)
    if _CANCEL_RE.search(text):
        return {"intent": "cancel", "value": None, "raw_text": user_input, "confidence": 0.95}

    # 2. Checkout
    if _CHECKOUT_RE.search(text):
        return {"intent": "checkout", "value": None, "raw_text": user_input, "confidence": 0.95}

    # 3. Short affirmatives with context
    if _AFFIRMATIVE_RE.match(text.lower()):
        if pending_add:
            return {"intent": "just_add_it", "value": None, "raw_text": user_input, "confidence": 0.95}
        if pending_rx:
            return {"intent": "confirm_rx", "value": None, "raw_text": user_input, "confidence": 0.95}
        if pending_qty:
            return {"intent": "just_add_it", "value": None, "raw_text": user_input, "confidence": 0.90}
        if has_candidates:
            return {"intent": "add_to_cart", "value": "1", "raw_text": user_input, "confidence": 0.85}

    # 4. Short denial with context
    if _DENY_RE.match(text.lower()) and len(text) < 25:
        if pending_rx:
            return {"intent": "deny_rx", "value": None, "raw_text": user_input, "confidence": 0.95}

    # 5. Bare number (quantity or selection)
    bare = re.match(r'^(\d+)\s*(st(?:ück)?|unit|units|pack|packs|tab|tabs|strip|strips)?\s*$',
                    text, re.IGNORECASE)
    if bare:
        num = bare.group(1)
        if pending_qty:
            return {"intent": "quantity_response", "value": num, "raw_text": user_input, "confidence": 0.95}
        if has_candidates:
            return {"intent": "add_to_cart", "value": num, "raw_text": user_input, "confidence": 0.90}

    # 6. "As prescribed" / dose response (multilingual)
    if pending_qty and state.get("collected_quantity"):
        if re.search(r'(as\s*prescribed|wie\s*verordnet|wie\s*verschrieben|حسب\s*الوصفة|كما\s*وصف)', text, re.IGNORECASE):
            return {"intent": "dose_response", "value": "As Prescribed", "raw_text": user_input, "confidence": 0.95}
        dose_match = re.search(r'(\d+(?:\.\d+)?)\s*(mg|ml|mcg|g)\b', text, re.IGNORECASE)
        if dose_match:
            return {"intent": "dose_response", "value": dose_match.group(0), "raw_text": user_input, "confidence": 0.90}

    # 7. Ordinal selection from candidates (multilingual)
    if has_candidates:
        sel = re.search(
            r'\b(first|second|third|1st|2nd|3rd|'
            r'erst(?:e[ns]?)?|zweit(?:e[ns]?)?|dritt(?:e[ns]?)?|'
            r'الأول[ى]?|الثاني[ة]?|الثالث[ة]?|'
            r'number\s*(\d)|option\s*(\d)|#\s*(\d))\b',
            text, re.IGNORECASE | re.UNICODE
        )
        if sel:
            word_map = {'first': '1', '1st': '1', 'second': '2', '2nd': '2', 'third': '3', '3rd': '3',
                        'erste': '1', 'ersten': '1', 'erstes': '1', 'zweite': '2', 'zweiten': '2',
                        'dritte': '3', 'dritten': '3',
                        'الأول': '1', 'الأولى': '1', 'الثاني': '2', 'الثانية': '2', 'الثالث': '3', 'الثالثة': '3'}
            val = word_map.get(sel.group(1).lower(), '')
            if not val:
                val = sel.group(2) or sel.group(3) or sel.group(4) or '1'
            return {"intent": "add_to_cart", "value": val, "raw_text": user_input, "confidence": 0.90}

    # Not obvious — let LLM handle it
    return None


# ============================================================================
# REGEX FALLBACK HELPERS - Filler stripping and product name extraction
# ============================================================================

# Filler words to strip from brand/med queries
_QUERY_FILLER = {
    'i', 'want', 'need', 'have', 'do', 'you', 'the', 'a', 'an', 'some', 'any',
    'medicine', 'medication', 'tablet', 'for', 'get', 'me', 'please', 'to',
    'order', 'buy', 'can', 'could', 'give', 'of', 'my',
    # German filler
    'ich', 'brauche', 'möchte', 'bitte', 'mir', 'ein', 'eine', 'das', 'den',
    'die', 'haben', 'sie', 'gibt', 'es',
    # Adjectives
    'really', 'very', 'severe', 'bad', 'painful', 'symptoms', 'condition',
    # German adjectives
    'starke', 'starken', 'starker', 'starkes', 'schlimme', 'schlimmer',
    # Arabic filler (transliterated for regex)
    'ahtaj', 'urid', 'min', 'fadlak', 'mumkin', 'hal', 'indakum',
}

# Arabic filler words (native script) for stripping
_ARABIC_FILLER_RE = re.compile(
    r'^(أحتاج|أريد|عندي|هل\s+عندكم|ممكن|أعطني|أبغى|ابي|من\s+فضلك|لو\s+سمحت|'
    r'دواء\s+لل?|علاج\s+لل?|شيء\s+لل?|حبوب\s+لل?)\s*',
    re.UNICODE
)

# Arabic script → Latin brand name transliteration map
# Covers common drug names that Arabic speakers write in Arabic script
_ARABIC_BRAND_MAP = {
    'باراسيتامول': 'Paracetamol',
    'نوروفين': 'Nurofen',
    'ايبوبروفين': 'Ibuprofen',
    'أسبرين': 'Aspirin',
    'يوسرين': 'Eucerin',
    'افينو': 'Aveeno',
    'سيتافيل': 'Cetaphil',
    'بانتينول': 'Panthenol',
    'بيبانثين': 'Bepanthen',
    'فيتامين': 'Vitamin',
    'فيتامينات': 'Vitamin',
    'مينوكسيديل': 'Minoxidil',
    'اوميغا': 'Omega',
    'بروبيوتيك': 'Probiotic',
    'ماغنيسيوم': 'Magnesium',
    'سينوبريت': 'Sinupret',
    'لوبيراميد': 'Loperamid',
}

# Order-intent prefix patterns (to strip)
# Longer specific patterns must come before shorter general ones
_ORDER_PREFIX_PATTERNS = [
    r'^i\s+want\s+to\s+(order|get|buy)\s+',
    r'^i\s+need\s+to\s+(order|get|buy)\s+',
    r'^i\s+need\s+(some)?\s*(thing|medication|medicine)\s+for\s+',
    r'^do\s+you\s+have\s+(any)?\s*(thing|medication|medicine)\s+for\s+',
    r'^i\s+(need|want)\s+',
    r'^(can|could)\s+(i|you)\s+(get|have|order|give)\s*(me\s+)?',
    r'^(give|get|order|buy)\s+me\s+',
    r'^(to\s+)?(order|buy|get)\s+',
    r'^(do\s+you\s+have|have\s+you\s+got)\s+',
    r'^please\s+(give|get|order)\s*(me\s+)?',
    r'^(i\s+have|i\s*\'ve\s+got)\s+(a\s+)?',
    r'^i\s+need\s+(some)?\s*(thing|medication|medicine)\s+for\s+',
    r'^do\s+you\s+have\s+(any)?\s*(thing|medication|medicine)\s+for\s+',
    # English colloquial
    r'^(hey[,!]?\s*)?(got|have)\s+(anything|something)\s+for\s+',
    r'^(anything|something)\s+for\s+(a\s+)?',
    r'^what\s+do\s+you\s+(have|recommend)\s+for\s+',
    r'^what\s+(can|would)\s+you\s+(recommend|suggest|give)\s*(me\s+)?for\s+',
    r'^(i\s+am|i\'m)\s+(having|suffering\s+from|dealing\s+with)\s+',
    r'^i\s+suffer\s+from\s+',
    # German
    r'^ich\s+(brauche|möchte|will|hätte\s+gern[e]?)\s+',
    r'^(haben\s+sie|gibt\s+es)\s+(etwas\s+)?(für|gegen)\s+',
    r'^ich\s+habe\s+(einen?\s+|eine\s+)?(starke[ns]?\s+|schlimme[ns]?\s+|leichte[ns]?\s+)?',
    r'^(was\s+)?(können|empfehlen)\s+sie\s+(mir\s+)?(für|gegen)\s+',
    r'^ich\s+leide\s+(unter|an)\s+',
    r'^bitte\s+',
    # Arabic prefix stripping (common sentence starters)
    r'^(أحتاج|أريد|عندي|عندكم|أعطني|ممكن|هل\s+عندكم|أبغى|ابي)\s+',
    r'^(من\s+فضلك|لو\s+سمحت)\s+',
]

# Quantity + unit suffix pattern
_QTY_SUFFIX_RE = re.compile(
    r'\s+\d+\s*(strip|strips|tab|tabs|tablet|tablets|cap|caps|capsule|capsules|'
    r'bottle|bottles|pack|packs|box|boxes|sachet|sachets|vial|vials|'
    r'ampule|ampules|unit|units|pieces?|nos?|numbers?|mg|ml|st|stück)\s*$',
    re.IGNORECASE
)

def _extract_clean_product_name(text: str) -> str:
    """Extract a clean product name from user text by stripping filler."""
    cleaned = text.strip()
    lower = cleaned.lower()

    # Strip order-intent prefixes
    for pattern in _ORDER_PREFIX_PATTERNS:
        new = re.sub(pattern, '', lower, flags=re.IGNORECASE).strip()
        if new != lower:
            # Preserve original casing by stripping same number of chars
            chars_removed = len(lower) - len(new)
            cleaned = cleaned[chars_removed:].strip()
            lower = cleaned.lower()
            break

    # Strip trailing quantity+unit
    m = _QTY_SUFFIX_RE.search(cleaned)
    if m:
        cleaned = cleaned[:m.start()].strip()

    # Strip trailing bare number
    cleaned = re.sub(r'\s+\d+\s*$', '', cleaned).strip()

    # Strip leading articles/fillers
    cleaned = re.sub(r'^(some|any|a|an|the|of|ein|eine|einen|das)\s+', '', cleaned, flags=re.IGNORECASE).strip()
    
    # Strip Arabic filler
    cleaned = _ARABIC_FILLER_RE.sub('', cleaned).strip()
    
    # Transliterate Arabic brand names to Latin
    for arabic, latin in _ARABIC_BRAND_MAP.items():
        if arabic in cleaned:
            cleaned = cleaned.replace(arabic, latin).strip()

    # Strip common adjectives / filler words often used with indications (iterative)
    cleaned = re.sub(r'^((really|very|bad|severe|mild|extreme|symptoms|of|condition)\s+)+', '', cleaned, flags=re.IGNORECASE).strip()
    # Arabic adjectives: شديد (severe), قوي (strong), خفيف (mild)
    cleaned = re.sub(r'\s*(شديد[ة]?|قوي[ة]?|خفيف[ة]?)\s*', ' ', cleaned).strip()

    # Strip conversational suffix like ", what can you give me?" or "please"
    # English
    cleaned = re.sub(r'[?!.,;:]\s+(what|can|how|where)\s+.*$', '', cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r'\s+(please|thanks|thank\s*you)\s*[.!?]?$', '', cleaned, flags=re.IGNORECASE).strip()
    # German question suffix: "was können Sie mir empfehlen", "was gibt es", "was haben Sie"
    cleaned = re.sub(r'[,;:]\s*(was|können|empfehlen|gibt|haben)\s+.*$', '', cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r'\s+(bitte|danke)\s*[.!?]?$', '', cleaned, flags=re.IGNORECASE).strip()
    # Arabic question suffix
    cleaned = re.sub(r'[,،;:]\s*(ماذا|ايش|شو|من\s+فضلك|لو\s+سمحت)\s*.*$', '', cleaned, flags=re.IGNORECASE).strip()
    
    # Strip question framing from middle if present
    # e.g. "I need skin cream, do you have Eucerin?" -> "Eucerin" (this is risky, maybe just keep Eucerin?)
    # or "do you have Eucerin" -> "Eucerin"
    m = re.search(r'\b(do|can|could)\s+you\s+(have|get|give)\s+', cleaned, re.IGNORECASE)
    if m:
        # If match is at start, it's already handled by prefix loop (or should be).
        # If match is in middle, take what's AFTER it?
        # "I need skin cream, do you have Eucerin" -> "Eucerin"
        # "I have a fever, what can you give me" -> "I have a fever" (handled by suffix strip above)
        start, end = m.span()
        if start > 0:
            # We have a specific question in the second half. Use only the second half?
            # Or is the first half the important one?
            # "I need X, do you have Y?" -> usually Y is the specific request.
            second_part = cleaned[end:].strip()
            if second_part:
                cleaned = second_part

    # Strip trailing punctuation
    cleaned = cleaned.rstrip('?!.,;:')

    # Strip trailing German verb suffixes like "bestellen" (to order), "kaufen" (to buy)
    cleaned = re.sub(r'\s+(bestellen|kaufen|haben|bekommen)\s*$', '', cleaned, flags=re.IGNORECASE).strip()

    return cleaned.strip() if cleaned.strip() else text.strip()


def _fallback_parse(user_input: str, conversation_state: dict = None) -> Dict[str, Any]:
    """
    State-aware regex fallback parsing.
    Must handle ALL common inputs reliably when LLM is unavailable.
    """
    text = user_input.lower().strip()
    
    # Strip some common punctuation for matching
    clean_text = re.sub(r'[,.\?!]', '', text)
    
    state = conversation_state or {}
    has_candidates = bool(state.get("candidates"))
    pending_add = state.get("pending_add_confirm")
    pending_qty = state.get("pending_qty_dose_check")
    pending_rx = state.get("pending_rx_check")

    # ---- 1. CANCEL (check first — takes priority, multilingual) ----
    if re.search(r'\b(cancel|stop|never\s*mind|quit|exit|abort|abbrechen|aufhören|stopp|egal|nicht\s*mehr)\b', text) or \
       re.search(r'(إلغاء|توقف|لا\s*أريد|خلاص)', text):
        return {"intent": "cancel", "value": None, "raw_text": user_input, "confidence": 0.9}

    # ---- 2. CHECKOUT (multilingual) ----
    if re.search(r'\b(checkout|check\s*out|finish|place\s*order|complete|done|that\'s\s*all|that\'s\s*it|'
                 r'bezahlen|kasse|fertig|das\s*wäre?\s*alles)\b', text) or \
       re.search(r'(ادفع|اطلب|خلص|انتهيت|كفاية)', text):
        return {"intent": "checkout", "value": None, "raw_text": user_input, "confidence": 0.9}

    # ---- 3. CONTEXT-DEPENDENT: short affirmatives when state expects them (multilingual) ----
    is_affirmative = bool(re.match(
        r'^(yes|yeah|yep|yea|sure|ok|okay|go\s*ahead|please|do\s*it|add\s*it|'
        r'go\s*on|continue|proceed|that\s*one|confirm|affirmative|absolutely|'
        r'definitely|of\s*course|ja|klar|genau|jawohl|ja[,]?\s*bitte(?:\s*hinzufügen)?|'
        r'in\s*ordnung|natürlich|selbstverständlich|hinzufügen|bitte\s*hinzufügen|'
        r'machen\s*sie|das\s*nehme\s*ich|'
        r'yes\s*please|alright|fine)\s*[.!]?\s*$', text
    )) or bool(re.match(r'^(نعم|أجل|طيب|حسنا|تمام|أكيد|بالتأكيد|ماشي|ايوه|موافق)\s*[.!؟]?\s*$', text))

    if is_affirmative:
        # Pending add confirmation → just_add_it
        if pending_add:
            return {"intent": "just_add_it", "value": None, "raw_text": user_input, "confidence": 0.9}
        # Pending RX check → confirm_rx
        if pending_rx:
            return {"intent": "confirm_rx", "value": None, "raw_text": user_input, "confidence": 0.9}
        # Pending qty/dose → just_add_it (accept defaults)
        if pending_qty:
            return {"intent": "just_add_it", "value": None, "raw_text": user_input, "confidence": 0.85}
        # Candidates shown → add_to_cart (first one)
        if has_candidates:
            return {"intent": "add_to_cart", "value": "1", "raw_text": user_input, "confidence": 0.8}

    # ---- 4. RX denial (multilingual) ----
    is_denial = bool(re.search(r'\b(no|nope|nah|don\'t\s*have|do\s*not\s*have|i\s*haven\'t|nein|habe\s*ich\s*nicht|kein|keine)\b', text)) or \
                bool(re.search(r'(لا|لأ|ما\s*عندي)', text))
    if is_denial:
        if pending_rx:
            return {"intent": "deny_rx", "value": None, "raw_text": user_input, "confidence": 0.9}
        # Short "no" without context — still deny
        if len(text) < 15:
            return {"intent": "deny_rx", "value": None, "raw_text": user_input, "confidence": 0.7}

    # ---- 5. SELECTION from candidates (multilingual) ----
    if has_candidates:
        sel_match = re.search(
            r'\b(first|second|third|1st|2nd|3rd|'
            r'erst(?:e[ns]?)?|zweit(?:e[ns]?)?|dritt(?:e[ns]?)?|'
            r'number\s*(\d)|option\s*(\d)|#\s*(\d))\b', text
        )
        if not sel_match:
            sel_match = re.search(r'(الأول[ى]?|الثاني[ة]?|الثالث[ة]?)', text)
        if sel_match:
            word_to_idx = {
                'first': '1', '1st': '1', 'second': '2', '2nd': '2', 'third': '3', '3rd': '3',
                'erste': '1', 'ersten': '1', 'erstes': '1', 'zweite': '2', 'zweiten': '2',
                'dritte': '3', 'dritten': '3',
                'الأول': '1', 'الأولى': '1', 'الثاني': '2', 'الثانية': '2', 'الثالث': '3', 'الثالثة': '3',
            }
            val = word_to_idx.get(sel_match.group(1).lower(), '')
            if not val:
                val = word_to_idx.get(sel_match.group(1), '')  # Arabic/non-lowerable
            if not val:
                val = sel_match.group(2) or sel_match.group(3) or sel_match.group(4) or '1'
            return {"intent": "add_to_cart", "value": val, "raw_text": user_input, "confidence": 0.85}

        # Bare number when candidates shown → add_to_cart
        bare_num = re.match(r'^(\d)$', text.strip())
        if bare_num:
            return {"intent": "add_to_cart", "value": bare_num.group(1), "raw_text": user_input, "confidence": 0.85}

        # "I'll take X" / "add X" / "go with X"
        take_match = re.search(r'(?:take|add|go\s*with|select|choose|pick)\s+(?:the\s+)?(.+)', text)
        if take_match:
            val = take_match.group(1).strip().rstrip('.!?')
            return {"intent": "add_to_cart", "value": val, "raw_text": user_input, "confidence": 0.8}

    # ---- 6. QUANTITY response (when system is asking for quantity, multilingual) ----
    if pending_qty:
        qty_match = re.match(r'^(\d+)\s*(strip|strips|tab|tablet|tablets|unit|units|pack|packs|box|boxes|bottle|bottles|st|stück|capsule|capsules|حبة|حبات|علبة)?\s*$', text, re.UNICODE)
        if qty_match:
            return {"intent": "quantity_response", "value": qty_match.group(1), "raw_text": user_input, "confidence": 0.9}

    # ---- 7. DOSE response (multilingual) ----
    if pending_qty and state.get("collected_quantity"):
        if re.search(r'\b(as\s*prescribed|standard|default|normal|regular|wie\s*verordnet|wie\s*verschrieben)\b', text) or \
           re.search(r'(حسب\s*الوصفة|كما\s*وصف)', text):
            return {"intent": "dose_response", "value": "As Prescribed", "raw_text": user_input, "confidence": 0.9}
        dose_match = re.search(r'(\d+(?:\.\d+)?)\s*(mg|ml|mcg|g)\b', text)
        if dose_match:
            return {"intent": "dose_response", "value": dose_match.group(0), "raw_text": user_input, "confidence": 0.85}

    # ---- 8. INDICATION / symptom queries ----
    indication_patterns = [
        (r'\b(diabetes|diabetic|sugar)\b', 'diabetes'),
        (r'\b(blood\s*pressure|bp|hypertension)\b', 'hypertension'),
        (r'\b(thyroid)\b', 'thyroid'),
        (r'\b(cold|runny\s*nose|erkältung|schnupfen)\b', 'cold'),
        (r'\b(fever|fieber)\b', 'fever'),
        (r'\b(cough|coughing|husten)\b', 'cough'),
        (r'\b(headache|head\s*ache|kopfschmerzen)\b', 'headache'),
        (r'\b(allergy|allergies|allergic|allergie)\b', 'allergies'),
        (r'\b(acidity|gastric|gas|bloating|stomach)\b', 'acidity'),
        (r'\b(pain|schmerz|schmerzen)\b', 'pain'),
        (r'\b(skin|haut|skin\s*care|cream|lotion|salbe)\b', 'skin'),
        (r'\b(vitamin|vitamine|vitamins)\b', 'vitamin'),
        (r'\b(omega|fischöl|fish\s*oil)\b', 'omega'),
        (r'\b(energy|energie|müde|tired|fatigue)\b', 'energy'),
        (r'\b(eye|eyes|augen|eye\s*drop)\b', 'eye'),
        (r'\b(probiotic|probiotik|darm|gut|digestive|digestion)\b', 'probiotic'),
        (r'\b(sleep|insomnia|schlaf)\b', 'sleep'),
        (r'\b(anxiety|angst|nervous|calm)\b', 'anxiety'),
        (r'\b(wound|wunde|cut|burn|heal)\b', 'wound'),
        (r'\b(itch|itching|jucken|rash|ausschlag)\b', 'itching'),
        (r'\b(hair\s*loss|haarausfall|hair)\b', 'hair loss'),
        (r'\b(urinary|bladder|blase|harnweg)\b', 'urinary'),
        (r'\b(constipation|verstopfung)\b', 'constipation'),
        (r'\b(diarrhea|durchfall)\b', 'diarrhea'),
        (r'\b(inflammation|entzündung|swelling)\b', 'inflammation'),
        (r'\b(sore\s*throat|halsschmerzen)\b', 'sore throat'),
        (r'\b(flu|grippe)\b', 'flu'),
        (r'\b(prostate|prostata)\b', 'prostate'),
        (r'\b(menopause|wechseljahre)\b', 'menopause'),
        (r'\b(magnesium)\b', 'magnesium'),
        (r'\b(baby|säugling|infant|kind|child)\b', 'baby'),
        (r'\b(sunburn|sonnenbrand)\b', 'sunburn'),
        (r'\b(dry\s*skin|trockene\s*haut)\b', 'dry skin'),
        (r'\b(acne|akne|pimple)\b', 'acne'),
        (r'\b(muscle\s*pain|muskelschmerz)\b', 'muscle pain'),
        (r'\b(joint\s*pain|gelenkschmerz)\b', 'joint pain'),
        # Arabic symptom patterns (Arabic script uses word boundaries differently)
        (r'(سكر[ي]?|ديابيتس)', 'diabetes'),
        (r'(ضغط\s*الدم|ارتفاع\s*الضغط)', 'hypertension'),
        (r'(غدة\s*درقية|ثايرويد)', 'thyroid'),
        (r'(زكام|رشح|نزلة\s*برد|برد)', 'cold'),
        (r'(حمى|حرارة|سخونة)', 'fever'),
        (r'(سعال|كحة)', 'cough'),
        (r'(صداع|وجع\s*رأس)', 'headache'),
        (r'(حساسية)', 'allergies'),
        (r'(حموضة|معدة|انتفاخ|غازات)', 'acidity'),
        (r'(ألم|وجع)', 'pain'),
        (r'(جلد|بشرة|كريم)', 'skin'),
        (r'(فيتامين)', 'vitamin'),
        (r'(أوميغا|زيت\s*سمك)', 'omega'),
        (r'(طاقة|تعب|إرهاق)', 'energy'),
        (r'(عين|عيون|قطرة)', 'eye'),
        (r'(نوم|أرق)', 'sleep'),
        (r'(قلق|توتر)', 'anxiety'),
        (r'(جرح|حرق)', 'wound'),
        (r'(حكة|طفح)', 'itching'),
        (r'(إمساك)', 'constipation'),
        (r'(إسهال)', 'diarrhea'),
        (r'(التهاب|تورم)', 'inflammation'),
        (r'(التهاب\s*حلق|حلق)', 'sore throat'),
        (r'(إنفلونزا|أنفلونزا)', 'flu'),
    ]

    for pattern, value in indication_patterns:
        # Check against cleaned text to avoid punctuation issues "fever,"
        match = re.search(pattern, clean_text)
        if match:
            matched_term = match.group(1).lower() if match.group(1) else match.group(0).lower()
            # But check if user ALSO mentioned a specific product name
            # e.g. "I need a skin cream, do you have Eucerin?"
            # → should be brand_query for "Eucerin", not indication_query for "skin"
            product_name = _extract_clean_product_name(user_input)
            product_lower = product_name.lower()
            # If product name looks like an actual brand (capitalized, not a symptom word)
            # Be careful: "vitamins" != "vitamin" so it triggers has_brand=True.
            base_value = value.lower()
            plurals = {base_value + 's', base_value + 'es'}
            
            # Also collect all words from the pattern match (includes localized terms)
            indication_words = {base_value, matched_term}
            indication_words |= plurals
            # Add common localized variants
            indication_words |= {matched_term + 's', matched_term + 'en', matched_term + 'e'}
            # Arabic plural forms (ات suffix)
            indication_words |= {matched_term + 'ات', matched_term + 'ين'}
            
            common_generics = {
                'medicine', 'medication', 'tablet', 'tablets', 'pill', 'pills',
                'cream', 'lotion', 'drop', 'drops', 'spray', 'syrup', 'gel',
                'capsule', 'capsules', 'supplement', 'supplements',
                'medikament', 'medikamente', 'tablette', 'tabletten',
                'دواء', 'علاج', 'حبوب',
            }
            
            has_brand = (
                product_name != user_input.strip() and
                len(product_lower) >= 3 and
                product_lower not in indication_words and
                product_lower not in common_generics
            )
            if has_brand and not re.match(r'^(some|any|medicine|medication)\b', product_lower):
                return {
                    "intent": "brand_query",
                    "value": product_name,
                    "raw_text": user_input,
                    "confidence": 0.7,
                }
            return {
                "intent": "indication_query",
                "value": value,
                "raw_text": user_input,
                "confidence": 0.75,
            }

    # ---- 9. BRAND / MEDICATION QUERY (default) ----
    product_name = _extract_clean_product_name(user_input)
    if product_name and len(product_name) >= 2:
        return {
            "intent": "brand_query",
            "value": product_name,
            "raw_text": user_input,
            "confidence": 0.65,
        }

    # ---- 10. Truly unclear ----
    return {
        "intent": "unclear",
        "value": None,
        "raw_text": user_input,
        "confidence": 0.3,
        "fallback_message": "I'd love to help! Could you tell me the brand name, generic name, or condition you need medicine for?",
    }


# Test function
if __name__ == "__main__":
    import asyncio
    
    async def test():
        test_inputs = [
            "I need medicine for diabetes",
            "Do you have glycomet?",
            "crocin tablet",
            "yes I have prescription",
            "no",
            "add the first one",
            "checkout",
        ]
        
        for inp in test_inputs:
            result = await parse_input(inp)
            print(f"Input: '{inp}'")
            print(f"Result: {json.dumps(result, indent=2)}")
            print()
    
    asyncio.run(test())
