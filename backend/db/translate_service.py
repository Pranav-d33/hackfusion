"""
Stage 3: Translation Service
Translates localized_strings via LLM (OpenRouter) and populates
localized_string_translations for any target language.
Also seeds the deterministic language_term_mappings table.
"""
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, PLANNER_MODEL
from db.database import execute_query, execute_write

# ── Batch config ────────────────────────────────────────────
BATCH_SIZE = 10          # strings per LLM call
MAX_RETRIES = 2
REQUEST_TIMEOUT = 30.0   # seconds

# ── Deterministic term mappings ─────────────────────────────

TERM_MAPPINGS: List[Dict[str, Any]] = [
    # dosage_frequency
    {"domain": "dosage_frequency", "de": "Einmal täglich",      "en": "Once daily",        "key": "once_daily"},
    {"domain": "dosage_frequency", "de": "Zweimal täglich",     "en": "Twice daily",       "key": "twice_daily"},
    {"domain": "dosage_frequency", "de": "Dreimal täglich",     "en": "Three times daily", "key": "three_times_daily"},
    {"domain": "dosage_frequency", "de": "Bei Bedarf",          "en": "As needed",         "key": "as_needed"},
    {"domain": "dosage_frequency", "de": "Nach Bedarf",         "en": "As needed",         "key": "as_needed"},
    {"domain": "dosage_frequency", "de": "Morgens",             "en": "Morning",           "key": "morning"},
    {"domain": "dosage_frequency", "de": "Abends",              "en": "Evening",           "key": "evening"},
    # English→English passthrough (data already in English)
    {"domain": "dosage_frequency", "de": "Once daily",          "en": "Once daily",        "key": "once_daily"},
    {"domain": "dosage_frequency", "de": "Twice daily",         "en": "Twice daily",       "key": "twice_daily"},
    {"domain": "dosage_frequency", "de": "Three times daily",   "en": "Three times daily", "key": "three_times_daily"},
    {"domain": "dosage_frequency", "de": "As needed",           "en": "As needed",         "key": "as_needed"},
    # prescription_flag
    {"domain": "prescription_flag", "de": "Ja",   "en": "Yes", "key": "yes"},
    {"domain": "prescription_flag", "de": "Nein", "en": "No",  "key": "no"},
    {"domain": "prescription_flag", "de": "Yes",  "en": "Yes", "key": "yes"},
    {"domain": "prescription_flag", "de": "No",   "en": "No",  "key": "no"},
    # generic_term
    {"domain": "generic_term", "de": "Tabletten",       "en": "Tablets",      "key": "tablets"},
    {"domain": "generic_term", "de": "Kapseln",         "en": "Capsules",     "key": "capsules"},
    {"domain": "generic_term", "de": "Tropfen",         "en": "Drops",        "key": "drops"},
    {"domain": "generic_term", "de": "Spray",           "en": "Spray",        "key": "spray"},
    {"domain": "generic_term", "de": "Salbe",           "en": "Ointment",     "key": "ointment"},
    {"domain": "generic_term", "de": "Creme",           "en": "Cream",        "key": "cream"},
    {"domain": "generic_term", "de": "Lösung",          "en": "Solution",     "key": "solution"},
    {"domain": "generic_term", "de": "Saft",            "en": "Syrup",        "key": "syrup"},
    {"domain": "generic_term", "de": "Filmtabletten",   "en": "Film tablets", "key": "film_tablets"},
    {"domain": "generic_term", "de": "Retardkapseln",   "en": "Sustained-release capsules", "key": "sr_capsules"},
    {"domain": "generic_term", "de": "Hartkapseln",     "en": "Hard capsules", "key": "hard_capsules"},
    {"domain": "generic_term", "de": "Dragées",         "en": "Dragées",      "key": "dragees"},
    {"domain": "generic_term", "de": "Augentropfen",    "en": "Eye drops",    "key": "eye_drops"},
    {"domain": "generic_term", "de": "Schaum",          "en": "Foam",         "key": "foam"},
    {"domain": "generic_term", "de": "Schmelztabletten", "en": "Orally disintegrating tablets", "key": "odt"},
    {"domain": "generic_term", "de": "magensaftresistente Tabletten", "en": "Enteric-coated tablets", "key": "enteric_tablets"},
    {"domain": "generic_term", "de": "Einzeldosis",     "en": "Single dose",  "key": "single_dose"},
    {"domain": "generic_term", "de": "Flüssigkeit zum Einnehmen", "en": "Oral liquid", "key": "oral_liquid"},
]


