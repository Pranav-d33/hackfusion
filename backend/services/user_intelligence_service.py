"""
User Intelligence Service
Analyzes user purchase history to detect patterns and generate suggestive insights.
Queries V2 schema: customer_orders, customer_order_items, product_catalog.
"""
import sys
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import math

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query


async def get_user_refill_patterns(user_id: int) -> List[Dict[str, Any]]:
    """
    Analyze purchase history to find refill patterns.

    Args:
        user_id: Customer ID

    Returns:
        List of products with refill insights
    """
    history = await execute_query("""
        SELECT
            co.id as order_id,
            co.purchase_date,
            co.customer_id,
            coi.product_catalog_id,
            coi.quantity,
            pc.product_name,
            pc.package_size
        FROM customer_orders co
        JOIN customer_order_items coi ON co.id = coi.order_id
        JOIN product_catalog pc ON coi.product_catalog_id = pc.id
        WHERE co.customer_id = ?
        ORDER BY coi.product_catalog_id, co.purchase_date ASC
    """, (user_id,))

    if not history:
        return []

    # Group by product
    product_history = {}
    for h in history:
        prod_id = h['product_catalog_id']
        if prod_id not in product_history:
            product_history[prod_id] = []
        product_history[prod_id].append(h)

    insights = []

    for prod_id, entries in product_history.items():
        if len(entries) < 2:
            continue

        # Calculate intervals
        intervals = []
        dates = []
        for e in entries:
            try:
                d = datetime.strptime(str(e['purchase_date'])[:10], "%Y-%m-%d")
                dates.append(d)
            except (ValueError, TypeError):
                continue

        if len(dates) < 2:
            continue

        for i in range(1, len(dates)):
            diff = (dates[i] - dates[i-1]).days
            intervals.append(diff)

        avg_interval = sum(intervals) / len(intervals)

        last_purchase = dates[-1]
        days_since_last = (datetime.now() - last_purchase).days
        next_due_in = avg_interval - days_since_last

        is_due_soon = next_due_in <= 5
        is_late = next_due_in < 0

        if is_due_soon or is_late:
            insights.append({
                "medication_id": prod_id,
                "brand_name": entries[0]['product_name'],
                "avg_interval_days": round(avg_interval),
                "last_purchased": last_purchase.strftime("%Y-%m-%d"),
                "days_since_last": days_since_last,
                "status": "late" if is_late else "due_soon",
                "days_offset": abs(round(next_due_in)),
                "suggestion": _generate_suggestion(entries[0]['product_name'], is_late, round(avg_interval))
            })

    return insights


def _generate_suggestion(product_name: str, is_late: bool, interval: int) -> str:
    """Generate a SUGGESTIVE, non-prescriptive insight message."""
    if is_late:
        return f"You usually order {product_name} every {interval} days. It's been a bit longer than usual—would you like to check your stock?"
    else:
        return f"Just a heads up, you typically refill {product_name} around this time. Want to add it to your cart?"
