"""
User Intelligence Service
Analyzes user purchase history to detect patterns and generate suggestive insights.
"""
import sys
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import math

# Add backend to path
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query


async def get_user_refill_patterns(user_id: int) -> List[Dict[str, Any]]:
    """
    Analyze purchase history to find refill patterns.
    
    Args:
        user_id: Customer ID
    
    Returns:
        List of medications with refill insights
    """
    # Get history sorted by date
    history = await execute_query("""
        SELECT ph.*, m.brand_name, m.dosage 
        FROM purchase_history ph
        JOIN medications m ON ph.medication_id = m.id
        WHERE ph.customer_id = ?
        ORDER BY ph.medication_id, ph.purchase_date ASC
    """, (user_id,))
    
    if not history:
        return []
    
    # Group by medication
    med_history = {}
    for h in history:
        med_id = h['medication_id']
        if med_id not in med_history:
            med_history[med_id] = []
        med_history[med_id].append(h)
    
    insights = []
    
    for med_id, entries in med_history.items():
        if len(entries) < 2:
            continue # Need at least 2 purchases to find a pattern
            
        # Calculate intervals
        intervals = []
        dates = [datetime.fromisoformat(e['purchase_date'].replace(' ', 'T')) for e in entries]
        
        for i in range(1, len(dates)):
            diff = (dates[i] - dates[i-1]).days
            intervals.append(diff)
            
        avg_interval = sum(intervals) / len(intervals)
        
        # Calculate lateness
        last_purchase = dates[-1]
        days_since_last = (datetime.now() - last_purchase).days
        next_due_in = avg_interval - days_since_last
        
        # Suggest if close to due date (within 5 days or late)
        is_due_soon = next_due_in <= 5
        is_late = next_due_in < 0
        
        if is_due_soon or is_late:
            insights.append({
                "medication_id": med_id,
                "brand_name": entries[0]['brand_name'],
                "avg_interval_days": round(avg_interval),
                "last_purchased": last_purchase.strftime("%Y-%m-%d"),
                "days_since_last": days_since_last,
                "status": "late" if is_late else "due_soon",
                "days_offset": abs(round(next_due_in)), # Days late or days until due
                "suggestion": _generate_suggestion(entries[0]['brand_name'], is_late, round(avg_interval))
            })
            
    return insights


def _generate_suggestion(brand_name: str, is_late: bool, interval: int) -> str:
    """Generate a SUGGESTIVE, non-prescriptive insight message."""
    if is_late:
        return f"You usually order {brand_name} every {interval} days. It's been a bit longer than usual—would you like to check your stock?"
    else:
        return f"Just a heads up, you typically refill {brand_name} around this time. Want to add it to your cart?"