async def seed_term_mappings():
    """Insert deterministic German↔English term mappings."""
    count = 0
    for m in TERM_MAPPINGS:
        try:
            await execute_write(
                """INSERT OR IGNORE INTO language_term_mappings
                   (domain, source_language, source_text, target_language, target_text, normalized_key, confidence)
                   VALUES (?, 'de', ?, 'en', ?, ?, 1.0)""",
                (m["domain"], m["de"], m["en"], m["key"]),
            )
            count += 1
        except Exception:
            pass
    print(f"  ✅ Term mappings seeded ({count} entries)")


# ── LLM translation ─────────────────────────────────────────

TRANSLATE_SYSTEM_PROMPT = """You are a pharmaceutical translation engine.

TASK: Translate the given German pharmaceutical texts to {target_lang_name}.

RULES:
1. Keep brand names UNCHANGED (e.g., "Panthenol", "NORSAN", "Mucosolvan").
2. Keep dosage numbers and units UNCHANGED (e.g., "46,3 mg/g", "500 mg", "200 ml").
3. Keep PZN numbers unchanged.
4. Translate medical/pharmaceutical descriptive text accurately.
5. Preserve the meaning; do NOT add or remove information.
6. If a text is already in {target_lang_name}, return it as-is.

OUTPUT: Return a JSON array with exactly the same number of elements as the input.
Each element must be a JSON object: {{"idx": <index>, "text": "<translated text>"}}
Return ONLY the JSON array — no markdown, no explanation."""

LANG_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "fr": "French",
    "es": "Spanish",
    "ar": "Arabic",
    "tr": "Turkish",
    "de": "German",
}


async def _call_llm(texts: List[str], target_lang: str) -> List[Optional[str]]:
    """Send a batch of texts to OpenRouter for translation."""
    target_name = LANG_NAMES.get(target_lang, target_lang)
    prompt_items = "\n".join(
        f'{i}. "{t}"' for i, t in enumerate(texts)
    )
    user_prompt = f"Translate these {len(texts)} German pharmaceutical texts to {target_name}:\n\n{prompt_items}"

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": PLANNER_MODEL,
        "messages": [
            {"role": "system", "content": TRANSLATE_SYSTEM_PROMPT.format(target_lang_name=target_name)},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
    }

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                resp = await client.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()

            content = data["choices"][0]["message"]["content"].strip()
            # Strip markdown fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3].strip()

            parsed = json.loads(content)
            results: List[Optional[str]] = [None] * len(texts)
            for item in parsed:
                idx = item.get("idx", item.get("index"))
                text = item.get("text", item.get("translation"))
                if idx is not None and text is not None and 0 <= idx < len(texts):
                    results[idx] = text
            return results

        except Exception as e:
            if attempt < MAX_RETRIES:
                await asyncio.sleep(1.5 * (attempt + 1))
            else:
                print(f"    ⚠ LLM translation failed after {MAX_RETRIES + 1} attempts: {e}")
                return [None] * len(texts)


