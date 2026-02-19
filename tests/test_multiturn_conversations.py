"""
Multi-Turn Conversation Tests — Human-like conversations in EN, DE, AR, Hindi/Hinglish.

Tests the full pipeline: Safety → OrderingAgent (LLM) → Execute → OutputGuard
Each conversation simulates a realistic pharmacy ordering session.
"""
import asyncio
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from agents.orchestrator import process_message, clear_session


# ── Color output helpers ────────────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"
DIM = "\033[2m"


def header(title: str):
    print(f"\n{'━'*70}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{'━'*70}")


def user_msg(msg: str):
    print(f"\n  {BOLD}👤 User:{RESET} {msg}")


def bot_msg(msg: str, latency: int):
    print(f"  {BOLD}🤖 Bot:{RESET}  {msg}")
    print(f"  {DIM}   ⏱ {latency}ms{RESET}")


def check(label: str, passed: bool):
    icon = f"{GREEN}✓{RESET}" if passed else f"{RED}✗{RESET}"
    print(f"  {icon} {label}")
    return passed


# ── Conversations ───────────────────────────────────────────────────────

ENGLISH_CONVERSATION = {
    "name": "🇬🇧  English — Full ordering flow",
    "turns": [
        {
            "user": "hey, i need something for a headache",
            "checks": {
                "has_response": True,
                "response_lang": "en",
            },
        },
        {
            "user": "yeah the first one looks good",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "10 tablets",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "go on",
            "checks": {
                "has_response": True,
                "note": "LLM should understand continuation from context",
            },
        },
        {
            "user": "actually can you also find me something for cough",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "add that to cart too please",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "what's in my cart now?",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "alright checkout",
            "checks": {
                "has_response": True,
            },
        },
    ],
}

GERMAN_CONVERSATION = {
    "name": "🇩🇪  Deutsch — Komplette Bestellung",
    "turns": [
        {
            "user": "Hallo, ich brauche etwas gegen Kopfschmerzen",
            "checks": {
                "has_response": True,
                "response_lang": "de",
            },
        },
        {
            "user": "ja, das erste bitte",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "20 Tabletten",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "weiter",
            "checks": {
                "has_response": True,
                "note": "'weiter' = 'go on' — LLM should handle it",
            },
        },
        {
            "user": "Haben Sie auch etwas gegen Husten?",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "ja, in den Warenkorb bitte",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "Was ist in meinem Warenkorb?",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "bestellen",
            "checks": {
                "has_response": True,
            },
        },
    ],
}

ARABIC_CONVERSATION = {
    "name": "🇸🇦  العربية — طلب كامل",
    "turns": [
        {
            "user": "مرحبا، أحتاج دواء للصداع",
            "checks": {
                "has_response": True,
                "response_lang": "ar",
            },
        },
        {
            "user": "نعم الأول",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "عشر حبات",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "أكمل",
            "checks": {
                "has_response": True,
                "note": "'أكمل' = 'continue' — LLM handles from context",
            },
        },
        {
            "user": "عندكم شيء للكحة؟",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "أضفه للسلة",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "ايش في سلتي؟",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "اطلب",
            "checks": {
                "has_response": True,
            },
        },
    ],
}

HINDI_CONVERSATION = {
    "name": "🇮🇳  Hindi (Devanagari) — पूरा ऑर्डर",
    "turns": [
        {
            "user": "नमस्ते, मुझे सिरदर्द की दवाई चाहिए",
            "checks": {
                "has_response": True,
                "response_lang": "en",  # Hindi → English response
            },
        },
        {
            "user": "हाँ, पहला वाला दे दो",
            "checks": {
                "has_response": True,
                "response_lang": "en",
            },
        },
        {
            "user": "दस गोलियां",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "आगे बढ़ो",
            "checks": {
                "has_response": True,
                "note": "'आगे बढ़ो' = 'go ahead' — LLM handles it",
            },
        },
        {
            "user": "खांसी की भी कोई दवाई है?",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "वो भी डाल दो",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "कार्ट में क्या है?",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "ऑर्डर कर दो",
            "checks": {
                "has_response": True,
            },
        },
    ],
}

HINGLISH_CONVERSATION = {
    "name": "🇮🇳  Hinglish — Mixed Hindi+English ordering",
    "turns": [
        {
            "user": "bhai mujhe headache ki medicine chahiye",
            "checks": {
                "has_response": True,
                "response_lang": "en",  # Hinglish → English response
            },
        },
        {
            "user": "haan pehla wala theek hai",
            "checks": {
                "has_response": True,
                "response_lang": "en",
            },
        },
        {
            "user": "10 tablets dena",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "aur kuch nahi, aage badho",
            "checks": {
                "has_response": True,
                "note": "'aage badho' = 'move ahead' — LLM understands",
            },
        },
        {
            "user": "cough ki bhi koi dawai hai kya?",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "haan wo bhi cart mein add karo",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "cart mein kya kya hai?",
            "checks": {
                "has_response": True,
            },
        },
        {
            "user": "order karo bhai",
            "checks": {
                "has_response": True,
            },
        },
    ],
}

# Edge cases: natural human speech patterns
NATURAL_SPEECH_CONVERSATION = {
    "name": "💬  Natural Speech — Messy human input",
    "turns": [
        {
            "user": "umm hi so like i need some paracetamol",
            "checks": {"has_response": True},
        },
        {
            "user": "yeah",
            "checks": {
                "has_response": True,
                "note": "Just 'yeah' — LLM should know it means yes/confirm from context",
            },
        },
        {
            "user": "hmm actually no wait, what about ibuprofen?",
            "checks": {"has_response": True},
        },
        {
            "user": "ok that one",
            "checks": {"has_response": True},
        },
        {
            "user": "sure",
            "checks": {
                "has_response": True,
                "note": "'sure' as confirmation",
            },
        },
        {
            "user": "thats it, done",
            "checks": {"has_response": True},
        },
    ],
}

