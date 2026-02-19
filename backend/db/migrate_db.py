"""
Database Migration Script (V2)
Adds columns/tables that may be missing from an existing V2 schema.
"""
import sys
import asyncio
from pathlib import Path
import os

backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))
os.chdir(backend_path)

from db.database import execute_write, init_db


async def migrate():
    print("Running V2 database migrations...")

    # Ensure customers table has auth columns
    for col_sql in [
        "ALTER TABLE customers ADD COLUMN name TEXT;",
        "ALTER TABLE customers ADD COLUMN password_hash TEXT;",
        "ALTER TABLE customers ADD COLUMN preferences_json TEXT;",
        "ALTER TABLE customers ADD COLUMN notification_enabled BOOLEAN DEFAULT 1;",
        "ALTER TABLE customers ADD COLUMN address TEXT;",
        "ALTER TABLE customers ADD COLUMN city TEXT;",
        "ALTER TABLE customers ADD COLUMN state TEXT;",
        "ALTER TABLE customers ADD COLUMN postal_code TEXT;",
        "ALTER TABLE customers ADD COLUMN country TEXT DEFAULT 'Germany';",
        "ALTER TABLE customers ADD COLUMN profile_completed BOOLEAN DEFAULT 0;",
    ]:
        try:
            await execute_write(col_sql)
            col_name = col_sql.split("ADD COLUMN ")[1].split(" ")[0]
            print(f"✅ Added {col_name} column to customers")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                pass
            else:
                print(f"ℹ️ Column may already exist: {e}")

    # Ensure user_sessions table exists
    try:
        await execute_write("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE
        );
        """)
        print("✅ Ensured user_sessions table exists")

        await execute_write("CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);")
    except Exception as e:
        print(f"❌ Error with sessions table: {e}")

    print("✨ Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
