"""
Fallback Demo Script
Cached responses for common demo scenarios if LLM times out.
Updated for German pharmacy product catalog.
"""
from typing import Dict, Any, Optional

FALLBACK_RESPONSES = {
    # Product queries (German pharmacy products)
    "vitamin": {
        "message": "Here are vitamin products:\n1. Vitamin D3\n2. Vitamin C Complex\n3. B-Vitamin Komplex\n\nWhich one would you like?",
        "tts_message": "We have Vitamin D3, Vitamin C Complex, and B-Vitamin Komplex. Which one?",
    },
    "calcium": {
        "message": "Here are calcium products:\n1. Calcium 600mg\n2. Calcium + Vitamin D3\n\nWhich one would you like?",
        "tts_message": "We have Calcium 600 and Calcium plus D3. Which one?",
    },
    "omega": {
        "message": "Found Omega-3 Fish Oil capsules. Would you like to add it to your cart?",
        "tts_message": "Found Omega-3. Would you like to add it to your cart?",
    },
    "magnesium": {
        "message": "Found Magnesium supplements. Would you like to add it to your cart?",
        "tts_message": "Found Magnesium. Would you like to add it?",
    },

    # RX responses
    "rx_confirm": {
        "message": "Great! Adding to your cart. Say 'checkout' when you're done.",
        "tts_message": "Added to cart. Say checkout when done.",
    },
    "rx_deny": {
        "message": "I'm sorry, I cannot add this product to your cart without a prescription. Would you like to look for something else?",
        "tts_message": "Sorry, I cannot add this without a prescription. Would you like something else?",
    },

    # Unclear
    "unclear": {
        "message": "I'm not sure what you're looking for. Say a product name like 'Vitamin D3' or try a keyword like 'calcium'.",
        "tts_message": "I didn't catch that. Say a product name or try a keyword.",
    },
}


def get_fallback_response(query: str) -> Optional[Dict[str, Any]]:
    """Get a cached fallback response for a query."""
    query = query.lower().strip()

    if query in FALLBACK_RESPONSES:
        return FALLBACK_RESPONSES[query]

    for key, response in FALLBACK_RESPONSES.items():
        if key in query or query in key:
            return response

    return FALLBACK_RESPONSES["unclear"]


def demo_script():
    """Print demo script for live presentation."""
    print("""
╔══════════════════════════════════════════════════════════════════╗
║               MEDILOON DEMO SCRIPT (V2)                          ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  1. Open http://localhost:8000 in browser                        ║
║  2. Say "Show me vitamin products"                               ║
║  3. Select a product, add to cart                                ║
║  4. Say "checkout"                                               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
""")

if __name__ == "__main__":
    demo_script()
