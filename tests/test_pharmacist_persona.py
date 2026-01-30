
import asyncio
import json
import sys
import os

# Add backend to sys.path
sys.path.append(os.path.abspath("backend"))

from agents.orchestrator import process_message

async def test_persona():
    session_id = "test_persona_session"
    
    test_cases = [
        "I need medicine for diabetes",
        "Add the first one",
        "Yes I have a prescription",
        "Which medicine should I take for headache?",
        "asdfghjkl" # Trigger fallback
    ]
    
    print("--- Mediloon Pharmacist Persona Test ---")
    
    for user_input in test_cases:
        print(f"\nUser: {user_input}")
        response = await process_message(session_id, user_input)
        print(f"Pharmacist: {response['message']}")
        # print(f"Reasoning: {response.get('trace', [{}])[-1].get('result', {}).get('reasoning', 'N/A')}")

if __name__ == "__main__":
    asyncio.run(test_persona())
