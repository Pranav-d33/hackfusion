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
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import SUPABASE_DATABASE_URL, IS_VERCEL, DB_POOL_ENABLED, DB_POOL_MAX_SIZE

# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------
USE_POSTGRES = bool(SUPABASE_DATABASE_URL)

# Connection pool for PostgreSQL (production optimization)
_pg_pool = None

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


def _init_pool():
    """Initialize connection pool for PostgreSQL (production optimization).
    
    Falls back gracefully to per-request connections if pool init fails.
    """
    global _pg_pool
    if not USE_POSTGRES or not DB_POOL_ENABLED:
        return False
    if _pg_pool is not None:
        return True
    
    try:
        # pg8000 doesn't have built-in pooling, so we use a simple connection cache
        # For production, consider using pg8000's native pool or a wrapper
        # This implementation uses thread-local storage for connection reuse
        _pg_pool = {
            "connections": [],
            "max_size": DB_POOL_MAX_SIZE,
            "initialized": True,
        }
        print(f"✅ PostgreSQL connection pooling enabled (max: {DB_POOL_MAX_SIZE})")
        return True
    except Exception as e:
        print(f"⚠️ Connection pool init failed, using per-request connections: {e}")
        _pg_pool = None
        return False


def _get_pooled_connection():
    """Get connection from pool or create new one."""
    global _pg_pool
    if _pg_pool is None or not DB_POOL_ENABLED:
        return _pg_connect()
    
    # Simple connection reuse from pool
    try:
        if _pg_pool["connections"]:
            conn = _pg_pool["connections"].pop()
            # Verify connection is still alive
            try:
                conn.cursor().execute("SELECT 1")
                return conn
            except Exception:
                # Connection dead, close and create new
                try:
                    conn.close()
                except:
                    pass
                return _pg_connect()
        else:
            # Pool empty, create new
            return _pg_connect()
    except Exception as e:
        print(f"⚠️ Pool error, falling back to new connection: {e}")
        return _pg_connect()


def _return_connection_to_pool(conn):
    """Return connection to pool for reuse."""
    global _pg_pool
    if _pg_pool is None or not DB_POOL_ENABLED:
        try:
            conn.close()
        except:
            pass
        return
    
    try:
        if len(_pg_pool["connections"]) < _pg_pool["max_size"]:
            _pg_pool["connections"].append(conn)
        else:
            conn.close()
    except Exception:
        # Ensure connection is closed on error
        try:
            conn.close()
        except:
            pass


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
    conn = _get_pooled_connection()
    try:
        cur = conn.cursor()
        cur.execute(adapted_sql, adapted_params)
        return _rows_to_dicts(cur)
    finally:
        _return_connection_to_pool(conn)


async def _pg_write(sql: str, params: tuple = ()):
    """Execute a Postgres write query and return last inserted id."""
    adapted_sql, adapted_params = _adapt_sql(sql, params)
    conn = _get_pooled_connection()
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
            except Exception as first_exc:
                conn.rollback()
                clean = adapted_sql.rsplit('RETURNING id', 1)[0].strip()
                try:
                    cur.execute(clean, adapted_params)
                    conn.commit()
                    return None
                except Exception as second_exc:
                    conn.rollback()
                    raise RuntimeError(
                        f"Postgres INSERT failed. primary={first_exc}; fallback={second_exc}; sql={clean}"
                    ) from second_exc
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
        _return_connection_to_pool(conn)


async def _pg_execute_schema(sql_text: str):
    """Execute a multi-statement DDL script on Postgres.
    
    pg8000 requires executing statements one at a time, so we split on ';'
    and execute each statement individually.
    """
    conn = _pg_connect()
    try:
        conn.autocommit = True
        cur = conn.cursor()
        
        # Split by semicolon and execute each statement separately
        statements = [s.strip() for s in sql_text.split(';') if s.strip()]
        for stmt in statements:
            if stmt:  # Skip empty statements
                try:
                    cur.execute(stmt)
                except Exception as e:
                    # Log but don't fail on individual statement errors
                    # (e.g., "table already exists" is OK)
                    if "already exists" not in str(e).lower():
                        print(f"Warning: Schema statement failed: {e}")
    finally:
        conn.close()


