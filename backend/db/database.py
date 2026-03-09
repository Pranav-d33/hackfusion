"""
Database module for Mediloon
Dual-mode: PostgreSQL (Supabase) when SUPABASE_DATABASE_URL is set,
           SQLite (aiosqlite) otherwise (local dev).

Uses pg8000 (100% pure-Python, ZERO C dependencies) for Postgres.
This is the most reliable driver for Vercel serverless functions.

The adapter layer auto-converts SQLite-style SQL (? placeholders,
INSERT OR IGNORE, date('now'), etc.) to PostgreSQL equivalents so the
rest of the codebase needs zero changes.
"""
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import SUPABASE_DATABASE_URL, IS_VERCEL

# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------
USE_POSTGRES = bool(SUPABASE_DATABASE_URL)

if USE_POSTGRES:
    import pg8000.dbapi    # 100% pure Python, no C extensions, no libpq
    _pg_url = urlparse(SUPABASE_DATABASE_URL)
    _PG_HOST = _pg_url.hostname or ""
    _PG_PORT = _pg_url.port or 5432
    _USING_SUPABASE_DIRECT_URL_ON_VERCEL = (
        IS_VERCEL
        and _PG_HOST.startswith("db.")
        and _PG_HOST.endswith(".supabase.co")
        and _PG_PORT == 5432
    )
    _PG_PARAMS = dict(
        user=_pg_url.username,
        password=_pg_url.password,
        host=_PG_HOST,
        port=_PG_PORT,
        database=_pg_url.path.lstrip("/"),
        ssl_context=True,
    )
else:
    import aiosqlite      # type: ignore[import-untyped]
    import shutil
    from config import DB_PATH, DATA_DIR, SEED_DB_SOURCE
    DATA_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# SQLite ➜ PostgreSQL  automatic SQL adapter
# ---------------------------------------------------------------------------

def _coerce_params(params):
    """Coerce parameter types for pg8000's strict type checking.

    pg8000 sends Python types to PostgreSQL and the server rejects
    mismatches (e.g. a str '42' for an INTEGER column).  This helper
    converts obvious string-encoded numbers to int/float so that
    parameterised queries work correctly.
    """
    out = []
    for p in params:
        if isinstance(p, str):
            # Try int first, then float — leave genuine strings alone
            try:
                out.append(int(p))
                continue
            except (ValueError, TypeError):
                pass
            try:
                out.append(float(p))
                continue
            except (ValueError, TypeError):
                pass
        out.append(p)
    return out


