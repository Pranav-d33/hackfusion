"""
Database module for Mediloon
Dual-mode: PostgreSQL (Supabase) when SUPABASE_DATABASE_URL is set,
           SQLite (aiosqlite) otherwise (local dev).

The adapter layer auto-converts SQLite-style SQL (? placeholders,
INSERT OR IGNORE, date('now'), etc.) to PostgreSQL equivalents so the
rest of the codebase needs zero changes.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import SUPABASE_DATABASE_URL, IS_VERCEL

# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------
USE_POSTGRES = bool(SUPABASE_DATABASE_URL)

if USE_POSTGRES:
    import asyncpg  # type: ignore[import-untyped]
else:
    import aiosqlite  # type: ignore[import-untyped]
    import shutil
    from config import DB_PATH, DATA_DIR, SEED_DB_SOURCE
    DATA_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# SQLite ➜ PostgreSQL  automatic SQL adapter
# ---------------------------------------------------------------------------

def _adapt_sql(sql: str, params: tuple = ()) -> tuple:
    """Convert SQLite-flavoured SQL to PostgreSQL on the fly.

    Handles:
      ? → $1, $2, …
      INSERT OR IGNORE INTO → INSERT INTO … ON CONFLICT DO NOTHING
      date('now')            → CURRENT_DATE
      date('now', '-N days') → (CURRENT_DATE - INTERVAL 'N days')
      datetime('now')        → NOW()
      AUTOINCREMENT          → stripped (SERIAL handles it)
    """
    adapted = sql

    # 1. INSERT OR IGNORE → INSERT … ON CONFLICT DO NOTHING
    was_ignore = bool(re.search(r'INSERT\s+OR\s+IGNORE\b', adapted, re.IGNORECASE))
    adapted = re.sub(r'INSERT\s+OR\s+IGNORE\s+INTO', 'INSERT INTO', adapted, flags=re.IGNORECASE)

    # 2. date('now', '-30 days') → (CURRENT_DATE - INTERVAL '30 days')
    def _date_offset(m):
        sign, num = m.group(1), m.group(2)
        op = '-' if sign == '-' else '+'
        return f"(CURRENT_DATE {op} INTERVAL '{num} days')"
    adapted = re.sub(
        r"date\(\s*'now'\s*,\s*'([+-]?)(\d+)\s+days?'\s*\)",
        _date_offset, adapted, flags=re.IGNORECASE,
    )

    # 3. date('now') → CURRENT_DATE
    adapted = re.sub(r"date\(\s*'now'\s*\)", 'CURRENT_DATE', adapted, flags=re.IGNORECASE)

    # 4. datetime('now') → NOW()
    adapted = re.sub(r"datetime\(\s*'now'\s*\)", 'NOW()', adapted, flags=re.IGNORECASE)

    # 5. Strip AUTOINCREMENT keyword (PG SERIAL handles it)
    adapted = re.sub(r'\bAUTOINCREMENT\b', '', adapted, flags=re.IGNORECASE)

    # 6. Replace ? placeholders with $1, $2, …
    counter = [0]
    def _next(m):
        counter[0] += 1
        return f'${counter[0]}'
    adapted = re.sub(r'\?', _next, adapted)

    # 7. Append ON CONFLICT DO NOTHING for former INSERT OR IGNORE
    if was_ignore:
        adapted = adapted.rstrip().rstrip(';') + ' ON CONFLICT DO NOTHING'

    return adapted, list(params)


# ---------------------------------------------------------------------------
# Postgres connection pool
# ---------------------------------------------------------------------------
_pg_pool = None  # asyncpg.Pool | None


async def _get_pool():
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = await asyncpg.create_pool(
            SUPABASE_DATABASE_URL,
            min_size=1,
            max_size=10,
            command_timeout=30,
            # Supabase transaction-pooler (port 6543) needs this
            statement_cache_size=0,
        )
    return _pg_pool


async def close_pool():
    """Gracefully close the PG pool (call on app shutdown)."""
    global _pg_pool
    if _pg_pool is not None:
        await _pg_pool.close()
        _pg_pool = None


# ---------------------------------------------------------------------------
# SQLite Vercel cold-start helper (fallback mode only)
# ---------------------------------------------------------------------------

def _ensure_vercel_db():
    if USE_POSTGRES or not IS_VERCEL:
        return
    if DB_PATH.exists() and DB_PATH.stat().st_size > 0:
        return
    if SEED_DB_SOURCE.exists() and SEED_DB_SOURCE.stat().st_size > 0:
        shutil.copy2(SEED_DB_SOURCE, DB_PATH)
        print(f"✅ Copied pre-seeded DB to {DB_PATH}")
    else:
        print(f"⚠️ Pre-seeded DB not found at {SEED_DB_SOURCE}")


if not USE_POSTGRES:
    _ensure_vercel_db()


# ===================================================================
# PUBLIC API  —  identical interface, backend-agnostic
# ===================================================================

async def get_db():
    """Return a raw connection (caller must close / release)."""
    if USE_POSTGRES:
        pool = await _get_pool()
        return await pool.acquire()
    else:
        db = await aiosqlite.connect(DB_PATH)
        db.row_factory = aiosqlite.Row
        return db


async def init_db():
    """Run DDL schema to ensure all tables exist."""
    if USE_POSTGRES:
        schema_path = Path(__file__).parent / "schema_postgres.sql"
        pool = await _get_pool()
        async with pool.acquire() as conn:
            with open(schema_path, "r") as f:
                schema = f.read()
            await conn.execute(schema)
        print("✅ Database schema applied on Supabase (PostgreSQL)")
    else:
        schema_path = Path(__file__).parent / "schema.sql"
        async with aiosqlite.connect(DB_PATH) as db:
            with open(schema_path, "r") as f:
                schema = f.read()
            await db.executescript(schema)
            await db.commit()
        print(f"Database initialized at {DB_PATH}")


async def execute_query(query: str, params: tuple = ()):
    """Execute a read query → list[dict]."""
    if USE_POSTGRES:
        adapted_sql, adapted_params = _adapt_sql(query, params)
        pool = await _get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(adapted_sql, *adapted_params)
            return [dict(r) for r in rows]
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(query, params)
            results = await cursor.fetchall()
            return [dict(row) for row in results]


async def execute_write(query: str, params: tuple = ()):
    """Execute a write query → last inserted id (or None)."""
    if USE_POSTGRES:
        adapted_sql, adapted_params = _adapt_sql(query, params)
        pool = await _get_pool()
        async with pool.acquire() as conn:
            trimmed = adapted_sql.strip().upper()
            if trimmed.startswith('INSERT') and 'RETURNING' not in trimmed:
                adapted_sql = adapted_sql.rstrip().rstrip(';') + ' RETURNING id'
                try:
                    row = await conn.fetchrow(adapted_sql, *adapted_params)
                    return row['id'] if row else None
                except Exception:
                    # Table may lack `id` col or conflict → retry without RETURNING
                    clean = adapted_sql.rsplit('RETURNING id', 1)[0].strip()
                    await conn.execute(clean, *adapted_params)
                    return None
            else:
                await conn.execute(adapted_sql, *adapted_params)
                return None
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(query, params)
            await db.commit()
            return cursor.lastrowid
