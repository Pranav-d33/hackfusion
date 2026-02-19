"""Debug NLU output for failing inputs."""
import asyncio
import sys
import json
sys.path.insert(0, '.')

async def main():
    from nlu.nlu_service import parse_input

    test_inputs = [
        "do you have paracetamol?",
        "I need Nurofen",
        "I need some vitamins",
        "I need a skin cream, do you have Eucerin?",
        "Ich brauche Panthenol Spray",
        "I want NORSAN Omega-3 capsules",
        "I'll take the first one",
        "yes please",
        "10 units",
    ]

    for inp in test_inputs:
        result = await parse_input(inp)
        print(f'Input:  "{inp}"')
        print(f'  intent={result.get("intent")}  value={result.get("value")}  conf={result.get("confidence")}')
        if result.get("_original_value"):
            print(f'  cleaned from: "{result["_original_value"]}"')
        print()

if __name__ == '__main__':
    asyncio.run(main())
