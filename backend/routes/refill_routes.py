"""
Refill Routes
API endpoints for predictive refill alerts.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from services.refill_service import (
    get_refill_alerts,
    get_customer_history,
    create_refill_message,
    get_consumption_frequency,
    get_prediction_timeline,
)
from db.database import execute_query

router = APIRouter(prefix="/api/refill", tags=["refill"])


@router.get("/alerts")
async def list_refill_alerts(days_ahead: int = 7) -> Dict[str, Any]:
    """
    Get list of customers who need refills soon.
    
    Query params:
        days_ahead: Number of days to look ahead (default: 7)
    
    Returns:
        List of refill alerts with customer and medication info
    """
    try:
        alerts = await get_refill_alerts(days_ahead)
        return {
            "alerts": alerts,
            "count": len(alerts),
            "days_ahead": days_ahead,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customer/{customer_id}/alerts")
async def customer_refill_alerts(customer_id: int, days_ahead: int = 14) -> Dict[str, Any]:
    """
    Get refill alerts for a specific customer.
    Used by the customer-facing RefillNotification component.
    
    Args:
        customer_id: Customer ID
        days_ahead: Days to look ahead (default: 14)
    
    Returns:
        List of refill alerts for this customer
    """
    try:
        all_alerts = await get_refill_alerts(days_ahead)
        customer_alerts = [a for a in all_alerts if a['customer_id'] == customer_id]
        return {
            "alerts": customer_alerts,
            "count": len(customer_alerts),
            "customer_id": customer_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customers")
async def list_customers() -> Dict[str, Any]:
    """
    Get all customers for selection.
    """
    try:
        customers = await execute_query("SELECT * FROM customers ORDER BY name")
        return {
            "customers": [dict(c) for c in customers],
            "count": len(customers),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{customer_id}")
async def customer_history(customer_id: int) -> Dict[str, Any]:
    """
    Get purchase history for a customer.
    """
    try:
        history = await get_customer_history(customer_id)
        return {
            "customer_id": customer_id,
            "history": history,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/initiate/{customer_id}")
async def initiate_refill(customer_id: int, medication_id: int) -> Dict[str, Any]:
    """
    Initiate a refill conversation for a customer.
    
    This creates a message that would be sent to the customer
    (in MVP, this triggers a message in the internal chat UI).
    
    Returns:
        Refill message and action status
    """
    try:
        # Get the alert for this customer/medication
        alerts = await get_refill_alerts(days_ahead=30)
        
        matching_alert = None
        for alert in alerts:
            if (alert['customer_id'] == customer_id and 
                alert['medication_id'] == medication_id):
                matching_alert = alert
                break
        
        if not matching_alert:
            # Create a basic alert
            customer = await execute_query(
                "SELECT * FROM customers WHERE id = ?",
                (customer_id,)
            )
            med = await execute_query(
                "SELECT * FROM medications WHERE id = ?",
                (medication_id,)
            )
            
            if not customer or not med:
                raise HTTPException(status_code=404, detail="Customer or medication not found")
            
            matching_alert = {
                "customer_id": customer_id,
                "customer_name": customer[0]['name'],
                "customer_phone": customer[0]['phone'],
                "medication_id": medication_id,
                "brand_name": med[0]['brand_name'],
                "dosage": med[0]['dosage'],
                "days_until_depletion": 0,
                "last_quantity": 30,
            }
        
        message = await create_refill_message(matching_alert)
        
        return {
            "success": True,
            "message": message,
            "customer_id": customer_id,
            "medication_id": medication_id,
            "action": "refill_initiated",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customer/{customer_id}/consumption")
async def customer_consumption(customer_id: int) -> Dict[str, Any]:
    """
    Get consumption frequency analysis for a specific customer.
    Identifies how often they order each medicine, adherence scores,
    and predicted next order dates.
    """
    try:
        frequency = await get_consumption_frequency(customer_id)
        return {
            "customer_id": customer_id,
            "medications": frequency,
            "count": len(frequency),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customer/{customer_id}/timeline")
async def customer_timeline(customer_id: int) -> Dict[str, Any]:
    """
    Get full prediction timeline for a customer.
    Combines depletion alerts, consumption frequency data,
    and recent order history for the transparency dashboard.
    """
    try:
        timeline = await get_prediction_timeline(customer_id)
        return timeline
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