def _adapt_sql(sql: str, params: tuple = ()) -> tuple:
    """Convert SQLite-flavoured SQL to PostgreSQL on the fly.

    Handles:
      ? → %s  (psycopg uses %s placeholders)
      INSERT OR IGNORE INTO → INSERT INTO … ON CONFLICT DO NOTHING
      date('now')            → CURRENT_DATE
      date('now', '-N days') → (CURRENT_DATE - INTERVAL 'N days')
      datetime('now')        → NOW()
      AUTOINCREMENT          → stripped (SERIAL handles it)
      Parameter type coercion for pg8000 strict typing
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

    # 6. Replace ? placeholders with %s  (psycopg convention)
    adapted = adapted.replace('?', '%s')

    # 7. Append ON CONFLICT DO NOTHING for former INSERT OR IGNORE
    if was_ignore:
        adapted = adapted.rstrip().rstrip(';') + ' ON CONFLICT DO NOTHING'

    # 8. Coerce parameter types for pg8000 strict type checking
    coerced = _coerce_params(list(params))

    return adapted, coerced


# ---------------------------------------------------------------------------
# Postgres helpers  (pg8000 — sync, per-request connections)
# ---------------------------------------------------------------------------

def _pg_connect():
    """Open a new pg8000 connection with dict-row support."""
    try:
        return pg8000.dbapi.connect(**_PG_PARAMS)
    except Exception as exc:
        if _USING_SUPABASE_DIRECT_URL_ON_VERCEL:
            raise RuntimeError(
                "Supabase direct Postgres URL detected on Vercel serverless. "
                "Replace SUPABASE_DATABASE_URL with the Supabase transaction pooler "
                "connection string (serverless/shared pooler, port 6543)."
            ) from exc
        raise


def _rows_to_dicts(cursor):
    """Convert pg8000 cursor results to list[dict].

    Also converts:
      - Decimal → float  (PostgreSQL NUMERIC → JSON-serialisable)
      - datetime → ISO string  (consistent with SQLite text behaviour)
    so the rest of the codebase works identically regardless of backend.
    """
    if cursor.description is None:
        return []
    from decimal import Decimal
    from datetime import datetime, date
    cols = [d[0] for d in cursor.description]
    rows = []
    for row in cursor.fetchall():
        converted = {}
        for col, val in zip(cols, row):
            if isinstance(val, Decimal):
                converted[col] = float(val)
            elif isinstance(val, datetime):
                converted[col] = val.isoformat()
            elif isinstance(val, date):
                converted[col] = val.isoformat()
            else:
                converted[col] = val
        rows.append(converted)
    return rows


async def _pg_query(sql: str, params: tuple = ()):
    """Execute a Postgres read query and return list[dict]."""
    adapted_sql, adapted_params = _adapt_sql(sql, params)
    conn = _pg_connect()
    try:
        cur = conn.cursor()
        cur.execute(adapted_sql, adapted_params)
        return _rows_to_dicts(cur)
    finally:
        conn.close()


async def _pg_write(sql: str, params: tuple = ()):
    """Execute a Postgres write query and return last inserted id."""
    adapted_sql, adapted_params = _adapt_sql(sql, params)
    conn = _pg_connect()
    try:
        cur = conn.cursor()
        trimmed = adapted_sql.strip().upper()
        # Don't append RETURNING id when ON CONFLICT DO NOTHING is present
        # (conflicting rows return no rows, making fetchone() return None)
        has_conflict = 'ON CONFLICT' in trimmed
        if trimmed.startswith('INSERT') and 'RETURNING' not in trimmed and not has_conflict:
            adapted_sql = adapted_sql.rstrip().rstrip(';') + ' RETURNING id'
            try:
                cur.execute(adapted_sql, adapted_params)
                row = cur.fetchone()
                conn.commit()
                return row[0] if row else None
            except Exception:
                conn.rollback()
                clean = adapted_sql.rsplit('RETURNING id', 1)[0].strip()
                cur.execute(clean, adapted_params)
                conn.commit()
                return None
        elif trimmed.startswith('INSERT') and not has_conflict:
            # Already has RETURNING clause
            cur.execute(adapted_sql, adapted_params)
            row = cur.fetchone()
            conn.commit()
            return row[0] if row else None
        else:
            cur.execute(adapted_sql, adapted_params)
            conn.commit()
            return None
    finally:
        conn.close()


async def _pg_execute_schema(sql_text: str):
    """Execute a multi-statement DDL script on Postgres."""
    conn = _pg_connect()
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql_text)
    finally:
        conn.close()


async def close_pool():
    """No-op for pg8000 per-request connections."""
    pass


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
        return _pg_connect()
    else:
        db = await aiosqlite.connect(DB_PATH)
        db.row_factory = aiosqlite.Row
        return db


async def init_db():
    """Run DDL schema to ensure all tables exist."""
    if USE_POSTGRES:
        schema_path = Path(__file__).parent / "schema_postgres.sql"
        with open(schema_path, "r") as f:
            schema = f.read()
        await _pg_execute_schema(schema)
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
        return await _pg_query(query, params)
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(query, params)
            results = await cursor.fetchall()
            return [dict(row) for row in results]


async def execute_write(query: str, params: tuple = ()):
    """Execute a write query → last inserted id (or None)."""
    if USE_POSTGRES:
        return await _pg_write(query, params)
    else:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(query, params)
            await db.commit()
            return cursor.lastrowid
