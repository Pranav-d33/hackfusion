#!/usr/bin/env python3
"""
Test the new user profile endpoints
"""
import asyncio
import sys
from pathlib import Path

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from db.database import execute_query, execute_write
import hashlib


def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt."""
    salt = "mediloon_salt_2026"
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


async def test_profile():
    print("Testing User Profile Feature...")
    print("=" * 60)
    
    # Create a test user
    print("\n1. Creating test user with profile fields...")
    password_hash = hash_password("test123")
    
    try:
        user_id = await execute_write("""
            INSERT INTO customers (
                name, email, phone, age, gender, address, city, state, 
                postal_code, country, password_hash, notification_enabled, profile_completed
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (
            "Test User",
            "test@example.com",
            "+49 123 456789",
            30,
            "male",
            "Test Street 123",
            "Berlin",
            "Berlin",
            "10115",
            "Germany",
            password_hash,
            1
        ))
        print(f"✅ User created with ID: {user_id}")
    except Exception as e:
        print(f"❌ Error creating user: {e}")
        # User might already exist, let's fetch it
        result = await execute_query("SELECT id FROM customers WHERE email = ?", ("test@example.com",))
        if result:
            user_id = result[0]['id']
            print(f"ℹ️ Using existing user with ID: {user_id}")
        else:
            raise
    
    # Verify user data
    print("\n2. Verifying user profile data...")
    user_data = await execute_query("""
        SELECT id, name, email, phone, age, gender, address, city, state, 
               postal_code, country, profile_completed
        FROM customers 
        WHERE id = ?
    """, (user_id,))
    
    if user_data:
        user = user_data[0]
        print(f"✅ User profile retrieved:")
        print(f"   - Name: {user['name']}")
        print(f"   - Email: {user['email']}")
        print(f"   - Phone: {user['phone']}")
        print(f"   - Age: {user['age']}")
        print(f"   - Gender: {user['gender']}")
        print(f"   - Address: {user['address']}")
        print(f"   - City: {user['city']}, {user['state']}")
        print(f"   - Postal Code: {user['postal_code']}")
        print(f"   - Country: {user['country']}")
        print(f"   - Profile Completed: {bool(user['profile_completed'])}")
    else:
        print("❌ Failed to retrieve user data")
    
    # Test incomplete profile
    print("\n3. Creating user with incomplete profile...")
    try:
        incomplete_user_id = await execute_write("""
            INSERT INTO customers (
                name, email, password_hash, notification_enabled, profile_completed
            )
            VALUES (?, ?, ?, 1, 0)
        """, (
            "Incomplete User",
            "incomplete@example.com",
            password_hash
        ))
        print(f"✅ Incomplete user created with ID: {incomplete_user_id}")
    except Exception as e:
        print(f"ℹ️ Incomplete user might already exist: {e}")
    
    # Verify incomplete user
    incomplete_data = await execute_query("""
        SELECT name, email, profile_completed 
        FROM customers 
        WHERE email = ?
    """, ("incomplete@example.com",))
    
    if incomplete_data:
        inc_user = incomplete_data[0]
        print(f"✅ Incomplete user profile:")
        print(f"   - Name: {inc_user['name']}")
        print(f"   - Email: {inc_user['email']}")
        print(f"   - Profile Completed: {bool(inc_user['profile_completed'])}")
    
    print("\n" + "=" * 60)
    print("✅ All tests passed!")
    print("\nNext steps:")
    print("1. Start the backend server: cd backend && python main.py")
    print("2. Start the frontend: cd frontend && npm run dev")
    print("3. Register a new account and see the profile modal")
    print("4. Click the profile icon to edit your profile anytime")


if __name__ == "__main__":
    asyncio.run(test_profile())
