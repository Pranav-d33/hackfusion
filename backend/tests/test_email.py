import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), "backend"))

from utils.mail_utils import send_order_confirmation_email

async def test_email():
    print("🚀 Starting email test...")
    
    # Mock order data
    order_data = {
        "order_id": 9999,
        "items": [
            {"brand_name": "Paracetamol 500mg", "quantity": 2, "price": 5.50},
            {"brand_name": "Ibuprofen 400mg", "quantity": 1, "price": 8.20}
        ],
        "total": 19.20,
        "delivery_address": "Test User, 123 Main St, Berlin, 10115",
        "estimated_delivery": "2026-03-05"
    }
    
    print(f"📦 Mock order data prepared for Order #{order_data['order_id']}")
    
    success = await send_order_confirmation_email(order_data)
    
    if success:
        print("✅ Email test completed successfully!")
    else:
        print("❌ Email test failed. Check the logs above for errors.")

if __name__ == "__main__":
    asyncio.run(test_email())
