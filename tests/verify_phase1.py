
import asyncio
import sys
import os
import sqlite3

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from tools.cart_tools import add_to_cart, checkout
from db.database import execute_write, execute_query
from services.event_service import get_recent_events

async def verify_phase1():
    print("🚀 Starting Phase 1 Verification...")
    
    # 1. Setup: Set low stock for a medication (ID=1)
    print("📉 Setting stock to 10 units for Medication ID 1...")
    await execute_write("UPDATE inventory SET stock_quantity = 10 WHERE medication_id = 1")
    
    # 2. Add to Cart
    session_id = "verify_phase1_session"
    print(f"🛒 Adding item to cart (Session: {session_id})...")
    await add_to_cart(session_id, 1, 5)
    
    # 3. Checkout
    print("💳 Checking out...")
    result = await checkout(session_id, customer_id=2)
    print(f"✅ Checkout Result: {result.get('status')}")
    print(f"   Warehouse Status: {result.get('warehouse_status')}")
    
    if result.get('fulfillment', {}).get('procurement_triggered'):
        print("   🤖 Procurement Triggered: YES")
    else:
        print("   ❌ Procurement Triggered: NO (Check Logic)")

    # 4. Verify Events
    print("\n📋 Verifying Event Log...")
    events = await get_recent_events(limit=10)
    
    found_types = set()
    for e in events:
        found_types.add(e['event_type'])
    
    required_events = [
        "CUSTOMER_ORDER", 
        "WAREHOUSE_FULFILLMENT_TRIGGERED", 
        "CHECKOUT_COMPLETED"
    ]
    
    all_passed = True
    for req in required_events:
        if req in found_types:
            print(f"   ✅ Event Checked: {req}")
        else:
            print(f"   ❌ Missing Event: {req}")
            all_passed = False
            
    # 5. Verify Procurement Order Created
    print("\nChecking Procurement Orders...")
    orders = await execute_query("SELECT * FROM procurement_orders ORDER BY created_at DESC LIMIT 1")
    if orders:
        print(f"   ✅ Procurement Order Found: {orders[0]['order_id']} (Status: {orders[0]['status']})")
    else:
        print("   ❌ No Procurement Order Found!")
        all_passed = False

    if all_passed:
        print("\n🎉 Phase 1 Verification SUCCESS!")
    else:
        print("\n⚠️ Phase 1 Verification FAILED or INCOMPLETE.")

if __name__ == "__main__":
    asyncio.run(verify_phase1())
