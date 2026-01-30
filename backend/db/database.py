"""
Database module for Mediloon
Provides async SQLite connection and initialization.
"""
import aiosqlite
from pathlib import Path
from config import DB_PATH, DATA_DIR

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

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