async def translate_strings(
    target_language: str = "en",
    import_run_id: Optional[int] = None,
) -> Dict[str, int]:
    """
    Translate all untranslated localized_strings into target_language.
    Returns stats dict.
    """
    print(f"  ⏳ Translating to '{target_language}'...")

    # Find strings that don't yet have a translation in the target language
    rows = await execute_query(
        """SELECT ls.id, ls.namespace, ls.string_key, ls.source_language, ls.source_text
           FROM localized_strings ls
           WHERE NOT EXISTS (
               SELECT 1 FROM localized_string_translations lst
               WHERE lst.localized_string_id = ls.id
                 AND lst.language_code = ?
           )
           ORDER BY ls.id""",
        (target_language,),
    )

    if not rows:
        print(f"  ✅ No strings to translate for '{target_language}'")
        return {"total": 0, "translated": 0, "failed": 0}

    # Create a translation job
    job_id = await execute_write(
        """INSERT INTO translation_jobs
           (import_run_id, table_name, column_name, source_language, target_language,
            status, total_items, started_at)
           VALUES (?, 'localized_strings', 'source_text', 'de', ?, 'running', ?, CURRENT_TIMESTAMP)""",
        (import_run_id, target_language, len(rows)),
    )

    # If target == source, just copy through
    if target_language == "de":
        for r in rows:
            await execute_write(
                """INSERT OR IGNORE INTO localized_string_translations
                   (localized_string_id, language_code, translated_text,
                    translation_status, confidence, provider)
                   VALUES (?, ?, ?, 'verified', 1.0, 'identity')""",
                (r["id"], target_language, r["source_text"]),
            )
        await execute_write(
            """UPDATE translation_jobs
               SET status='success', processed_items=?, finished_at=CURRENT_TIMESTAMP
               WHERE id=?""",
            (len(rows), job_id),
        )
        print(f"  ✅ Identity-copied {len(rows)} strings for 'de'")
        return {"total": len(rows), "translated": len(rows), "failed": 0}

    # Batch translate via LLM
    translated = 0
    failed = 0
    for batch_start in range(0, len(rows), BATCH_SIZE):
        batch = rows[batch_start : batch_start + BATCH_SIZE]
        texts = [r["source_text"] for r in batch]

        results = await _call_llm(texts, target_language)

        for r, translated_text in zip(batch, results):
            if translated_text:
                await execute_write(
                    """INSERT OR IGNORE INTO localized_string_translations
                       (localized_string_id, language_code, translated_text,
                        translation_status, confidence, provider)
                       VALUES (?, ?, ?, 'translated', 0.85, 'openrouter_llm')""",
                    (r["id"], target_language, translated_text),
                )
                translated += 1
            else:
                failed += 1

        # Update job progress
        await execute_write(
            "UPDATE translation_jobs SET processed_items=?, failed_items=? WHERE id=?",
            (translated + failed, failed, job_id),
        )

        print(f"    batch {batch_start // BATCH_SIZE + 1}: "
              f"{min(batch_start + BATCH_SIZE, len(rows))}/{len(rows)}")

    status = "success" if failed == 0 else ("partial" if translated > 0 else "failed")
    await execute_write(
        """UPDATE translation_jobs
           SET status=?, processed_items=?, failed_items=?, finished_at=CURRENT_TIMESTAMP
           WHERE id=?""",
        (status, translated + failed, failed, job_id),
    )

    print(f"  ✅ Translation to '{target_language}': {translated} ok, {failed} failed")
    return {"total": len(rows), "translated": translated, "failed": failed}


# ── Main entry point ────────────────────────────────────────

async def run_translations(
    target_languages: Optional[List[str]] = None,
    import_run_id: Optional[int] = None,
):
    """Run Stage 3: seed term mappings + translate strings."""
    print("━━ Stage 3: Translation ━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    await seed_term_mappings()

    if target_languages is None:
        # Default: translate to English only (add more as needed)
        target_languages = ["en"]

    stats = {}
    for lang in target_languages:
        stats[lang] = await translate_strings(lang, import_run_id)

    # Also self-copy German as the source language
    if "de" not in target_languages:
        stats["de"] = await translate_strings("de", import_run_id)

    return stats


if __name__ == "__main__":
    asyncio.run(run_translations())
