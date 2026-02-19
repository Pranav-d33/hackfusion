"""Quick functional test for the pipeline fixes."""
import asyncio
import sys
sys.path.insert(0, '.')


async def test():
    # Test 1: NLU value cleaning
    from nlu.nlu_service import _clean_nlu_value

    tests = [
        ({'intent': 'brand_query', 'value': 'to order aveeno skin relief body lotion 100 units'},
         'filler+qty strip'),
        ({'intent': 'brand_query', 'value': 'Aveeno Skin Relief Body Lotion'},
         'clean already'),
        ({'intent': 'brand_query', 'value': 'i want to order Paracetamol 20 strips'},
         'filler+qty'),
        ({'intent': 'indication_query', 'value': 'fever'},
         'indication'),
    ]

    print('=== NLU VALUE CLEANING ===')
    for nlu, desc in tests:
        result = _clean_nlu_value(nlu.copy(), '')
        print(f'  [{desc}] "{nlu["value"]}" -> "{result["value"]}"')

    # Test 2: Vector search query cleaning
    from vector.chroma_service import _clean_search_query

    queries = [
        'to order aveeno skin relief body lotion 100 units',
        'i want to order Paracetamol 20 strips',
        'can i get some Nurofen',
        'Aveeno Skin Relief Body Lotion',
        'i need medicine for fever',
    ]

    print('\n=== SEARCH QUERY CLEANING ===')
    for q in queries:
        cleaned = _clean_search_query(q)
        print(f'  "{q}" -> "{cleaned}"')

    # Test 3: Vector search with cleaned query
    from vector.chroma_service import vector_search, index_medications
    await index_medications()

    print('\n=== VECTOR SEARCH RESULTS ===')
    search_tests = [
        'Aveeno Skin Relief Body Lotion',
        'to order aveeno skin relief body lotion 100 units',
        'Paracetamol',
        'Nurofen',
        'Panthenol',
    ]
    for q in search_tests:
        results = await vector_search(q, top_k=2)
        if results:
            names = [f"{r['brand_name']} (sim={r['similarity']})" for r in results]
            print(f'  "{q}" -> {names}')
        else:
            print(f'  "{q}" -> NO RESULTS')

    # Test 4: Indication lookup with symptom map
    from tools.query_tools import lookup_by_indication

    print('\n=== INDICATION LOOKUP ===')
    for indication in ['fever', 'cold', 'allergy', 'skin', 'vitamin']:
        results = await lookup_by_indication(indication)
        if results:
            names = [r['brand_name'] for r in results[:3]]
            print(f'  "{indication}" -> {names}')
        else:
            print(f'  "{indication}" -> NO RESULTS')

    # Test 5: End-to-end orchestrator test (the actual failing user flows)
    from db.database import init_db
    from db.seed_data import seed_all
    await init_db()
    await seed_all(skip_translation=True)

    from agents.orchestrator import process_message

    print('\n=== END-TO-END ORCHESTRATOR ===')
    # Simulate the user's failing scenario: "I have fever"
    result1 = await process_message('test-e2e-1', 'I have fever I want to order some medicine')
    has_candidates = len(result1.get('candidates', [])) > 0
    print(f'  "I have fever..." -> candidates={has_candidates}, action={result1.get("action_taken")}')
    if has_candidates:
        print(f'    Found: {[c["brand_name"] for c in result1["candidates"][:3]]}')
    print(f'    Message: {result1["message"][:120]}...')

    # Simulate: "i want to order Aveeno Skin Relief Body Lotion 100 units"
    result2 = await process_message('test-e2e-2', 'i want to order Aveeno Skin Relief Body Lotion 100 units')
    has_candidates2 = len(result2.get('candidates', [])) > 0
    print(f'  "i want to order Aveeno..." -> candidates={has_candidates2}, action={result2.get("action_taken")}')
    if has_candidates2:
        print(f'    Found: {[c["brand_name"] for c in result2["candidates"][:3]]}')
    print(f'    Message: {result2["message"][:120]}...')

    print('\n=== ALL TESTS COMPLETE ===')


if __name__ == '__main__':
    asyncio.run(test())
