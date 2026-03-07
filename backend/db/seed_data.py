"""
Seed data for Mediloon V2
Orchestrates the full 4-stage pipeline:
  Stage 1+2: Excel ingestion (raw + curated + i18n keys)
  Stage 3:   Translation (LLM + deterministic mappings)
  Stage 4:   Domain table population
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.database import init_db, execute_query
from config import IS_VERCEL


async def seed_all(
    target_languages: list | None = None,
    display_lang: str = "en",
    skip_translation: bool = False,
):
    """
    Run the full data pipeline.
    Idempotent: skips if data already exists.
    On Vercel, the pre-seeded DB is copied at import time, so this
    just verifies data is present and skips the heavy pipeline.

    Args:
        target_languages: Languages to translate into (default: ["en"])
        display_lang: Primary display language for product_catalog names
        skip_translation: If True, skip LLM translation (useful offline)
    """
    if target_languages is None:
        target_languages = ["en"]

    # Quick idempotency check: if product_catalog already has rows, skip
    await init_db()
    try:
        existing = await execute_query("SELECT COUNT(*) as c FROM product_catalog")
        if existing and existing[0]["c"] > 0:
            print("✅ Database already seeded — skipping pipeline")
            return
    except Exception:
        pass  # table doesn't exist yet, proceed

    # On Vercel, don't attempt the heavy Excel ingestion pipeline —
    # if the pre-seeded DB copy didn't work, we can't fix it at runtime.
    if IS_VERCEL:
        print("⚠️ Vercel: pre-seeded DB had no data — admin features will be limited")
        return

    # Local-only: import heavy pipeline modules and run full seed
    from db.ingest_excel import run_ingestion
    from db.translate_service import run_translations
    from db.populate_domain import run_populate

    print("╔══════════════════════════════════════════════════╗")
    print("║       MEDILOON V2 — DATA PIPELINE               ║")
    print("╚══════════════════════════════════════════════════╝")
    print()

    # Stage 1+2: Ingest Excel → raw + curated + i18n keys
    run_id = await run_ingestion()
    print()

    # Stage 3: Translate
    if skip_translation:
        print("━━ Stage 3: Translation SKIPPED ━━━━━━━━━━━━━━━━━━")
        print()
    else:
        await run_translations(target_languages, import_run_id=run_id)
        print()

    # Stage 4: Populate domain tables
    stats = await run_populate(display_lang)
    print()

    print("╔══════════════════════════════════════════════════╗")
    print("║       PIPELINE COMPLETE ✅                       ║")
    print("╠══════════════════════════════════════════════════╣")
    for k, v in stats.items():
        print(f"║  {k:<20} {v:>6} rows                   ║")
    print("╚══════════════════════════════════════════════════╝")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Mediloon V2 Data Pipeline")
    parser.add_argument(
        "--langs", nargs="*", default=["en"],
        help="Target translation languages (default: en)",
    )
    parser.add_argument(
        "--display-lang", default="en",
        help="Primary display language for catalog (default: en)",
    )
    parser.add_argument(
        "--skip-translation", action="store_true",
        help="Skip LLM translation stage (offline mode)",
    )
    args = parser.parse_args()

    asyncio.run(seed_all(
        target_languages=args.langs,
        display_lang=args.display_lang,
        skip_translation=args.skip_translation,
    ))