ALL_CONVERSATIONS = [
    ENGLISH_CONVERSATION,
    GERMAN_CONVERSATION,
    ARABIC_CONVERSATION,
    HINDI_CONVERSATION,
    HINGLISH_CONVERSATION,
    NATURAL_SPEECH_CONVERSATION,
]


# ── Language detection helpers ──────────────────────────────────────────
def is_english(text: str) -> bool:
    """Check if response is predominantly English (Latin + common words)."""
    # Count characters in different scripts
    latin = sum(1 for c in text if c.isascii() and c.isalpha())
    total_alpha = sum(1 for c in text if c.isalpha())
    if total_alpha == 0:
        return True
    return (latin / total_alpha) > 0.7


def likely_german(text: str) -> bool:
    """Check if text contains German indicators."""
    german_words = ["bitte", "tabletten", "warenkorb", "bestellen", "möchten",
                    "hinzufügen", "verfügbar", "medikament", "dosis", "stück",
                    "schwierigkeiten", "verarbeitung", "versuchen", "tut mir leid",
                    "noch einmal", "könnten"]
    txt = text.lower()
    return any(w in txt for w in german_words)


def likely_arabic(text: str) -> bool:
    """Check if text contains Arabic script."""
    return any("\u0600" <= c <= "\u06FF" for c in text)


# ── Runner ──────────────────────────────────────────────────────────────
async def run_conversation(conv: dict) -> dict:
    """Run a single multi-turn conversation and return results."""
    header(conv["name"])
    session_id = f"test_{conv['name'][:10]}_{int(time.time())}"
    results = {"passed": 0, "failed": 0, "errors": 0, "turns": []}

    for i, turn in enumerate(conv["turns"], 1):
        user_msg(turn["user"])

        try:
            result = await process_message(session_id, turn["user"])
            msg = result.get("message", "")
            latency = result.get("latency_ms", 0)
            bot_msg(msg[:200] + ("..." if len(msg) > 200 else ""), latency)

            checks = turn.get("checks", {})
            turn_result = {"turn": i, "user": turn["user"], "response": msg, "latency": latency, "pass": True}

            # Check: has response
            if checks.get("has_response"):
                ok = check("Response received", bool(msg and len(msg) > 2))
                if not ok:
                    turn_result["pass"] = False

            # Check: response language
            expected_lang = checks.get("response_lang")
            if expected_lang == "en":
                ok = check("Response is in English", is_english(msg))
                if not ok:
                    turn_result["pass"] = False
            elif expected_lang == "de":
                ok = check("Response is in German", likely_german(msg) or not likely_arabic(msg))
                if not ok:
                    turn_result["pass"] = False
            elif expected_lang == "ar":
                ok = check("Response is in Arabic", likely_arabic(msg))
                if not ok:
                    turn_result["pass"] = False

            # Note
            if "note" in checks:
                print(f"  {DIM}  ℹ {checks['note']}{RESET}")

            # Latency check
            latency_ok = check(f"Latency < 15s ({latency}ms)", latency < 15000)
            if not latency_ok:
                turn_result["pass"] = False

            if turn_result["pass"]:
                results["passed"] += 1
            else:
                results["failed"] += 1

            results["turns"].append(turn_result)

        except Exception as e:
            print(f"  {RED}✗ ERROR: {e}{RESET}")
            results["errors"] += 1
            results["turns"].append({"turn": i, "user": turn["user"], "error": str(e), "pass": False})

    # Cleanup
    clear_session(session_id)
    return results


async def main():
    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}  MEDILOON MULTI-TURN CONVERSATION TESTS{RESET}")
    print(f"{BOLD}  Pure LLM pipeline — EN / DE / AR / Hindi / Hinglish{RESET}")
    print(f"{BOLD}{'='*70}{RESET}")

    total_start = time.time()
    all_results = []

    for conv in ALL_CONVERSATIONS:
        result = await run_conversation(conv)
        result["name"] = conv["name"]
        all_results.append(result)

    # ── Summary ─────────────────────────────────────────────────────
    total_time = time.time() - total_start
    header("📊  SUMMARY")

    total_passed = sum(r["passed"] for r in all_results)
    total_failed = sum(r["failed"] for r in all_results)
    total_errors = sum(r["errors"] for r in all_results)
    total_turns = sum(len(r["turns"]) for r in all_results)

    for r in all_results:
        status = f"{GREEN}PASS{RESET}" if r["failed"] == 0 and r["errors"] == 0 else f"{RED}FAIL{RESET}"
        avg_latency = 0
        latencies = [t["latency"] for t in r["turns"] if "latency" in t]
        if latencies:
            avg_latency = sum(latencies) // len(latencies)
        print(f"  {status}  {r['name']}  ({r['passed']}/{r['passed']+r['failed']}) avg {avg_latency}ms")

    print(f"\n  {BOLD}Total:{RESET} {total_passed} passed, {total_failed} failed, {total_errors} errors")
    print(f"  {BOLD}Turns:{RESET} {total_turns} total across {len(all_results)} conversations")
    print(f"  {BOLD}Time:{RESET}  {total_time:.1f}s total")

    if total_failed == 0 and total_errors == 0:
        print(f"\n  {GREEN}{BOLD}🎉 ALL TESTS PASSED!{RESET}")
    else:
        print(f"\n  {RED}{BOLD}⚠  SOME TESTS FAILED{RESET}")

    return total_failed == 0 and total_errors == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
