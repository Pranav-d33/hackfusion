import sys
import asyncio
from pathlib import Path
import os

# Add backend to path
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))
os.chdir(backend_path)  # Ensure cwd is backend

from db.database import execute_write, init_db

async def migrate():
    print("Migrating database...")
    
    # 1. Update customers table
    try:
        await execute_write("ALTER TABLE customers ADD COLUMN password_hash TEXT;")
        print("✅ Added password_hash column")
    except Exception as e:
        print(f"ℹ️ password_hash column may already exist: {e}")

    try:
        await execute_write("ALTER TABLE customers ADD COLUMN preferences_json TEXT;")
        print("✅ Added preferences_json column")
    except Exception as e:
        print(f"ℹ️ preferences_json column may already exist: {e}")

    try:
        await execute_write("ALTER TABLE customers ADD COLUMN notification_enabled BOOLEAN DEFAULT 1;")
        print("✅ Added notification_enabled column")
    except Exception as e:
        print(f"ℹ️ notification_enabled column may already exist: {e}")

    # 2. Create user_sessions table
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
        print("✅ Created user_sessions table")
        
        await execute_write("CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);")
        print("✅ Created session_token index")
        
    except Exception as e:
        print(f"❌ Error creating sessions table: {e}")
    
    print("✨ Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
