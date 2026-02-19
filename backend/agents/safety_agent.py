"""
Safety Agent
Pre-action validation and safety constraint enforcement.
"""
from typing import Dict, Any, Optional, List

# Blocked queries (medical advice, antibiotic recommendations)
BLOCKED_PATTERNS = [
    "which medicine should i take",
    "what medicine for",
    "recommend medicine",
    "recommend medication",
    "prescribe",
    "which antibiotic",
    "best antibiotic",
    "antibiotic for",
    "dosage",
    "how much should i take",
    "how many tablets",
    "side effects",
    "is it safe",
    "can i take",
    "interaction",
]

# Antibiotic keywords
ANTIBIOTIC_KEYWORDS = [
    "antibiotic", "amoxicillin", "azithromycin", "ciprofloxacin",
    "cephalexin", "doxycycline", "metronidazole", "penicillin",
    "levofloxacin", "clindamycin", "augmentin", "cefixime",
]


async def check_input_safety(user_input: str) -> Dict[str, Any]:
    """
    Check if user input contains blocked patterns.
    
    Args:
        user_input: Raw user input
    
    Returns:
        Safety check result
    """
    from services.event_service import log_guardrail_trigger, Agent
    
    text = user_input.lower().strip()
    
    # Short inputs that are clearly conversational / dose responses should not be blocked
    # "as prescribed" is a valid dose response, not a medical advice request
    if text in ("as prescribed", "prescribed", "as directed", "as needed"):
        return {"safe": True}
    
    # Check for blocked patterns
    for pattern in BLOCKED_PATTERNS:
        if pattern in text:
            reason = "medical_advice"
            message = "As a pharmacist, I'm here to ensure you get the right medication safely, but I'm not permitted to provide medical diagnoses or treatment recommendations. Please specify the name of the medication or the condition your doctor mentioned, and I'll be happy to assist with your order."
            
            # Async logging - must be awaited by caller
            await log_guardrail_trigger(
                Agent.SAFETY,
                "medical_advice_block",
                f"Blocked pattern '{pattern}' in input: {user_input[:50]}...",
                {"input": user_input, "pattern": pattern}
            )
            
            return {
                "safe": False,
                "reason": reason,
                "message": message,
            }
    
    # Check for antibiotic queries
    for keyword in ANTIBIOTIC_KEYWORDS:
        if keyword in text:
            reason = "antibiotic_query"
            message = "I cannot dispense antibiotics without a direct clinical consultation and a valid physician's prescription. For your safety, please consult a healthcare provider for a proper diagnosis."
            
            await log_guardrail_trigger(
                Agent.SAFETY,
                "antibiotic_block",
                f"Blocked antibiotic keyword '{keyword}' in input: {user_input[:50]}...",
                {"input": user_input, "keyword": keyword}
            )
            
            return {
                "safe": False,
                "reason": reason,
                "message": message,
            }
    
    return {"safe": True}


def validate_add_to_cart(
    medication: Dict[str, Any],
    rx_confirmed: bool = False,
) -> Dict[str, Any]:
    """
    Validate if medication can be added to cart.
    
    Args:
        medication: Medication details
        rx_confirmed: Whether user confirmed prescription
    
    Returns:
        Validation result
    """
    # Check if medication exists
    if not medication:
        return {
            "allowed": False,
            "reason": "not_found",
            "message": "Medication not found.",
        }
    
    # Check stock
    stock = medication.get("stock_quantity", 0)
    if stock <= 0:
        return {
            "allowed": False,
            "reason": "out_of_stock",
            "message": f"{medication.get('brand_name', 'This medication')} is currently out of stock.",
            "suggest_alternatives": True,
        }
    
    # Check RX requirement
    if medication.get("rx_required", False) and not rx_confirmed:
        return {
            "allowed": False,
            "reason": "rx_required",
            "message": f"I've noted that {medication.get('brand_name', 'this medication')} is a prescription-only treatment. Do you have a valid prescription ready for clinical verification?",
            "needs_rx_confirmation": True,
        }
    
    return {
        "allowed": True,
        "medication": medication,
    }


def validate_substitution(
    original: Dict[str, Any],
    alternative: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Validate if substitution is allowed (Tier-1 only).
    
    Args:
        original: Original medication
        alternative: Proposed alternative
    
    Returns:
        Validation result
    """
    if not original or not alternative:
        return {"allowed": False, "reason": "missing_data"}
    
    original_ingredient = original.get("active_ingredient", "").lower()
    alt_ingredient = alternative.get("active_ingredient", "").lower()
    
    if original_ingredient != alt_ingredient:
        return {
            "allowed": False,
            "reason": "different_ingredient",
            "message": "I can only suggest alternatives with the same active ingredient.",
        }
    
    return {
        "allowed": True,
        "alternative": alternative,
    }


async def validate_prescription(
    ocr_result: Dict[str, Any],
    cart_items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Validate if the parsed prescription covers the cart items.
    
    Args:
        ocr_result: Result from ocr_service.parse_prescription_text
        cart_items: Items in user's cart
    
    Returns:
        Validation result with allowed/blocked items
    """
    from services.event_service import log_safety_decision
    
    # 1. Check for OCR errors
    if "error" in ocr_result:
        return {
            "valid": False,
            "message": "Could not read prescription image. Please ensure it is clear and legible."
        }
        
    rx_meds_in_cart = [item for item in cart_items if item.get('rx_required', False)]
    prescribed_meds = ocr_result.get("medications", [])
    
    # Create lookup map for prescribed meds (by brand and generic)
    prescribed_names = set()
    for m in prescribed_meds:
        prescribed_names.add(m['brand_name'].lower())
        prescribed_names.add(m['generic_name'].lower())
    
    # 2. Validate each RX item
    approved_items = []
    blocked_items = []
    
    for item in rx_meds_in_cart:
        brand = item.get('brand_name', '').lower()
        generic = item.get('generic_name', '').lower()
        
        # Check if brand or generic is in prescribed list
        # Note: This is a strict check. In real world, we'd use stronger entity linking.
        is_covered = (brand in prescribed_names) or (generic in prescribed_names)
        
        if is_covered:
            approved_items.append(item)
            await log_safety_decision(
                item.get('brand_name'), 
                "APPROVED", 
                "Found in uploaded prescription", 
                True
            )
        else:
            blocked_items.append(item)
            await log_safety_decision(
                item.get('brand_name'), 
                "BLOCKED", 
                "Not found in uploaded prescription", 
                True
            )
            
    if not rx_meds_in_cart:
        return {"valid": True, "message": "No prescription items in cart."}

    if blocked_items:
        blocked_names = ", ".join([i['brand_name'] for i in blocked_items])
        return {
            "valid": False,
            "message": f"Prescription valid, but does not cover: {blocked_names}. Please upload a prescription for these items.",
            "blocked_items": blocked_items
        }
        
    return {
        "valid": True, 
        "message": "Prescription verified! All RX items approved."
    }


def get_blocked_response(reason: str) -> str:
    """Get appropriate blocked response message."""
    responses = {
        "medical_advice": "As a professional pharmacist, I am committed to your safety, but I cannot provide medical advice or recommendations. I am here to assist with the dispensing of medications you already know or have been prescribed.",
        "antibiotic_query": "I cannot dispense antibiotics without a valid prescription and proper clinical diagnosis. Please consult your healthcare provider.",
        "rx_denied": "I'm sorry, for your clinical safety and regulatory compliance, I cannot dispense this medication without a valid prescription.",
        "out_of_stock": "I've checked our current inventory, and this medication is unfortunately out of stock at the moment.",
    }
    return responses.get(reason, "I cannot help with this request.")
