"""
Fallback Demo Script
Cached responses for common demo scenarios if LLM times out.
Use this as a backup during live demo.
"""
from typing import Dict, Any, Optional

# Cached responses for common queries
FALLBACK_RESPONSES = {
    # Indication queries
    "diabetes": {
        "message": "Here are medications for diabetes:\n1. Glycomet (Metformin 500mg)\n2. Glycomet SR (Metformin 1000mg)\n3. Amaryl (Glimepiride 2mg)\n\nWhich one would you like?",
        "tts_message": "We have Glycomet, Glycomet SR, and Amaryl for diabetes. Which one would you like?",
    },
    "blood pressure": {
        "message": "Here are medications for blood pressure:\n1. Amlong (Amlodipine 5mg)\n2. Telmikind (Telmisartan 40mg)\n3. Losar (Losartan 50mg)\n\nWhich one would you like?",
        "tts_message": "We have Amlong, Telmikind, and Losar for blood pressure. Which one would you like?",
    },
    "hypertension": {
        "message": "Here are medications for hypertension:\n1. Amlong (Amlodipine 5mg)\n2. Telmikind (Telmisartan 40mg)\n3. Losar (Losartan 50mg)\n\nWhich one would you like?",
        "tts_message": "We have Amlong, Telmikind, and Losar for hypertension. Which one would you like?",
    },
    "thyroid": {
        "message": "Here are medications for thyroid:\n1. Thyronorm 50mcg (Levothyroxine)\n2. Thyronorm 100mcg (Levothyroxine)\n\nWhich one would you like?",
        "tts_message": "We have Thyronorm 50 and Thyronorm 100. Which one would you like?",
    },
    "cold": {
        "message": "Here are medications for cold:\n1. Crocin (Paracetamol 500mg)\n2. Benadryl DR (Cough syrup)\n3. Alerid (Cetirizine 10mg)\n4. Limcee (Vitamin C 500mg)\n\nWhich one would you like?",
        "tts_message": "We have Crocin, Benadryl, Alerid, and Limcee for cold. Which one?",
    },
    "fever": {
        "message": "Here are medications for fever:\n1. Crocin (Paracetamol 500mg)\n2. Dolo 650 (Paracetamol 650mg)\n3. Brufen (Ibuprofen 400mg)\n\nWhich one would you like?",
        "tts_message": "We have Crocin, Dolo 650, and Brufen for fever. Which one?",
    },
    "headache": {
        "message": "Here are medications for headache:\n1. Crocin (Paracetamol 500mg)\n2. Dolo 650 (Paracetamol 650mg)\n3. Brufen (Ibuprofen 400mg)\n\nWhich one would you like?",
        "tts_message": "We have Crocin, Dolo 650, and Brufen for headache. Which one?",
    },
    "acidity": {
        "message": "Here are medications for acidity:\n1. Omez (Omeprazole 20mg)\n2. Pan D (Pantoprazole 40mg)\n3. Zinetac (Ranitidine 150mg)\n\nWhich one would you like?",
        "tts_message": "We have Omez, Pan D, and Zinetac for acidity. Which one?",
    },
    
    # Brand queries
    "glycomet": {
        "message": "Found Glycomet (Metformin 500mg). This requires a prescription. Do you have one?",
        "tts_message": "Found Glycomet. This requires a prescription. Do you have one?",
    },
    "crocin": {
        "message": "Found Crocin (Paracetamol 500mg). This is available over the counter. Would you like to add it to your cart?",
        "tts_message": "Found Crocin. Would you like to add it to your cart?",
    },
    
    # Out of stock demo
    "glucophage": {
        "message": "Glucophage XR is currently out of stock.\n\nAlternatives with the same ingredient:\n1. Glycomet (Metformin 500mg) - In stock\n\nWould you like Glycomet instead?",
        "tts_message": "Glucophage is out of stock. We have Glycomet with the same ingredient. Would you like that instead?",
    },
    
    # RX responses
    "rx_confirm": {
        "message": "Great! Adding to your cart. Say 'checkout' when you're done.",
        "tts_message": "Added to cart. Say checkout when done.",
    },
    "rx_deny": {
        "message": "I'm sorry, I cannot add this medication to your cart without a prescription. Would you like to look for something else?",
        "tts_message": "Sorry, I cannot add this without a prescription. Would you like something else?",
    },
    
    # Unclear
    "unclear": {
        "message": "I'm not sure what you're looking for. Say a medicine name like 'Crocin' or a condition like 'cold' or 'diabetes'.",
        "tts_message": "I didn't catch that. Say a medicine name or a condition like cold or diabetes.",
    },
}


def get_fallback_response(query: str) -> Optional[Dict[str, Any]]:
    """Get a cached fallback response for a query."""
    query = query.lower().strip()
    
    # Check for exact match
    if query in FALLBACK_RESPONSES:
        return FALLBACK_RESPONSES[query]
    
    # Check for partial matches
    for key, response in FALLBACK_RESPONSES.items():
        if key in query or query in key:
            return response
    
    # Return unclear fallback
    return FALLBACK_RESPONSES["unclear"]


def demo_script():
    """Print demo script for live presentation."""
    print("""
╔══════════════════════════════════════════════════════════════════╗
║               MEDILOON DEMO SCRIPT                               ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  FLOW 1: Indication Query (Happy Path)                           ║
║  ─────────────────────────────────────                           ║
║  User: "Medicine for diabetes"                                   ║
║  → Shows Glycomet, Glycomet SR, Amaryl                          ║
║  User: "First one" / click Glycomet                             ║
║  → "Requires prescription. Do you have one?"                     ║
║  User: "Yes"                                                     ║
║  → Added to cart                                                 ║
║                                                                  ║
║  FLOW 2: Brand Query with Typo                                   ║
║  ────────────────────────────────                                ║
║  User: "glcoemet" (misspelled)                                   ║
║  → Fuzzy match finds Glycomet                                    ║
║                                                                  ║
║  FLOW 3: RX Denial (Edge Case)                                   ║
║  ─────────────────────────────                                   ║
║  User: "Thyronorm"                                               ║
║  → "Requires prescription. Do you have one?"                     ║
║  User: "No"                                                      ║
║  → BLOCKED. "Cannot add without prescription."                   ║
║                                                                  ║
║  FLOW 4: Out of Stock (Edge Case)                                ║
║  ────────────────────────────────                                ║
║  User: "Glucophage"                                              ║
║  → "Glucophage is out of stock."                                 ║
║  → "We have Glycomet (same ingredient). Want that?"              ║
║  User: "Yes"                                                     ║
║  → Prescription check → Add to cart                              ║
║                                                                  ║
║  FLOW 5: OTC (No RX needed)                                      ║
║  ──────────────────────────                                      ║
║  User: "Crocin"                                                  ║
║  → "Found Crocin. Add to cart?"                                  ║
║  User: "Yes"                                                     ║
║  → Added directly (no RX check)                                  ║
║                                                                  ║
║  FLOW 6: Antibiotic Block (Safety)                               ║
║  ─────────────────────────────────                               ║
║  User: "Amoxicillin"                                             ║
║  → BLOCKED. "Cannot help with antibiotics."                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    demo_script()
