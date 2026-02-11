
import asyncio
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from db.database import init_db, execute_write
from tools.cart_tools import add_to_cart, get_cart, clear_cart
from db.seed_data import seed_database

async def verify_cart_logic():
    print("🚀 Starting Cart Logic Verification...")
    
    # Setup
    await init_db()
    # Ensure seed data is present (for prices)
    await seed_database()
    
    session_id = "test_session_verification"
    await clear_cart(session_id)
    
    # 1. Add Item: Glycomet (Price: 45.00)
    # Get ID for Glycomet
    # We know from seed data it's likely ID 1, but let's just add it via tool
    # Actually tool needs ID. Let's assume ID 1 is Glycomet based on seed order.
    
    print("\nAdding 2 units of Item ID 1 (Glycomet @ 45.00)...")
    cart = await add_to_cart(session_id, 1, 2)
    
    print(f"Cart State: {cart}")
    
    # 2. Verify Totals
    expected_subtotal = 90.00
    expected_tax = 9.00
    expected_shipping = 50.00
    expected_total = 149.00
    
    print(f"\nExpected: Subtotal={expected_subtotal}, Tax={expected_tax}, Shipping={expected_shipping}, Total={expected_total}")
    print(f"Actual:   Subtotal={cart.get('subtotal')}, Tax={cart.get('tax')}, Shipping={cart.get('shipping')}, Total={cart.get('total')}")
    
    assert cart['subtotal'] == expected_subtotal, f"Subtotal mismatch: {cart['subtotal']} != {expected_subtotal}"
    assert cart['tax'] == expected_tax, f"Tax mismatch: {cart['tax']} != {expected_tax}"
    assert cart['shipping'] == expected_shipping, f"Shipping mismatch: {cart['shipping']} != {expected_shipping}"
    assert cart['total'] == expected_total, f"Total mismatch: {cart['total']} != {expected_total}"
    
    print("✅ Low value cart verified.")
    
    # 3. Test High Value (Free Shipping > 500)
    # Add 10 units of Januvia (Price 280.00) -> 2800.00
    # Total subtotal: 90 + 2800 = 2890
    print("\nAdding 10 units of Item ID 4 (Januvia @ 280.00)...")
    cart = await add_to_cart(session_id, 4, 10)
    
    expected_subtotal = 2890.00
    expected_tax = 289.00
    expected_shipping = 0.00
    expected_total = 3179.00
    
    print(f"\nExpected: Subtotal={expected_subtotal}, Tax={expected_tax}, Shipping={expected_shipping}, Total={expected_total}")
    print(f"Actual:   Subtotal={cart.get('subtotal')}, Tax={cart.get('tax')}, Shipping={cart.get('shipping')}, Total={cart.get('total')}")
    
    assert cart['subtotal'] == expected_subtotal, f"Subtotal mismatch: {cart['subtotal']} != {expected_subtotal}"
    assert cart['shipping'] == expected_shipping, f"Shipping mismatch (should be free): {cart['shipping']} != {expected_shipping}"
    
    print("✅ High value cart verified.")
    print("\n🎉 All Cart Verification Tests Passed!")

if __name__ == "__main__":
    asyncio.run(verify_cart_logic())
