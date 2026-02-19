"""
Multi-turn human-like conversation tests for the Mediloon pipeline.
Simulates real user flows end-to-end through the orchestrator.
"""
import asyncio
import sys
sys.path.insert(0, '.')

# ANSI colors
G = '\033[92m'  # green
R = '\033[91m'  # red
Y = '\033[93m'  # yellow
C = '\033[96m'  # cyan
B = '\033[1m'   # bold
E = '\033[0m'   # reset


async def chat(session_id, user_msg, turn_num):
    """Send a message and print the exchange."""
    from agents.orchestrator import process_message
    result = await process_message(session_id, user_msg)
    msg = result.get('message', '')
    action = result.get('action_taken', '?')
    cands = result.get('candidates', [])
    cart = result.get('cart', {})

    print(f"  {C}User [{turn_num}]:{E} {user_msg}")
    print(f"  {Y}Bot  [{turn_num}]:{E} {msg[:200]}")
    print(f"         {B}action={action} candidates={len(cands)} cart_items={cart.get('item_count', 0)}{E}")
    return result


async def run_conversation(name, session_id, turns):
    """Run a multi-turn conversation and check assertions."""
    print(f"\n{'='*70}")
    print(f"{B}CONVERSATION: {name}{E}")
    print(f"{'='*70}")
    passed = 0
    failed = 0
    for i, (user_msg, checks) in enumerate(turns, 1):
        result = await chat(session_id, user_msg, i)
        # Run assertions
        for desc, check_fn in checks:
            try:
                ok = check_fn(result)
                if ok:
                    print(f"         {G}✓ {desc}{E}")
                    passed += 1
                else:
                    print(f"         {R}✗ {desc}{E}")
                    failed += 1
            except Exception as e:
                print(f"         {R}✗ {desc} — exception: {e}{E}")
                failed += 1
        print()
    return passed, failed


