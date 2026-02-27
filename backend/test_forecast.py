import asyncio
import sys
import json
from db.database import execute_query
from agents.forecast_agent import get_low_stock_predictions, get_demand_forecast, predict_stock_depletion
from agents.procurement_agent import auto_generate_procurement_orders, get_procurement_queue

async def main():
    print("Testing Procurement Generation...")
    
    # 1. Find paracetamol
    res = await execute_query("SELECT pc.id, pc.product_name, inv.stock_quantity FROM product_catalog pc JOIN inventory_items inv ON pc.id = inv.product_catalog_id WHERE pc.product_name LIKE '%paracetamol%'")
    if not res:
        print("Paracetamol not found.")
        return
    
    p_id = res[0]['id']
    stock = res[0]['stock_quantity']
    print(f"Found paracetamol: ID {p_id}, Stock: {stock}")
    
    # Force stock to 0 if not
    if stock > 0:
        print("Fixing stock to 0...")
        from db.database import execute_write
        await execute_write("UPDATE inventory_items SET stock_quantity = 0 WHERE product_catalog_id = ?", (p_id,))
        stock = 0
    
    # 2. Check prediction
    pred = await predict_stock_depletion(p_id)
    print("\nStock depletion prediction for Paracetamol:")
    print(json.dumps(pred, indent=2))
    
    # 3. Check low stock predictions
    low = await get_low_stock_predictions()
    found_in_low = [x for x in low if x['medication_id'] == p_id]
    print(f"\nIn low stock predictions? {'Yes' if found_in_low else 'No'}")
    if found_in_low:
        print(json.dumps(found_in_low[0], indent=2))
        
    # 4. Check auto generate order
    print("\nGenerating orders...")
    orders = await auto_generate_procurement_orders("attention")
    print(f"Generated {len(orders)} orders.")
    
    p_order = [o for o in orders if o.get('medication_id') == p_id]
    if p_order:
        print("Paracetamol order generated:")
        print(json.dumps(p_order[0], indent=2))
    else:
        print("Paracetamol order NOT generated.")
        
    # 5. Check actual queue
    queue = await get_procurement_queue()
    p_queue = [q for q in queue if q['product_catalog_id'] == p_id]
    print(f"\nOrders in queue for paracetamol: {len(p_queue)}")
    if p_queue:
        print(f"Status: {p_queue[0]['status']}")

asyncio.run(main())
