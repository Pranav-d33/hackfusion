"""
Multi-turn multilingual conversation tests — German, Arabic, English.
Tests the full pipeline (NLU → orchestrator → tools) with realistic human inputs.

Purpose: Expose where the regex fallback parser BREAKS for non-English input,
and where LLM-driven understanding would be superior.
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
    """Send a message and get result."""
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
    from db.database import init_db
    from db.seed_data import seed_all
    await init_db()
    await seed_all(skip_translation=True)
    try:
        from vector.chroma_service import index_medications
        await index_medications()
    except Exception:
        pass

    total_p = 0
    total_f = 0

    # ================================================================
    # ENGLISH TESTS
    # ================================================================

    # EN-1: Full order flow with natural language
    p, f = await run_conversation(
        "🇬🇧 EN: Full order flow — fever → select → qty → dose → checkout",
        "en-1-full",
        [
            ("I have a fever, what can you give me?", [
                ("finds fever meds", lambda r: len(r.get('candidates', [])) > 0),
                ("mentions Paracetamol or Nurofen",
                 lambda r: any(w in r['message'].lower() for w in ['paracetamol', 'nurofen'])),
            ]),
            ("I'll take the first one", [
                ("progresses to qty/rx",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_rx', 'ask_dose')),
            ]),
            ("5", [
                ("accepts quantity",
                 lambda r: any(w in r['message'].lower() for w in ['5', 'dose', 'unit', 'dosage'])),
            ]),
            ("as prescribed", [
                ("adds to cart",
                 lambda r: r.get('action_taken') in ('add_to_cart',) or 'added' in r['message'].lower()),
            ]),
            ("checkout", [
                ("triggers checkout",
                 lambda r: r.get('action_taken') in ('checkout', 'checkout_failed')
                           or 'order' in r['message'].lower()),
            ]),
        ]
    )
    total_p += p; total_f += f

    # EN-2: Paraphrased / colloquial English
    p, f = await run_conversation(
        "🇬🇧 EN: Colloquial — 'got anything for a cold?'",
        "en-2-colloquial",
        [
            ("hey, got anything for a cold?", [
                ("finds cold meds", lambda r: len(r.get('candidates', [])) > 0),
                ("mentions cold product",
                 lambda r: any(w in r['message'].lower() for w in ['sinupret', 'mucosolvan', 'umckaloabo'])),
            ]),
        ]
    )
    total_p += p; total_f += f

    # EN-3: Misspelled brand name
    p, f = await run_conversation(
        "🇬🇧 EN: Misspelled — 'paracetamoll' (extra L)",
        "en-3-misspell",
        [
            ("I need paracetamoll", [
                ("finds paracetamol despite typo",
                 lambda r: len(r.get('candidates', [])) > 0 and 'unable to locate' not in r['message'].lower()),
            ]),
        ]
    )
    total_p += p; total_f += f

    # EN-4: Aveeno with confirmation chain
    p, f = await run_conversation(
        "🇬🇧 EN: Aveeno → yes → 100 units",
        "en-4-aveeno",
        [
            ("I want Aveeno Skin Relief Body Lotion 100 units", [
                ("finds Aveeno", lambda r: any('aveeno' in c.get('brand_name', '').lower()
                                               for c in r.get('candidates', []))),
            ]),
            ("yes please", [
                ("progresses to qty flow",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_dose', 'add_to_cart', 'ask_rx')),
            ]),
        ]
    )
    total_p += p; total_f += f

    # ================================================================
    # GERMAN TESTS
    # ================================================================

    # DE-1: Full German conversation — symptom → select → quantity → checkout
    p, f = await run_conversation(
        "🇩🇪 DE: Fieber (fever) → Auswahl → Menge → Kasse",
        "de-1-fieber",
        [
            ("Ich habe Fieber, was können Sie mir empfehlen?", [
                ("finds fever meds",
                 lambda r: len(r.get('candidates', [])) > 0),
                ("mentions paracetamol or nurofen",
                 lambda r: any(w in r['message'].lower() for w in ['paracetamol', 'nurofen'])),
            ]),
            ("Das erste bitte", [
                ("selects first candidate",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_rx', 'ask_dose')),
            ]),
            ("10 Stück", [
                ("accepts German quantity",
                 lambda r: any(w in r['message'].lower() for w in ['10', 'dose', 'dosage'])),
            ]),
        ]
    )
    total_p += p; total_f += f

    # DE-2: German brand search with confirmation
    p, f = await run_conversation(
        "🇩🇪 DE: Panthenol Spray bestellen",
        "de-2-panthenol",
        [
            ("Haben Sie Panthenol Spray?", [
                ("finds Panthenol",
                 lambda r: len(r.get('candidates', [])) > 0 and
                           any('panthenol' in c.get('brand_name', '').lower()
                               for c in r.get('candidates', []))),
            ]),
            ("Ja, bitte hinzufügen", [
                ("German 'yes, add it' progresses",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_dose', 'add_to_cart', 'ask_rx')),
            ]),
        ]
    )
    total_p += p; total_f += f

    # DE-3: German symptom — Erkältung (cold)
    p, f = await run_conversation(
        "🇩🇪 DE: Erkältung → cold products",
        "de-3-erkaeltung",
        [
            ("Ich habe eine starke Erkältung", [
                ("finds cold products",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
        ]
    )
    total_p += p; total_f += f

    # DE-4: German — Kopfschmerzen (headache)
    p, f = await run_conversation(
        "🇩🇪 DE: Kopfschmerzen → headache meds",
        "de-4-kopf",
        [
            ("Ich habe starke Kopfschmerzen", [
                ("finds headache meds",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
        ]
    )
    total_p += p; total_f += f

    # DE-5: Pure German conversational — cancel mid-flow
    p, f = await run_conversation(
        "🇩🇪 DE: Nurofen → Abbrechen (cancel)",
        "de-5-cancel",
        [
            ("Ich möchte Nurofen bestellen", [
                ("finds Nurofen", lambda r: len(r.get('candidates', [])) > 0),
            ]),
            ("Egal, abbrechen", [
                ("German cancel works",
                 lambda r: r.get('action_taken') == 'end' or 'cancel' in r['message'].lower()
                           or 'clear' in r['message'].lower()),
            ]),
        ]
    )
    total_p += p; total_f += f

    # DE-6: Code-switching (German + English mixed)
    p, f = await run_conversation(
        "🇩🇪🇬🇧 DE/EN: Code-switching — Hallo, I need some Eucerin cream",
        "de-6-codesw",
        [
            ("Hallo, I need some Eucerin cream bitte", [
                ("handles mixed language, finds Eucerin",
                 lambda r: len(r.get('candidates', [])) > 0 and 'eucerin' in r['message'].lower()),
            ]),
        ]
    )
    total_p += p; total_f += f

    # ================================================================
    # ARABIC TESTS  (This is where regex will likely BREAK)
    # ================================================================

    # AR-1: Simple Arabic — "I need medicine for fever"
    p, f = await run_conversation(
        "🇸🇦 AR: أحتاج دواء للحمى (fever medicine)",
        "ar-1-fever",
        [
            ("أحتاج دواء للحمى", [
                ("finds fever meds from Arabic",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
        ]
    )
    total_p += p; total_f += f

    # AR-2: Arabic brand name request — Paracetamol
    p, f = await run_conversation(
        "🇸🇦 AR: هل عندكم باراسيتامول (do you have paracetamol?)",
        "ar-2-paracetamol",
        [
            ("هل عندكم باراسيتامول؟", [
                ("finds paracetamol from Arabic script",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
        ]
    )
    total_p += p; total_f += f

    # AR-3: Arabic transliterated brand (Latin script)
    p, f = await run_conversation(
        "🇸🇦 AR: Transliterated — 'ahtaj Nurofen'",
        "ar-3-transliterated",
        [
            ("ahtaj Nurofen min fadlak", [
                ("finds Nurofen from transliterated Arabic",
                 lambda r: len(r.get('candidates', [])) > 0 and 'nurofen' in r['message'].lower()),
            ]),
        ]
    )
    total_p += p; total_f += f

    # AR-4: Arabic symptom — headache
    p, f = await run_conversation(
        "🇸🇦 AR: عندي صداع شديد (I have a severe headache)",
        "ar-4-headache",
        [
            ("عندي صداع شديد", [
                ("finds headache meds from Arabic",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
        ]
    )
    total_p += p; total_f += f

    # AR-5: Arabic confirmation — نعم (yes)
    p, f = await run_conversation(
        "🇸🇦 AR: Paracetamol → نعم (yes) confirmation",
        "ar-5-confirm",
        [
            ("أريد Paracetamol", [
                ("finds paracetamol from Arabic+English mix",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
            ("نعم", [
                ("Arabic 'yes' progresses the flow",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_dose', 'add_to_cart', 'ask_rx')),
            ]),
        ]
    )
    total_p += p; total_f += f

    # AR-6: Arabic vitamins
    p, f = await run_conversation(
        "🇸🇦 AR: أحتاج فيتامينات (I need vitamins)",
        "ar-6-vitamins",
        [
            ("أحتاج فيتامينات", [
                ("finds vitamin products from Arabic",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
        ]
    )
    total_p += p; total_f += f

    # AR-7: Arabic cold
    p, f = await run_conversation(
        "🇸🇦 AR: عندي زكام (I have a cold)",
        "ar-7-cold",
        [
            ("عندي زكام شديد", [
                ("finds cold meds from Arabic",
                 lambda r: len(r.get('candidates', [])) > 0),
            ]),
        ]
    )
    total_p += p; total_f += f

    # ================================================================
    # EDGE CASES — Language mixing, ambiguity
    # ================================================================

    # EDGE-1: Fully ambiguous — "10"
    p, f = await run_conversation(
        "🌐 EDGE: Bare number after Aveeno shown",
        "edge-1-bare",
        [
            ("I want Aveeno", [
                ("finds Aveeno", lambda r: len(r.get('candidates', [])) > 0),
            ]),
            ("yes", [
                ("yes progresses",
                 lambda r: r.get('action_taken') in ('ask_quantity', 'ask_dose', 'ask_rx')),
            ]),
            ("10", [
                ("bare number as quantity",
                 lambda r: '10' in r['message'] or r.get('action_taken') in ('ask_dose', 'add_to_cart')),
            ]),
        ]
    )
    total_p += p; total_f += f

    # EDGE-2: Emoji-laden input
    p, f = await run_conversation(
        "🌐 EDGE: Emoji input — '🤒 need paracetamol 💊'",
        "edge-2-emoji",
        [
            ("🤒 need paracetamol 💊", [
                ("handles emoji, finds paracetamol",
                 lambda r: len(r.get('candidates', [])) > 0 and 'paracetamol' in r['message'].lower()),
            ]),
        ]
    )
    total_p += p; total_f += f

    # ================================================================
    # SUMMARY
    # ================================================================
    print(f"\n{'='*70}")
    print(f"{B}MULTILINGUAL TEST SUMMARY{E}")
    print(f"{'='*70}")

    total = total_p + total_f
    if total > 0:
        pct = total_p / total * 100
        color = G if pct >= 80 else Y if pct >= 60 else R
        print(f"  {G}Passed: {total_p}{E}")
        print(f"  {R}Failed: {total_f}{E}")
        print(f"  {color}Score:  {pct:.0f}% ({total_p}/{total}){E}")
    print()

    # Breakdown by language
    print(f"  {B}Expected failures:{E}")
    print(f"    Arabic (pure script): Regex fallback has ZERO Arabic support")
    print(f"    German (complex sentences): Regex misses paraphrased German")
    print(f"    Misspellings: Vector search may or may not catch them")
    print()

    if total_f > 0:
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