async def main():
    # Init DB
    from db.database import init_db
    from db.seed_data import seed_all
    await init_db()
    await seed_all(skip_translation=True)

    # Force reindex chroma
    try:
        from vector.chroma_service import index_medications
        await index_medications()
    except Exception:
        pass

    total_passed = 0
    total_failed = 0

    # ================================================================
    # CONVERSATION 1: Symptom-based ordering (fever → select → qty → checkout)
    # The original failing flow: "I have fever" returned "out of stock"
    # ================================================================
    p, f = await run_conversation(
        "Fever symptom → select Paracetamol → add to cart → checkout",
        "conv-1-fever",
        [
            ("I have a fever, what can you give me?", [
                ("should find candidates", lambda r: len(r.get('candidates', [])) > 0),
                ("should mention Paracetamol or Nurofen",
                 lambda r: any(w in r['message'].lower() for w in ['paracetamol', 'nurofen'])),
            ]),
            ("I'll take the first one", [
                ("should be add/select action",
                 lambda r: r.get('action_taken') in ('ask_rx', 'ask_quantity', 'search_single', 'ask_dose')),
            ]),
            ("10 units", [
                ("should acknowledge quantity or ask dose",
                 lambda r: any(w in r['message'].lower() for w in ['10', 'dose', 'unit', 'added', 'cart'])),
            ]),
            ("as prescribed", [
                ("should add to cart",
                 lambda r: r.get('action_taken') in ('add_to_cart', 'ask_dose')
                           or 'cart' in r['message'].lower()
                           or 'added' in r['message'].lower()),
            ]),
            ("checkout", [
                ("should trigger checkout",
                 lambda r: r.get('action_taken') in ('checkout', 'checkout_failed')
                           or 'checkout' in r['message'].lower()
                           or 'order' in r['message'].lower()),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 2: Brand name + qty (the original failing Aveeno case)
    # ================================================================
    p, f = await run_conversation(
        "Order Aveeno Skin Relief Body Lotion 100 units (was broken)",
        "conv-2-aveeno",
        [
            ("i want to order Aveeno Skin Relief Body Lotion 100 units", [
                ("should find Aveeno", lambda r: len(r.get('candidates', [])) > 0),
                ("candidate should be Aveeno",
                 lambda r: any('aveeno' in c.get('brand_name', '').lower()
                               for c in r.get('candidates', []))),
                ("should NOT say 'unable to locate'",
                 lambda r: 'unable to locate' not in r['message'].lower()),
            ]),
            ("yes please", [
                ("should progress to qty/add flow",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_dose', 'add_to_cart', 'ask_rx')),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 3: German-language input with follow-up
    # ================================================================
    p, f = await run_conversation(
        "German product: Panthenol Spray → yes → quantity → checkout",
        "conv-3-german",
        [
            ("Ich brauche Panthenol Spray", [
                ("should find Panthenol",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("candidate should be Panthenol",
                 lambda r: any('panthenol' in c.get('brand_name', '').lower()
                               for c in r.get('candidates', []))),
            ]),
            ("yes, add it", [
                ("should progress to add/quantity flow",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_dose', 'add_to_cart', 'ask_rx')),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 4: Fuzzy / partial name search
    # ================================================================
    p, f = await run_conversation(
        "Partial name: 'paracetamol' (not exact product name)",
        "conv-4-fuzzy",
        [
            ("do you have paracetamol?", [
                ("should find Paracetamol product",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("message should mention paracetamol",
                 lambda r: 'paracetamol' in r['message'].lower()),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 5: Allergy indication → pick specific product
    # ================================================================
    p, f = await run_conversation(
        "Allergy symptom → pick Cetirizin from results",
        "conv-5-allergy",
        [
            ("I need something for my allergies", [
                ("should find allergy products",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("should mention allergy-related product",
                 lambda r: any(w in r['message'].lower()
                               for w in ['cetirizin', 'vividrin', 'livocab', 'cromo', 'allergi'])),
            ]),
            ("Cetirizin please", [
                ("should handle selection",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_rx', 'search_single',
                                                      'search_multiple', 'ask_dose', 'add_to_cart')),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 6: Multi-word brand search
    # ================================================================
    p, f = await run_conversation(
        "Multi-word: NORSAN Omega-3 capsules",
        "conv-6-omega",
        [
            ("I want NORSAN Omega-3 capsules", [
                ("should find NORSAN product",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("should mention NORSAN or Omega",
                 lambda r: any(w in r['message'].lower() for w in ['norsan', 'omega'])),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 7: Cold symptom flow
    # ================================================================
    p, f = await run_conversation(
        "Cold symptom → should find Sinupret/Mucosolvan",
        "conv-7-cold",
        [
            ("I've got a really bad cold", [
                ("should find cold products",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("should mention cold-relevant product",
                 lambda r: any(w in r['message'].lower()
                               for w in ['sinupret', 'umckaloabo', 'mucosolvan', 'paracetamol'])),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 8: Start → cancel flow
    # ================================================================
    p, f = await run_conversation(
        "Start ordering then cancel mid-flow",
        "conv-8-cancel",
        [
            ("I need Nurofen", [
                ("should find Nurofen", lambda r: len(r.get('candidates', [])) > 0),
            ]),
            ("never mind, cancel", [
                ("should end/cancel conversation",
                 lambda r: r.get('action_taken') == 'end'
                           or r.get('end_conversation', False)
                           or 'cancel' in r['message'].lower()
                           or 'clear' in r['message'].lower()),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 9: Vitamin / supplement search
    # ================================================================
    p, f = await run_conversation(
        "Vitamin supplement search",
        "conv-9-vitamin",
        [
            ("I need some vitamins", [
                ("should find vitamin products",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("should mention vitamin-related product",
                 lambda r: any(w in r['message'].lower()
                               for w in ['vitamin', 'vitasprint', 'multivitamin', 'vigantolvit'])),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # CONVERSATION 10: Direct brand + confirmation chain
    # ================================================================
    p, f = await run_conversation(
        "Eucerin skin cream search",
        "conv-10-skin",
        [
            ("I need a skin cream, do you have Eucerin?", [
                ("should find Eucerin product",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("should mention Eucerin",
                 lambda r: 'eucerin' in r['message'].lower()),
            ]),
        ]
    )
    total_passed += p; total_failed += f

    # ================================================================
    # SUMMARY
    # ================================================================
    print(f"\n{'='*70}")
    print(f"{B}TEST SUMMARY{E}")
    print(f"{'='*70}")
    print(f"  {G}Passed: {total_passed}{E}")
    print(f"  {R}Failed: {total_failed}{E}")
    total = total_passed + total_failed
    if total > 0:
        pct = total_passed / total * 100
        color = G if pct >= 80 else Y if pct >= 60 else R
        print(f"  {color}Score:  {pct:.0f}% ({total_passed}/{total}){E}")
    print()

    if total_failed > 0:
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
