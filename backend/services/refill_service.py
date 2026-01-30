"""
Refill Service
Predictive intelligence for medicine refill alerts.
Calculates depletion dates and identifies customers needing refills.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query


async def calculate_depletion_date(
    quantity: int,
    daily_dose: int,
    purchase_date: str,
) -> Optional[str]:
    """
    Calculate when medicine will run out.
    
    Args:
        quantity: Number of units purchased
        daily_dose: Units taken per day
        purchase_date: Date of purchase (YYYY-MM-DD)
    
    Returns:
        Depletion date string (YYYY-MM-DD)
    """
    if daily_dose <= 0:
        return None
    
    try:
        purchase = datetime.strptime(purchase_date, "%Y-%m-%d")
        days_supply = quantity / daily_dose
        depletion = purchase + timedelta(days=days_supply)
        return depletion.strftime("%Y-%m-%d")
    except Exception:
        return None


async def get_refill_alerts(days_ahead: int = 7) -> List[Dict[str, Any]]:
    """
    Get list of customers who need refills within the specified days.
    
    Args:
        days_ahead: Number of days to look ahead for depletion
    
    Returns:
        List of refill alerts with customer and medication info
    """
    today = datetime.now()
    cutoff = today + timedelta(days=days_ahead)
    
    # Get all purchase history with customer and medication details
    history = await execute_query("""
        SELECT 
            ph.id as purchase_id,
            ph.customer_id,
            ph.medication_id,
            ph.quantity,
            ph.daily_dose,
            ph.purchase_date,
            c.name as customer_name,
            c.phone as customer_phone,
            m.brand_name,
            m.generic_name,
            m.dosage,
            ind.category
        FROM purchase_history ph
        JOIN customers c ON ph.customer_id = c.id
        JOIN medications m ON ph.medication_id = m.id
        LEFT JOIN medication_indications mi ON m.id = mi.medication_id
        LEFT JOIN indications ind ON mi.indication_id = ind.id
        WHERE ind.category = 'chronic'
        ORDER BY ph.purchase_date DESC
    """)
    
    alerts = []
    seen_customer_meds = set()  # Dedupe by customer+medication
    
    for record in history:
        key = (record['customer_id'], record['medication_id'])
        if key in seen_customer_meds:
            continue
        
        depletion_str = await calculate_depletion_date(
            record['quantity'],
            record['daily_dose'],
            record['purchase_date'],
        )
        
        if not depletion_str:
            continue
        
        depletion_date = datetime.strptime(depletion_str, "%Y-%m-%d")
        
        # Check if depletion is within range
        if depletion_date <= cutoff:
            days_until = (depletion_date - today).days
            urgency = "critical" if days_until <= 2 else "soon" if days_until <= 5 else "upcoming"
            
            alerts.append({
                "customer_id": record['customer_id'],
                "customer_name": record['customer_name'],
                "customer_phone": record['customer_phone'],
                "medication_id": record['medication_id'],
                "brand_name": record['brand_name'],
                "generic_name": record['generic_name'],
                "dosage": record['dosage'],
                "depletion_date": depletion_str,
                "days_until_depletion": days_until,
                "urgency": urgency,
                "last_quantity": record['quantity'],
                "daily_dose": record['daily_dose'],
            })
            
            seen_customer_meds.add(key)
    
    # Sort by urgency (critical first)
    alerts.sort(key=lambda x: x['days_until_depletion'])
    
    return alerts


async def get_customer_history(customer_id: int) -> List[Dict[str, Any]]:
    """
    Get purchase history for a specific customer.
    
    Args:
        customer_id: Customer ID
    
    Returns:
        List of past purchases with medication details
    """
    history = await execute_query("""
        SELECT 
            ph.id as purchase_id,
            ph.medication_id,
            ph.quantity,
            ph.daily_dose,
            ph.purchase_date,
            m.brand_name,
            m.generic_name,
            m.dosage,
            m.rx_required
        FROM purchase_history ph
        JOIN medications m ON ph.medication_id = m.id
        WHERE ph.customer_id = ?
        ORDER BY ph.purchase_date DESC
    """, (customer_id,))
    
    return [dict(row) for row in history]


async def create_refill_message(alert: Dict[str, Any]) -> str:
    """
    Create a refill conversation message for a customer.
    
    Args:
        alert: Refill alert dictionary
    
    Returns:
        Message string to initiate refill conversation
    """
    days = alert['days_until_depletion']
    
    if days <= 0:
        time_msg = "Your medicine has likely run out"
    elif days == 1:
        time_msg = "Your medicine will run out tomorrow"
    else:
        time_msg = f"Your medicine will run out in {days} days"
    
    return (
        f"Hi {alert['customer_name']}! {time_msg}. "
        f"Would you like to reorder {alert['brand_name']} ({alert['dosage']})? "
        f"Last time you ordered {alert['last_quantity']} units."
    )


# Test function
if __name__ == "__main__":
    import asyncio
    
    async def test():
        alerts = await get_refill_alerts(days_ahead=14)
        print(f"Found {len(alerts)} refill alerts:")
        for alert in alerts:
            print(f"  - {alert['customer_name']}: {alert['brand_name']} "
                  f"(depletes in {alert['days_until_depletion']} days)")
    
    asyncio.run(test())
