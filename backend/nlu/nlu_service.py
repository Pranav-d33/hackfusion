"""
NLU Service
Natural Language Understanding using OpenRouter LLM.

LLM-DRIVEN APPROACH:
- Multi-turn conversation messages passed to LLM for dynamic context reasoning
- LLM naturally understands "go on", "sure", compound inputs from conversation flow
- Regex fallback only used when LLM times out or fails
- Smart caching for trivial intents (yes/no/checkout/cancel)
"""
from typing import Dict, Any, Optional
import httpx
import json
import re
import sys
import hashlib
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, NLU_MODEL
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
NLU_SYSTEM_PROMPT = """You are a pharmacy order NLU parser. Given the conversation so far, classify the LATEST user message into a structured JSON intent.

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
4. If user provides medicine name + quantity together (e.g. "crocin 20") = add_to_cart with value = medicine name.
5. After a general question was answered, "go on" / "ok" / "sure" / "continue" = just_add_it.
6. "yes" after a prescription question = confirm_rx. "yes" after "would you like to add?" = just_add_it.
7. Use the conversation context to determine the CORRECT intent — don't just pattern match the words.

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
            "fallback_message": "Hi! I'm your Mediloon pharmacist. Just tell me the name of the medication you're looking for, or the health condition you need help with, and I'll find the best options for you!",
        }
    
    # CHECK CACHE FIRST (only for simple stateless intents like "yes", "no")
    cache_key = _get_cache_key(user_input)
    if cache_key in _nlu_cache:
        cached = _nlu_cache[cache_key].copy()
        cached["cached"] = True
        return cached
    
    try:
        # Build multi-turn messages with conversation history
        messages = _build_nlu_messages(user_input, conversation_state)
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                OPENROUTER_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": NLU_MODEL,
                    "messages": messages,
                    "temperature": 0.1,
                    "max_tokens": 150,
                },
            )
            response.raise_for_status()
            data = response.json()
        
        content = data["choices"][0]["message"]["content"].strip()
        
        # Try to parse JSON from response
        result = _extract_json(content)
        
        if result:
            # Ensure required fields
            result.setdefault("intent", "unclear")
            result.setdefault("value", None)
            result.setdefault("raw_text", user_input)
            result.setdefault("confidence", 0.5)
            
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
# REGEX FALLBACK - Only used when LLM fails/times out
# ============================================================================
def _fallback_parse(user_input: str, conversation_state: dict = None) -> Dict[str, Any]:
    """Regex-based fallback parsing. Only used when LLM is unavailable."""
    text = user_input.lower().strip()
    
    # Check for common indication patterns
    indication_patterns = [
        (r'\b(diabetes|sugar|diabetic)\b', 'diabetes'),
        (r'\b(blood pressure|bp|hypertension)\b', 'hypertension'),
        (r'\b(thyroid)\b', 'thyroid'),
        (r'\b(cold|runny nose)\b', 'cold'),
        (r'\b(fever)\b', 'fever'),
        (r'\b(cough|coughing)\b', 'cough'),
        (r'\b(headache|head ache)\b', 'headache'),
        (r'\b(allergy|allergies|allergic)\b', 'allergies'),
        (r'\b(acidity|gastric|gas)\b', 'acidity'),
    ]
    
    for pattern, value in indication_patterns:
        if re.search(pattern, text):
            return {
                "intent": "indication_query",
                "value": value,
                "raw_text": user_input,
                "confidence": 0.7,
            }
    
    # Check for confirmation patterns
    if re.search(r'\b(yes|yeah|yep|confirm|i have|have one)\b', text):
        if 'prescription' in text or len(text) < 10:
            return {
                "intent": "confirm_rx",
                "value": None,
                "raw_text": user_input,
                "confidence": 0.8,
            }
    
    if re.search(r'\b(no|nope|don\'t have|do not have)\b', text):
        return {
            "intent": "deny_rx",
            "value": None,
            "raw_text": user_input,
            "confidence": 0.8,
        }
    
    # Check for checkout
    if re.search(r'\b(checkout|finish|place order|complete)\b', text):
        return {
            "intent": "checkout",
            "value": None,
            "raw_text": user_input,
            "confidence": 0.8,
        }

    # Check for cancel
    if re.search(r'\b(cancel|stop|never mind|quit|exit)\b', text):
        return {
            "intent": "cancel",
            "value": None,
            "raw_text": user_input,
            "confidence": 0.8,
        }
    
    # Default: treat as brand/medication query
    words = text.split()
    filler = {'i', 'need', 'want', 'have', 'do', 'you', 'the', 'a', 'an', 'some', 'any', 'medicine', 'medication', 'tablet', 'for', 'get', 'me', 'please'}
    meaningful_words = [w for w in words if w not in filler]
    
    if meaningful_words:
        return {
            "intent": "brand_query",
            "value": ' '.join(meaningful_words),
            "raw_text": user_input,
            "confidence": 0.5,
        }
    
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
