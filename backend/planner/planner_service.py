"""
Planner Service
Agent planner using OpenRouter larger model for multi-step reasoning.
"""
from typing import Dict, Any, List, Optional
import httpx
import json
import re
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, PLANNER_MODEL

# OpenRouter API endpoint
OPENROUTER_CHAT_URL = f"{OPENROUTER_BASE_URL}/chat/completions"

# Planner System Prompt
PLANNER_SYSTEM_PROMPT = """You are the Mediloon Pharmacist, a professional and empathetic clinical AI designed to help customers manage their medications safely and efficiently. Your goal is to provide a seamless ordering experience while ensuring all clinical safeguards are respected.

## YOUR PERSONA:
- **Professional & Empathetic**: Use a respectful, clinical yet warm tone. Address the user's needs with care.
- **Consultative**: Use pharmacy terminology appropriately (e.g., "dispense", "counseling", "clinical safety", "active ingredient").
- **Safety-First**: You are the final safeguard. Your priority is the user's health and regulatory compliance.

## CRITICAL SAFETY RULES (NEVER VIOLATE):
1. NEVER provide medical advice, diagnoses, or treatment recommendations.
2. NEVER recommend medications - only help order what the user asks for.
3. NEVER suggest antibiotics or make antibiotic substitutions.
4. NEVER hallucinate medications - only use medications from tool results.
5. For RX required medications, ALWAYS use "ask_rx" action with the medication object before adding to cart.
6. If user says "no" to prescription question, BLOCK the add-to-cart action.
7. Only suggest alternatives with the SAME ACTIVE INGREDIENT (Tier-1).
8. Use a SUGGESTIVE, HELPFUL tone for user habits. NEVER be prescriptive.
   - ❌ "You must order Metformin now because you are late."
   - ✅ "I've reviewed your clinical profile and noticed you usually refill your Metformin around this time. Would you like me to prepare that for you?"

## AVAILABLE TOOLS:
- lookup_by_indication(indication): Find medications for a disease/condition
- vector_search(name): Find medications by brand/generic name
- get_inventory(med_id): Check stock for a medication
- get_rx_flag(med_id): Check if prescription required
- add_to_cart(med_id, qty): Add medication to cart
- get_tier1_alternatives(med_id): Get same-ingredient alternatives if out of stock

## CONVERSATION STATE:
You will receive:
- nlu_result: Parsed user intent
- candidates: Medications found (if any)
- pending_rx_check: Medication awaiting prescription confirmation (set by ask_rx)
- selected_medication: Currently selected medication
- cart_items: Current cart items
- user_insights: Suggested refills/patterns based on history (USE THIS SUGGESTIVELY)
- conversation_history: Recent conversation turns for context

## OUTPUT FORMAT:
Return a JSON object with:
{
  "action": "tool_call" | "ask_rx" | "ask_user" | "respond" | "checkout" | "end",
  "tool": "tool_name (required if action is tool_call)",
  "tool_args": {args (required if action is tool_call)},
  "medication": {medication object from candidates - REQUIRED if action is ask_rx},
  "message": "professional pharmacist response message for user",
  "tts_message": "shorter message for voice (optional)",
  "reasoning": "brief explanation of your decision"
}

## CRITICAL: When to use ask_rx
If a medication requires prescription (rx_required=true), you MUST use "ask_rx" action with the full medication object.
This sets pending_rx_check so when user confirms, we know which medication to add.

## EXAMPLES (PHARMACIST TONE):

User says "medicine for diabetes", NLU gives indication_query:
{"action": "tool_call", "tool": "lookup_by_indication", "tool_args": {"indication": "diabetes"}, "reasoning": "User is seeking diabetes management medication. Initiating clinical inventory search."}

After getting candidates [Glycomet, Amaryl], present options:
{"action": "ask_user", "message": "I've checked our current inventory for diabetes management. We have Glycomet (Metformin 500mg) and Amaryl (Glimepiride 2mg) available. Which of these has your doctor prescribed for you?", "reasoning": "Presenting available clinical options to the user."}

User selects Glycomet (id=1, rx_required=true) - USE ask_rx WITH medication object:
{"action": "ask_rx", "medication": {"id": 1, "brand_name": "Glycomet", "generic_name": "Metformin", "dosage": "500mg", "rx_required": true}, "message": "I can certainly help you with Glycomet. As this is a prescription-only medication, do you have a valid prescription ready for verification?", "reasoning": "Ensuring regulatory compliance for RX-only medication."}

User confirms prescription (pending_rx_check is set):
{"action": "tool_call", "tool": "add_to_cart", "tool_args": {"med_id": 1, "qty": 1}, "reasoning": "Prescription availability confirmed. Proceeding to dispense to cart."}

User asks "which medicine should I take?":
{"action": "respond", "message": "As a pharmacist, I'm here to ensure you get the right medication safely, but I'm not permitted to provide medical diagnoses or treatment recommendations. If you can provide the name of the medication or the condition your doctor mentioned, I'll be happy to assist with your order.", "reasoning": "Clarifying clinical boundaries while remaining helpful."}
"""


