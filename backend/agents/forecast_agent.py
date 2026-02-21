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
MIN_SAFETY_STOCK = 10    # Fallback threshold when velocity data is sparse
DEFAULT_REORDER_QTY = 50


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
            inv.reorder_threshold,
            inv.reorder_quantity,
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
    reorder_threshold = stock.get('reorder_threshold') or 0
    reorder_quantity = stock.get('reorder_quantity') or 0
    safety_threshold = max(reorder_threshold, MIN_SAFETY_STOCK)

    velocity = await calculate_sales_velocity(product_id)

    if velocity['units_per_day'] <= 0:
        return {
            "medication_id": product_id,
            "brand_name": stock['product_name'],
            "generic_name": stock['product_name'],
            "dosage": stock['package_size'] or "",
            "current_stock": current_stock,
            "units_per_day": 0,
            # When there is no velocity data, fall back to absolute safety stock
            "days_until_stockout": 1 if current_stock <= safety_threshold else None,
            "predicted_stockout_date": (
                datetime.now() + timedelta(days=1)
            ).strftime("%Y-%m-%d") if current_stock <= safety_threshold else None,
            "urgency": "critical" if current_stock <= max(5, safety_threshold // 2) else (
                "warning" if current_stock <= safety_threshold else "no_demand"
            ),
            "reorder_threshold": safety_threshold,
            "reorder_quantity": reorder_quantity,
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

    # Respect explicit reorder thresholds even if calculated depletion is far out
    if current_stock <= safety_threshold and (days_until_stockout is None or days_until_stockout > 14):
        urgency = "critical" if current_stock <= max(5, safety_threshold // 2) else "warning"
        days_until_stockout = min(days_until_stockout or 30, 7)
        stockout_date = (datetime.now() + timedelta(days=days_until_stockout)).strftime("%Y-%m-%d")

    return {
        "medication_id": product_id,
        "brand_name": stock['product_name'],
        "generic_name": stock['product_name'],
        "dosage": stock['package_size'] or "",
        "current_stock": current_stock,
        "units_per_day": velocity['units_per_day'],
        "days_until_stockout": days_until_stockout,
        "predicted_stockout_date": stockout_date,
        "urgency": urgency,
        "reorder_threshold": safety_threshold,
        "reorder_quantity": reorder_quantity,
    }


async def get_low_stock_predictions(days_threshold: int = 14) -> List[Dict[str, Any]]:
    """
    Get all products predicted to run out within threshold days.
    """
    products = await execute_query("""
        SELECT product_catalog_id, reorder_threshold FROM inventory_items WHERE stock_quantity >= 0
    """)

    predictions = []

    for prod in products:
        prediction = await predict_stock_depletion(prod['product_catalog_id'])

        if not prediction:
            continue

        threshold = max(prediction.get("reorder_threshold", 0), MIN_SAFETY_STOCK)

        # Include predictions when either calculated depletion is soon OR safety stock is breached
        if prediction.get('days_until_stockout') is not None and prediction['days_until_stockout'] <= days_threshold:
            predictions.append(prediction)
            continue

        if prediction['current_stock'] <= threshold:
            # Force an entry so procurement can trigger even without velocity
            prediction['urgency'] = "critical" if prediction['current_stock'] <= max(5, threshold // 2) else "warning"
            prediction['days_until_stockout'] = prediction.get('days_until_stockout') or 7
            prediction['predicted_stockout_date'] = prediction.get('predicted_stockout_date') or (
                datetime.now() + timedelta(days=prediction['days_until_stockout'])
            ).strftime("%Y-%m-%d")
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
    reorder_point = max(int(velocity['units_per_day'] * 7), prediction.get('reorder_threshold') or 0, MIN_SAFETY_STOCK)
    needs_reorder = prediction['current_stock'] <= reorder_point
    suggested_order = max(projected_demand - prediction['current_stock'] + reorder_point, prediction.get('reorder_quantity') or 0, DEFAULT_REORDER_QTY)

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
