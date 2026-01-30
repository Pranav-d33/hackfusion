
import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from tools.cart_tools import clear_cart, get_cart
from agents.orchestrator import execute_tool_call, get_session_state

async def verify_scan_to_cart():
    print("🚀 Starting Scan-to-Cart Verification...")
    
    session_id = "verify_scan_to_cart_session"
    await clear_cart(session_id)
    
    # 1. Verify Empty Cart
    cart = await get_cart(session_id)
    print(f"🛒 Initial Cart Items: {cart['item_count']}")
    
    if cart['item_count'] > 0:
        print("❌ Cart not empty, failing test.")
        return

    # 2. Test Upload (Should Auto-Add)
    print("📄 Uploading Prescription (Mock)...")
    plan = {
        "tool": "upload_prescription",
        "tool_args": {"file_path": "mock_prescription.jpg"} # MOCK: Contains Glycomet
    }
    state = get_session_state(session_id)
    
    result = await execute_tool_call(session_id, plan, state)
    
    print(f"🔍 Result Message: {result.get('message')}")
    print(f"   Action Taken: {result.get('action_taken')}")
    
    # 3. Verify Cart Updated
    cart_after = await get_cart(session_id)
    print(f"🛒 Final Cart Items: {cart_after['item_count']}")
    
    if cart_after['item_count'] > 0 and result.get("action_taken") == "scan_to_cart_success":
        print("   ✅ Items automatically added!")
    else:
        print("   ❌ Items NOT added or wrong action taken.")

if __name__ == "__main__":
    asyncio.run(verify_scan_to_cart())
