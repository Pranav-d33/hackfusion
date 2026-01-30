"""
Extraction Utilities
Regex-first extraction for dosage, quantity, and frequency from user input.
LLM fallback when regex fails.
"""
import re
from typing import Dict, Any, Optional, List, Tuple


# Dosage patterns (mg, ml, mcg, etc.)
DOSAGE_PATTERNS = [
    # Standard dosage (e.g., "500mg", "100 mg", "5ml")
    r'(\d+(?:\.\d+)?)\s*(mg|ml|mcg|microgram|gram|g|iu|unit|u)\b',
    # Dosage with slash (e.g., "250mg/5ml")
    r'(\d+(?:\.\d+)?)\s*(mg|ml)/(\d+(?:\.\d+)?)\s*(ml)',
    # Percentage (e.g., "0.1%", "2%")
    r'(\d+(?:\.\d+)?)\s*%',
]

# Quantity patterns (number of tablets, strips, bottles, etc.)
QUANTITY_PATTERNS = [
    # Number + unit (e.g., "2 strips", "10 tablets", "1 bottle")
    r'(\d+)\s*(strip|strips|tab|tabs|tablet|tablets|cap|caps|capsule|capsules|bottle|bottles|pack|packs|box|boxes|sachet|sachets|vial|vials|ampule|ampules|ml|lt|ltr|litre|liter)\b',
    # Words for numbers (e.g., "two strips", "three tablets")
    r'(one|two|three|four|five|six|seven|eight|nine|ten)\s*(strip|strips|tab|tabs|tablet|tablets|cap|caps|capsule|capsules|bottle|bottles|pack|packs)\b',
    # Just a number at start (e.g., "2 crocin" -> quantity=2)
    r'^(\d+)\s+[a-zA-Z]',
]

# Frequency patterns
FREQUENCY_PATTERNS = [
    r'(once|twice|thrice)\s*(a|per)?\s*(day|daily)\b',
    r'(\d+)\s*times?\s*(a|per)?\s*(day|daily)\b',
    r'(morning|evening|night|bedtime|before food|after food|empty stomach)\b',
    r'(daily|weekly|monthly)\b',
    r'(sos|as needed|when required|prn)\b',
]

# Word to number map
WORD_TO_NUM = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
}


def extract_dosage(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract dosage from text.
    
    Args:
        text: User input text
    
    Returns:
        Dict with 'value' and 'unit', or None if not found
    """
    text_lower = text.lower()
    
    for pattern in DOSAGE_PATTERNS:
        match = re.search(pattern, text_lower, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) >= 2:
                return {
                    "value": float(groups[0]),
                    "unit": groups[1].lower(),
                    "raw": match.group(0),
                }
    
    return None


def extract_quantity(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract quantity from text.
    
    Args:
        text: User input text
    
    Returns:
        Dict with 'count' and 'unit_type', or None if not found
    """
    text_lower = text.lower()
    
    for pattern in QUANTITY_PATTERNS:
        match = re.search(pattern, text_lower, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) >= 2:
                count = groups[0]
                unit = groups[1] if len(groups) > 1 else 'unit'
                
                # Convert word numbers
                if count in WORD_TO_NUM:
                    count = WORD_TO_NUM[count]
                else:
                    try:
                        count = int(count)
                    except ValueError:
                        count = 1
                
                # Normalize unit
                unit = normalize_quantity_unit(unit)
                
                return {
                    "count": count,
                    "unit_type": unit,
                    "raw": match.group(0),
                }
    
    return None


def extract_frequency(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract frequency/timing from text.
    
    Args:
        text: User input text
    
    Returns:
        Dict with frequency info, or None if not found
    """
    text_lower = text.lower()
    
    for pattern in FREQUENCY_PATTERNS:
        match = re.search(pattern, text_lower, re.IGNORECASE)
        if match:
            return {
                "raw": match.group(0),
                "pattern": pattern,
            }
    
    return None


def normalize_quantity_unit(unit: str) -> str:
    """Normalize quantity unit to standard form."""
    unit = unit.lower().strip()
    
    # Tablet variants
    if unit in ['tab', 'tabs', 'tablet', 'tablets']:
        return 'tablet'
    
    # Capsule variants
    if unit in ['cap', 'caps', 'capsule', 'capsules']:
        return 'capsule'
    
    # Strip variants
    if unit in ['strip', 'strips']:
        return 'strip'
    
    # Bottle variants
    if unit in ['bottle', 'bottles']:
        return 'bottle'
    
    # Pack variants
    if unit in ['pack', 'packs', 'box', 'boxes']:
        return 'pack'
    
    return unit


def extract_all(text: str) -> Dict[str, Any]:
    """
    Extract all components (dosage, quantity, frequency) from text.
    
    Args:
        text: User input text
    
    Returns:
        Dict with all extracted components
    """
    return {
        "dosage": extract_dosage(text),
        "quantity": extract_quantity(text),
        "frequency": extract_frequency(text),
        "original_text": text,
    }


def enhance_nlu_result(nlu_result: Dict[str, Any], user_input: str) -> Dict[str, Any]:
    """
    Enhance an NLU result with extracted dosage/quantity information.
    
    Args:
        nlu_result: Original NLU parse result
        user_input: Raw user input
    
    Returns:
        Enhanced NLU result with dosage/quantity fields
    """
    extraction = extract_all(user_input)
    
    enhanced = nlu_result.copy()
    
    if extraction["dosage"]:
        enhanced["dosage"] = extraction["dosage"]
    
    if extraction["quantity"]:
        enhanced["quantity"] = extraction["quantity"]
    
    if extraction["frequency"]:
        enhanced["frequency"] = extraction["frequency"]
    
    return enhanced


# Test examples
if __name__ == "__main__":
    test_inputs = [
        "crocin 650 two strips",
        "metformin 500mg once daily",
        "need 10 tablets of paracetamol",
        "glycomet 500 mg",
        "I need medicine for diabetes",
        "can I get 2 strips of dolo 650",
        "give me thyronorm 100 mcg",
        "one bottle of benadryl",
    ]
    
    print("Extraction Tests:")
    print("=" * 60)
    
    for text in test_inputs:
        result = extract_all(text)
        print(f"\nInput: '{text}'")
        print(f"  Dosage:    {result['dosage']}")
        print(f"  Quantity:  {result['quantity']}")
        print(f"  Frequency: {result['frequency']}")
