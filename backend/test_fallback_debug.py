from nlu.nlu_service import _fallback_parse
import sys

# DEBUG: Test exact inputs that failed in conversation 1 & 9

cases = [
    # Conversation 1 failures
    ("I have a fever, what can you give me?", "fever"),
    ("I'll take the first one", "add_to_cart (1)"),
    ("as prescribed", "dose_response"),
    
    # Conversation 9 failure
    ("I need some vitamins", "vitamin lookup"),
    
    # Mixed brand/indication
    ("I need a skin cream, do you have Eucerin?", "brand_query (Eucerin)"),
    ("do you have Nurofen?", "brand_query (Nurofen)"),
    ("I need something for pain", "indication_query (pain)"),
    
    # German cases
    ("Ich brauche Panthenol Spray", "brand_query (panthenol spray)"),
    ("bitte ein aspirin", "brand_query (aspirin)"),
    
    # Cold case
    ("I've got a really bad cold", "indication_query (cold)"),
]

print("=== NLU FALLBACK DEBUGGER ===")
for text, expected in cases:
    # Simulate minimal state for context-dependent tests
    state = {}
    if "first one" in text:
        state["candidates"] = [{"id": 1}, {"id": 2}]
    if "prescribed" in text:
        state["pending_qty_dose_check"] = {"id": 1, "brand_name": "TestMeds"}
        state["collected_quantity"] = 10
        
    res = _fallback_parse(text, conversation_state=state)
    print(f"\nUser: '{text}'")
    print(f"Expect: {expected}")
    print(f"Got:    {res['intent']} -> {res['value']}")
    print(f"Raw:    {res}")
