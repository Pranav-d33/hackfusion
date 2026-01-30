"""
NLU Service
Natural Language Understanding using OpenRouter small model.
Parses user input into structured intent and entities.
"""
from typing import Dict, Any, Optional
import httpx
import json
import re
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, NLU_MODEL
from nlu.extraction_utils import enhance_nlu_result

# OpenRouter API endpoint
OPENROUTER_CHAT_URL = f"{OPENROUTER_BASE_URL}/chat/completions"

# NLU System Prompt
NLU_SYSTEM_PROMPT = """You are an NLU parser for a medicine ordering system. Parse user input and return structured JSON.

IMPORTANT RULES:
1. Return ONLY valid JSON, no markdown or explanation
2. Identify the intent and extract the key value
3. Do NOT provide medical advice or diagnoses
4. Do NOT suggest medications - only parse what the user said

INTENTS:
- "medication_query": User mentions a generic medicine name (e.g., "metformin", "paracetamol")
- "brand_query": User mentions a brand name (e.g., "Glycomet", "Crocin", "Dolo 650")
- "indication_query": User mentions a disease or symptom (e.g., "diabetes", "cold", "fever", "blood pressure")
- "add_to_cart": User wants to add a previously shown item (e.g., "add that", "yes add it", "first one")
- "confirm_rx": User confirms they have a prescription (e.g., "yes I have prescription", "yes")
- "deny_rx": User denies having a prescription (e.g., "no", "I don't have prescription")
- "checkout": User wants to checkout (e.g., "checkout", "done", "place order")
- "cancel": User wants to cancel (e.g., "cancel", "never mind", "stop")
- "unclear": Cannot determine intent

OUTPUT FORMAT:
{
  "intent": "one of the intents above",
  "value": "extracted entity value or null",
  "raw_text": "original user input",
  "confidence": 0.0-1.0
}

EXAMPLES:
Input: "I need medicine for diabetes"
Output: {"intent": "indication_query", "value": "diabetes", "raw_text": "I need medicine for diabetes", "confidence": 0.95}

Input: "Do you have glycomet?"
Output: {"intent": "brand_query", "value": "glycomet", "raw_text": "Do you have glycomet?", "confidence": 0.92}

Input: "Add the first one"
Output: {"intent": "add_to_cart", "value": "1", "raw_text": "Add the first one", "confidence": 0.88}

Input: "Yes I have a prescription"
Output: {"intent": "confirm_rx", "value": null, "raw_text": "Yes I have a prescription", "confidence": 0.95}
"""


async def parse_input(user_input: str) -> Dict[str, Any]:
    """
    Parse user input into structured intent and entities.
    
    Args:
        user_input: Raw user text input
    
    Returns:
        Parsed NLU result with intent, value, and confidence
    """
    if not user_input or not user_input.strip():
        return {
            "intent": "unclear",
            "value": None,
            "raw_text": user_input,
            "confidence": 0.0,
            "fallback_message": "I'm here to help with your clinical needs, but I didn't quite catch that. Could you please specify a medication name (e.g., 'Crocin') or a health condition (e.g., 'diabetes') you need assistance with?",
        }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OPENROUTER_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": NLU_MODEL,
                    "messages": [
                        {"role": "system", "content": NLU_SYSTEM_PROMPT},
                        {"role": "user", "content": user_input.strip()},
                    ],
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
            
            # Enhance with dosage/quantity extraction
            result = enhance_nlu_result(result, user_input)
            return result
        
        # Fallback to regex parsing if JSON extraction failed
        fallback = _fallback_parse(user_input)
        return enhance_nlu_result(fallback, user_input)
        
    except Exception as e:
        print(f"NLU Error: {e}")
        fallback = _fallback_parse(user_input)
        return enhance_nlu_result(fallback, user_input)


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from text, handling markdown code blocks."""
    # Remove markdown code blocks if present
    text = re.sub(r'```json?\s*', '', text)
    text = re.sub(r'```\s*$', '', text)
    text = text.strip()
    
    # Try to find JSON object
    match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    
    # Try parsing the whole text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _fallback_parse(user_input: str) -> Dict[str, Any]:
    """Fallback regex-based parsing when LLM fails."""
    text = user_input.lower().strip()
    
    # Check for common patterns
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
    
    # Check for cart actions
    if re.search(r'\b(add|want|take|give me|first|second|third)\b', text):
        # Extract number if present
        num_match = re.search(r'\b(first|one|1)\b', text)
        if num_match:
            return {
                "intent": "add_to_cart",
                "value": "1",
                "raw_text": user_input,
                "confidence": 0.7,
            }
        num_match = re.search(r'\b(second|two|2)\b', text)
        if num_match:
            return {
                "intent": "add_to_cart",
                "value": "2",
                "raw_text": user_input,
                "confidence": 0.7,
            }
    
    # Check for checkout
    if re.search(r'\b(checkout|done|finish|place order|order|complete)\b', text):
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
    # Extract the main noun/name
    words = text.split()
    # Remove common filler words
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
        "fallback_message": "I'm not entirely sure how to assist with that request. To ensure you get the correct medication, please provide a brand name (e.g., 'Glycomet'), generic name, or the condition you're inquiring about.",
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
