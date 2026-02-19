"""
Forecast Agent
Predicts store inventory stock-outs based on sales velocity and demand patterns.
Uses customer_orders + customer_order_items to calculate when store stock will run low.
Queries V2 schema: customer_orders, customer_order_items, inventory_items, product_catalog.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query

MAX_VELOCITY_CAP = 1000  # Max units/day considered valid


async def calculate_sales_velocity(product_id: int, days_lookback: int = 30) -> Dict[str, Any]:
    """
    Calculate the average daily sales velocity for a product.

    Args:
        product_id: Product catalog ID
        days_lookback: Number of days to analyze

    Returns:
        Sales velocity data including units/day and trend
    """
    cutoff_date = (datetime.now() - timedelta(days=days_lookback)).strftime("%Y-%m-%d")

    sales_data = await execute_query("""
        SELECT
            SUM(coi.quantity) as total_sold,
            COUNT(*) as num_transactions,
            MIN(co.purchase_date) as first_sale,
            MAX(co.purchase_date) as last_sale
        FROM customer_order_items coi
        JOIN customer_orders co ON coi.order_id = co.id
        WHERE coi.product_catalog_id = ?
        AND co.purchase_date >= ?
    """, (product_id, cutoff_date))

    if not sales_data or not sales_data[0]['total_sold']:
        return {
            "medication_id": product_id,
            "units_per_day": 0.0,
            "total_sold": 0,
            "num_transactions": 0,
            "trend": "no_data"
        }

    record = sales_data[0]
    total_sold = record['total_sold'] or 0

    if record['first_sale'] and record['last_sale']:
        try:
            first = datetime.strptime(str(record['first_sale'])[:10], "%Y-%m-%d")
            last = datetime.strptime(str(record['last_sale'])[:10], "%Y-%m-%d")
            actual_days = max((last - first).days, 1)
        except ValueError:
            actual_days = days_lookback
    else:
        actual_days = days_lookback

    units_per_day = total_sold / actual_days if actual_days > 0 else 0

    # GUARDRAIL: Velocity Sanity Cap
    if units_per_day > MAX_VELOCITY_CAP:
        try:
            from services.event_service import log_guardrail_trigger, Agent
            raw_velocity = units_per_day
            units_per_day = MAX_VELOCITY_CAP
            await log_guardrail_trigger(
                Agent.FORECAST,
                "velocity_sanity_cap",
                f"Capped calculated velocity at {MAX_VELOCITY_CAP} (raw: {raw_velocity:.2f})",
                {"product_id": product_id, "raw_velocity": raw_velocity, "capped_velocity": units_per_day}
            )
        except Exception:
            units_per_day = MAX_VELOCITY_CAP

    return {
        "medication_id": product_id,
        "units_per_day": round(units_per_day, 2),
        "total_sold": total_sold,
        "num_transactions": record['num_transactions'],
        "days_analyzed": actual_days,
        "trend": "stable"
    }


async def predict_stock_depletion(product_id: int) -> Optional[Dict[str, Any]]:
    """
    Predict when a product's store stock will run out.

    Args:
        product_id: Product catalog ID

    Returns:
        Stock depletion prediction
    """
    stock_data = await execute_query("""
        SELECT
            inv.stock_quantity,
            pc.product_name,
            pc.package_size
        FROM inventory_items inv
        JOIN product_catalog pc ON inv.product_catalog_id = pc.id
        WHERE inv.product_catalog_id = ?
    """, (product_id,))

    if not stock_data:
        return None

    stock = stock_data[0]
    current_stock = stock['stock_quantity']

    velocity = await calculate_sales_velocity(product_id)

    if velocity['units_per_day'] <= 0:
        return {
            "medication_id": product_id,
            "brand_name": stock['product_name'],
            "generic_name": stock['product_name'],
            "dosage": stock['package_size'] or "",
            "current_stock": current_stock,
            "units_per_day": 0,
            "days_until_stockout": None,
            "predicted_stockout_date": None,
            "urgency": "no_demand"
        }

    days_until_stockout = int(current_stock / velocity['units_per_day'])
    stockout_date = (datetime.now() + timedelta(days=days_until_stockout)).strftime("%Y-%m-%d")

    if days_until_stockout <= 3:
        urgency = "critical"
    elif days_until_stockout <= 7:
        urgency = "warning"
    elif days_until_stockout <= 14:
        urgency = "attention"
    else:
        urgency = "healthy"

    return {
        "medication_id": product_id,
        "brand_name": stock['product_name'],
        "generic_name": stock['product_name'],
        "dosage": stock['package_size'] or "",
        "current_stock": current_stock,
        "units_per_day": velocity['units_per_day'],
        "days_until_stockout": days_until_stockout,
        "predicted_stockout_date": stockout_date,
        "urgency": urgency
    }


async def get_low_stock_predictions(days_threshold: int = 14) -> List[Dict[str, Any]]:
    """
    Get all products predicted to run out within threshold days.
    """
    products = await execute_query("""
        SELECT product_catalog_id FROM inventory_items WHERE stock_quantity > 0
    """)

    predictions = []

    for prod in products:
        prediction = await predict_stock_depletion(prod['product_catalog_id'])

        if prediction and prediction['days_until_stockout'] is not None:
            if prediction['days_until_stockout'] <= days_threshold:
                predictions.append(prediction)

    predictions.sort(key=lambda x: x['days_until_stockout'])
    return predictions


async def get_demand_forecast(product_id: int, forecast_days: int = 30) -> Dict[str, Any]:
    """
    Generate demand forecast for a product.
    """
    velocity = await calculate_sales_velocity(product_id)
    prediction = await predict_stock_depletion(product_id)

    if not prediction:
        return {"error": "Product not found"}

    projected_demand = int(velocity['units_per_day'] * forecast_days)
    reorder_point = int(velocity['units_per_day'] * 7)
    needs_reorder = prediction['current_stock'] <= reorder_point
    suggested_order = max(projected_demand - prediction['current_stock'] + reorder_point, 0)

    return {
        "medication_id": product_id,
        "brand_name": prediction['brand_name'],
        "current_stock": prediction['current_stock'],
        "velocity": velocity,
        "forecast_days": forecast_days,
        "projected_demand": projected_demand,
        "reorder_point": reorder_point,
        "needs_reorder": needs_reorder,
        "suggested_order_quantity": suggested_order,
        "days_until_stockout": prediction['days_until_stockout'],
        "urgency": prediction['urgency']
    }


if __name__ == "__main__":
    import asyncio

    async def test():
        print("Testing Forecast Agent...")
        predictions = await get_low_stock_predictions(days_threshold=30)
        print(f"\nFound {len(predictions)} low-stock items:")
        for pred in predictions:
            print(f"  - {pred['brand_name']}: {pred['current_stock']} units, "
                  f"depletes in {pred['days_until_stockout']} days ({pred['urgency']})")

    asyncio.run(test())
