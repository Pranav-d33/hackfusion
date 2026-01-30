
import asyncio
import sys
import os
from datetime import datetime, timedelta

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from db.database import execute_write, execute_query
from services.user_intelligence_service import get_user_refill_patterns

async def verify_phase3():
    print("🚀 Starting Phase 3 Verification (User Intelligence)...")
    
    user_id = 999 # Test User
    
    # 1. Setup: Clear history for test user
    await execute_write("DELETE FROM purchase_history WHERE customer_id = ?", (user_id,))
    
    # 2. Simulate History (Refill every 30 days, currently late)
    # Purchase 1: 65 days ago
    # Purchase 2: 35 days ago (Interval = 30 days)
    # Current: 35 days since last -> Late by 5 days
    
    now = datetime.now()
    date1 = (now - timedelta(days=65)).strftime("%Y-%m-%d %H:%M:%S")
    date2 = (now - timedelta(days=35)).strftime("%Y-%m-%d %H:%M:%S")
    
    print("📅 Injecting purchase history...")
    await execute_write(
        "INSERT INTO purchase_history (customer_id, medication_id, quantity, purchase_date) VALUES (?, ?, ?, ?)",
        (user_id, 1, 30, date1)
    )
    await execute_write(
        "INSERT INTO purchase_history (customer_id, medication_id, quantity, purchase_date) VALUES (?, ?, ?, ?)",
        (user_id, 1, 30, date2)
    )
    
    # 3. Get Insights
    print("🧠 Analyzing patterns...")
    insights = await get_user_refill_patterns(user_id)
    
    # 4. Verify
    if not insights:
        print("❌ No insights generated!")
        return
        
    found_late = False
    for i in insights:
        print(f"   - Found Insight: {i['brand_name']} | Status: {i['status']} | Suggestion: {i['suggestion']}")
        
        if i['medication_id'] == 1 and i['status'] == 'late':
            found_late = True
            # Verify tone
            if "start a conversation" in i['suggestion'] or "would you like" in i['suggestion'].lower() or "check your stock" in i['suggestion']:
                 print("     ✅ Tone check: Suggestive")
            else:
                 print("     ⚠️ Tone check: Verify manually")
                 
    if found_late:
        print("✅ Phase 3 Verification SUCCESS!")
    else:
        print("❌ Phase 3 Verification FAILED: Pattern not detected.")

if __name__ == "__main__":
    asyncio.run(verify_phase3())