async def plan_next_action(
    nlu_result: Dict[str, Any],
    conversation_state: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Plan the next action based on NLU result and conversation state.
    
    Args:
        nlu_result: Parsed NLU output
        conversation_state: Current conversation context
    
    Returns:
        Action plan with tool calls or user messages
    """
    # Build context message
    context = {
        "nlu_result": nlu_result,
        "candidates": conversation_state.get("candidates", []),
        "pending_rx_check": conversation_state.get("pending_rx_check"),
        "selected_medication": conversation_state.get("selected_medication"),
        "cart_items": conversation_state.get("cart", {}).get("items", []),
        "user_insights": conversation_state.get("user_insights", []),
        "last_action": conversation_state.get("last_action"),
    }
    
    # Include recent conversation history for context (last 6 turns)
    conversation_history = conversation_state.get("conversation_history", [])
    recent_history = conversation_history[-12:] if conversation_history else []  # Last 6 turns
    
    user_message = f"""Recent conversation:
{_format_conversation_history(recent_history)}

Current state:
{json.dumps(context, indent=2)}

What should I do next?"""
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                OPENROUTER_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": PLANNER_MODEL,
                    "messages": [
                        {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 500,
                },
            )
            response.raise_for_status()
            data = response.json()
        
        content = data["choices"][0]["message"]["content"].strip()
        result = _extract_json(content)
        
        if result:
            return result
        
        # Fallback to rule-based planning
        return _fallback_plan(nlu_result, conversation_state)
        
    except Exception as e:
        print(f"Planner Error: {e}")
        return _fallback_plan(nlu_result, conversation_state)


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from text."""
    text = re.sub(r'```json?\s*', '', text)
    text = re.sub(r'```\s*$', '', text)
    text = text.strip()
    
    match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _format_conversation_history(history: List[Dict[str, str]]) -> str:
    """Format conversation history for planner context."""
    if not history:
        return "(No previous conversation)"
    
    lines = []
    for msg in history:
        role = "User" if msg.get("role") == "user" else "Assistant"
        content = msg.get("content", "")[:200]  # Truncate long messages
        lines.append(f"{role}: {content}")
    
    return "\n".join(lines)


def _fallback_plan(nlu_result: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    """Rule-based fallback planning when LLM fails."""
    intent = nlu_result.get("intent", "unclear")
    value = nlu_result.get("value")
    
    # Handle prescription confirmation/denial
    if intent == "confirm_rx" and state.get("pending_rx_check"):
        med = state["pending_rx_check"]
        return {
            "action": "tool_call",
            "tool": "add_to_cart",
            "tool_args": {"med_id": med["id"], "qty": 1},
            "reasoning": "User confirmed prescription, adding to cart",
        }
    
    if intent == "deny_rx" and state.get("pending_rx_check"):
        return {
            "action": "respond",
            "message": "I'm sorry, for your clinical safety and regulatory compliance, I cannot dispense this medication without a valid prescription. Would you like to check for an over-the-counter alternative or another medication?",
            "reasoning": "User denied prescription availability, blocking dispensing.",
        }
    
    # Handle indication query
    if intent == "indication_query" and value:
        return {
            "action": "tool_call",
            "tool": "lookup_by_indication",
            "tool_args": {"indication": value},
            "reasoning": f"Looking up medications for {value}",
        }
    
    # Handle brand/medication query
    if intent in ("brand_query", "medication_query") and value:
        return {
            "action": "tool_call",
            "tool": "vector_search",
            "tool_args": {"name": value},
            "reasoning": f"Searching for medication: {value}",
        }
    
    # Handle add to cart selection
    if intent == "add_to_cart" and state.get("candidates"):
        candidates = state["candidates"]
        selection = value or "1"
        try:
            idx = int(selection) - 1
            if 0 <= idx < len(candidates):
                med = candidates[idx]
                if med.get("rx_required"):
                    return {
                        "action": "ask_rx",
                        "medication": med,
                        "message": f"{med['brand_name']} requires a prescription. Do you have one?",
                        "reasoning": "Need to verify prescription before adding",
                    }
                return {
                    "action": "tool_call",
                    "tool": "add_to_cart",
                    "tool_args": {"med_id": med["id"], "qty": 1},
                    "reasoning": "OTC medication, adding to cart",
                }
        except (ValueError, IndexError):
            pass
    
    # Handle checkout
    if intent == "checkout":
        return {
            "action": "checkout",
            "reasoning": "User wants to checkout",
        }
    
    # Handle cancel
    if intent == "cancel":
        return {
            "action": "end",
            "message": "Understood. I've cleared your current request. Please let me know if there's anything else I can assist you with regarding your medications.",
            "reasoning": "User cancelled the clinical consultation.",
        }
    
    # Default unclear response - use fallback_message from NLU if available
    fallback_msg = nlu_result.get("fallback_message", 
        "I'm not sure what you're looking for. You can ask for a specific medicine by brand name, generic name, or tell me what condition you need medicine for (like 'cold' or 'diabetes').")
    return {
        "action": "respond",
        "message": fallback_msg,
        "reasoning": "Unclear intent, asking for clarification",
    }
