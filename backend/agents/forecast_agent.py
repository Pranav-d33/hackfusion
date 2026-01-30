"""
Forecast Agent
Predicts store inventory stock-outs based on sales velocity and demand patterns.
Uses purchase history to calculate when store stock will run low.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query

MAX_VELOCITY_CAP = 1000  # Max units/day considered valid

async def calculate_sales_velocity(medication_id: int, days_lookback: int = 30) -> Dict[str, Any]:
    """
    Calculate the average daily sales velocity for a medication.
    
    Args:
        medication_id: Medication ID
        days_lookback: Number of days to analyze
    
    Returns:
        Sales velocity data including units/day and trend
    """
    cutoff_date = (datetime.now() - timedelta(days=days_lookback)).strftime("%Y-%m-%d")
    
    # Get sales data for this medication
    sales_data = await execute_query("""
        SELECT 
            SUM(quantity) as total_sold,
            COUNT(*) as num_transactions,
            MIN(purchase_date) as first_sale,
            MAX(purchase_date) as last_sale
        FROM purchase_history
        WHERE medication_id = ?
        AND purchase_date >= ?
    """, (medication_id, cutoff_date))
    
    if not sales_data or not sales_data[0]['total_sold']:
        return {
            "medication_id": medication_id,
            "units_per_day": 0.0,
            "total_sold": 0,
            "num_transactions": 0,
            "trend": "no_data"
        }
    
    record = sales_data[0]
    total_sold = record['total_sold'] or 0
    
    # Calculate actual days in range
    if record['first_sale'] and record['last_sale']:
        first = datetime.strptime(record['first_sale'], "%Y-%m-%d")
        last = datetime.strptime(record['last_sale'], "%Y-%m-%d")
        actual_days = max((last - first).days, 1)
    else:
        actual_days = days_lookback
    
    units_per_day = total_sold / actual_days if actual_days > 0 else 0
    
    # GUARDRAIL: Velocity Sanity Cap
    from services.event_service import log_guardrail_trigger, Agent
    if units_per_day > MAX_VELOCITY_CAP:
        raw_velocity = units_per_day
        units_per_day = MAX_VELOCITY_CAP
        
        await log_guardrail_trigger(
            Agent.FORECAST,
            "velocity_sanity_cap",
            f"Capped calculated velocity at {MAX_VELOCITY_CAP} (raw: {raw_velocity:.2f}) due to statistical outlier detection.",
            {
                "medication_id": medication_id,
                "raw_velocity": raw_velocity,
                "capped_velocity": units_per_day,
                "limit": MAX_VELOCITY_CAP
            }
        )
    
    return {
        "medication_id": medication_id,
        "units_per_day": round(units_per_day, 2),
        "total_sold": total_sold,
        "num_transactions": record['num_transactions'],
        "days_analyzed": actual_days,
        "trend": "stable"  # Could add trend analysis later
    }


async def predict_stock_depletion(medication_id: int) -> Optional[Dict[str, Any]]:
    """
    Predict when a medication's store stock will run out.
    
    Args:
        medication_id: Medication ID
    
    Returns:
        Stock depletion prediction with date and days remaining
    """
    # Get current stock level
    stock_data = await execute_query("""
        SELECT 
            i.stock_quantity,
            m.brand_name,
            m.generic_name,
            m.dosage
        FROM inventory i
        JOIN medications m ON i.medication_id = m.id
        WHERE i.medication_id = ?
    """, (medication_id,))
    
    if not stock_data:
        return None
    
    stock = stock_data[0]
    current_stock = stock['stock_quantity']
    
    # Get sales velocity
    velocity = await calculate_sales_velocity(medication_id)
    
    if velocity['units_per_day'] <= 0:
        return {
            "medication_id": medication_id,
            "brand_name": stock['brand_name'],
            "generic_name": stock['generic_name'],
            "dosage": stock['dosage'],
            "current_stock": current_stock,
            "units_per_day": 0,
            "days_until_stockout": None,
            "predicted_stockout_date": None,
            "urgency": "no_demand"
        }
    
    # Calculate days until stock-out
    days_until_stockout = int(current_stock / velocity['units_per_day'])
    stockout_date = (datetime.now() + timedelta(days=days_until_stockout)).strftime("%Y-%m-%d")
    
    # Determine urgency
    if days_until_stockout <= 3:
        urgency = "critical"
    elif days_until_stockout <= 7:
        urgency = "warning"
    elif days_until_stockout <= 14:
        urgency = "attention"
    else:
        urgency = "healthy"
    
    return {
        "medication_id": medication_id,
        "brand_name": stock['brand_name'],
        "generic_name": stock['generic_name'],
        "dosage": stock['dosage'],
        "current_stock": current_stock,
        "units_per_day": velocity['units_per_day'],
        "days_until_stockout": days_until_stockout,
        "predicted_stockout_date": stockout_date,
        "urgency": urgency
    }


async def get_low_stock_predictions(days_threshold: int = 14) -> List[Dict[str, Any]]:
    """
    Get all medications predicted to run out within threshold days.
    
    Args:
        days_threshold: Days ahead to check for stock-outs
    
    Returns:
        List of low-stock predictions sorted by urgency
    """
    # Get all medications with stock
    medications = await execute_query("""
        SELECT medication_id FROM inventory WHERE stock_quantity > 0
    """)
    
    predictions = []
    
    for med in medications:
        prediction = await predict_stock_depletion(med['medication_id'])
        
        if prediction and prediction['days_until_stockout'] is not None:
            if prediction['days_until_stockout'] <= days_threshold:
                predictions.append(prediction)
    
    # Sort by days until stockout (most urgent first)
    predictions.sort(key=lambda x: x['days_until_stockout'])
    
    return predictions


async def get_demand_forecast(medication_id: int, forecast_days: int = 30) -> Dict[str, Any]:
    """
    Generate demand forecast for a medication.
    
    Args:
        medication_id: Medication ID
        forecast_days: Number of days to forecast
    
    Returns:
        Demand forecast with projected needs
    """
    velocity = await calculate_sales_velocity(medication_id)
    prediction = await predict_stock_depletion(medication_id)
    
    if not prediction:
        return {"error": "Medication not found"}
    
    projected_demand = int(velocity['units_per_day'] * forecast_days)
    
    # Calculate if we need to reorder
    reorder_point = int(velocity['units_per_day'] * 7)  # 7-day buffer
    needs_reorder = prediction['current_stock'] <= reorder_point
    
    # Suggested order quantity (30-day supply + buffer)
    suggested_order = max(projected_demand - prediction['current_stock'] + reorder_point, 0)
    
    return {
        "medication_id": medication_id,
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


# Test function
if __name__ == "__main__":
    import asyncio
    
    async def test():
        print("Testing Forecast Agent...")
        
        # Get low stock predictions
        predictions = await get_low_stock_predictions(days_threshold=30)
        print(f"\nFound {len(predictions)} low-stock items:")
        for pred in predictions:
            print(f"  - {pred['brand_name']}: {pred['current_stock']} units, "
                  f"depletes in {pred['days_until_stockout']} days ({pred['urgency']})")
    
    asyncio.run(test())