async def close_pool():
    """Close all pooled connections on shutdown."""
    global _pg_pool
    if _pg_pool is not None and USE_POSTGRES:
        closed_count = 0
        for conn in _pg_pool.get("connections", []):
            try:
                conn.close()
                closed_count += 1
            except:
                pass
        _pg_pool["connections"] = []
        print(f"✅ Closed {closed_count} pooled connections")


def get_pool_status() -> dict:
    """Get connection pool status for health monitoring."""
    if not USE_POSTGRES:
        return {"enabled": False, "backend": "sqlite"}
    if _pg_pool is None:
        return {"enabled": DB_POOL_ENABLED, "backend": "postgres", "pooled": False}
    return {
        "enabled": DB_POOL_ENABLED,
        "backend": "postgres",
        "pooled": True,
        "pool_size": len(_pg_pool.get("connections", [])),
        "pool_max": _pg_pool.get("max_size", 0),
    }


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
        # Initialize connection pool for production optimization
        _init_pool()
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


# ===================================================================
# TRANSACTION SUPPORT  —  for atomic multi-operation sequences
# ===================================================================

class Transaction:
    """Async context manager for database transactions.

    Usage:
        async with Transaction() as txn:
            order_id = await txn.execute_write("INSERT INTO orders ...", ())
            await txn.execute_write("UPDATE inventory ...", ())
            # Auto-commits on success, rolls back on exception
    """

    def __init__(self):
        self._conn = None
        self._is_pg = USE_POSTGRES

    async def __aenter__(self):
        if self._is_pg:
            self._conn = _pg_connect()
        else:
            self._conn = await aiosqlite.connect(DB_PATH)
            self._conn.row_factory = aiosqlite.Row
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                # Success - commit
                if self._is_pg:
                    self._conn.commit()
                else:
                    await self._conn.commit()
            else:
                # Failure - rollback
                if self._is_pg:
                    self._conn.rollback()
                else:
                    await self._conn.rollback()
        finally:
            if self._is_pg:
                self._conn.close()
            else:
                await self._conn.close()
        return False  # Don't suppress exceptions

    async def execute_write(self, query: str, params: tuple = ()):
        """Execute a write within the transaction. Returns last inserted id."""
        if self._is_pg:
            adapted_sql, adapted_params = _adapt_sql(query, params)
            cur = self._conn.cursor()
            trimmed = adapted_sql.strip().upper()
            has_conflict = 'ON CONFLICT' in trimmed

            if trimmed.startswith('INSERT') and 'RETURNING' not in trimmed and not has_conflict:
                adapted_sql = adapted_sql.rstrip().rstrip(';') + ' RETURNING id'
                cur.execute(adapted_sql, adapted_params)
                row = cur.fetchone()
                return row[0] if row else None
            elif trimmed.startswith('INSERT') and not has_conflict:
                cur.execute(adapted_sql, adapted_params)
                row = cur.fetchone()
                return row[0] if row else None
            else:
                cur.execute(adapted_sql, adapted_params)
                return None
        else:
            cursor = await self._conn.execute(query, params)
            return cursor.lastrowid

    async def execute_query(self, query: str, params: tuple = ()):
        """Execute a read within the transaction."""
        if self._is_pg:
            adapted_sql, adapted_params = _adapt_sql(query, params)
            cur = self._conn.cursor()
            cur.execute(adapted_sql, adapted_params)
            return _rows_to_dicts(cur)
        else:
            cursor = await self._conn.execute(query, params)
            results = await cursor.fetchall()
            return [dict(row) for row in results]
