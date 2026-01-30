"""
Forecast Routes
API endpoints for stock prediction and demand forecasting.
"""
from fastapi import APIRouter, HTTPException
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from agents.forecast_agent import (
    get_low_stock_predictions,
    get_demand_forecast,
    predict_stock_depletion,
    calculate_sales_velocity
)

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("/low-stock")
async def get_low_stock():
    """
    Get all medications predicted to run out within 14 days.
    Returns list sorted by urgency (most critical first).
    """
    try:
        predictions = await get_low_stock_predictions(days_threshold=14)
        return {
            "count": len(predictions),
            "predictions": predictions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/low-stock/{days}")
async def get_low_stock_custom(days: int):
    """
    Get medications predicted to run out within specified days.
    """
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 90")
    
    try:
        predictions = await get_low_stock_predictions(days_threshold=days)
        return {
            "days_threshold": days,
            "count": len(predictions),
            "predictions": predictions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/demand/{medication_id}")
async def get_medication_demand(medication_id: int, forecast_days: int = 30):
    """
    Get demand forecast for a specific medication.
    """
    try:
        forecast = await get_demand_forecast(medication_id, forecast_days)
        if "error" in forecast:
            raise HTTPException(status_code=404, detail=forecast["error"])
        return forecast
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/depletion/{medication_id}")
async def get_stock_depletion(medication_id: int):
    """
    Get stock depletion prediction for a specific medication.
    """
    try:
        prediction = await predict_stock_depletion(medication_id)
        if not prediction:
            raise HTTPException(status_code=404, detail="Medication not found")
        return prediction
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/velocity/{medication_id}")
async def get_sales_velocity(medication_id: int, days_lookback: int = 30):
    """
    Get sales velocity for a specific medication.
    """
    try:
        velocity = await calculate_sales_velocity(medication_id, days_lookback)
        return velocity
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
