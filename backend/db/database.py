"""
Database module for Mediloon
Provides async SQLite connection and initialization.
"""
import aiosqlite
import shutil
from pathlib import Path
from config import DB_PATH, DATA_DIR, IS_VERCEL, SEED_DB_SOURCE

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_vercel_db():
    """On Vercel, copy the pre-seeded database to /tmp if not already present.

    Vercel serverless functions are ephemeral — /tmp is wiped on every cold
    start.  Instead of re-running the full Excel→SQLite seed pipeline (slow
    and fragile), we ship a ready-made mediloon.db in the repo and copy it
    to the writable /tmp directory on each cold start.
    """
    if not IS_VERCEL:
        return
    if DB_PATH.exists() and DB_PATH.stat().st_size > 0:
        return  # already copied in this container lifetime
    if SEED_DB_SOURCE.exists() and SEED_DB_SOURCE.stat().st_size > 0:
        shutil.copy2(SEED_DB_SOURCE, DB_PATH)
        print(f"✅ Copied pre-seeded DB to {DB_PATH} ({DB_PATH.stat().st_size} bytes)")
    else:
        print(f"⚠️ Pre-seeded DB not found at {SEED_DB_SOURCE} — will create fresh")


# Run immediately on module import (covers every cold start)
_ensure_vercel_db()

async def get_db():
    """Get database connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db

async def init_db():
    """Initialize database with schema."""
    schema_path = Path(__file__).parent / "schema.sql"
    
    async with aiosqlite.connect(DB_PATH) as db:
        with open(schema_path, 'r') as f:
            schema = f.read()
        await db.executescript(schema)
        await db.commit()
    print(f"Database initialized at {DB_PATH}")

async def execute_query(query: str, params: tuple = ()):
    """Execute a query and return results."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        results = await cursor.fetchall()
        return [dict(row) for row in results]

async def execute_write(query: str, params: tuple = ()):
    """Execute a write query and return last row id."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(query, params)
        await db.commit()
        return cursor.lastrowid
