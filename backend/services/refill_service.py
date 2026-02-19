"""
Refill Service
Predictive intelligence for medicine refill alerts.
Calculates depletion dates and identifies customers needing refills.
Queries V2 schema: customer_orders, customer_order_items, customers, product_catalog.
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
    """
    if daily_dose <= 0:
        return None

    try:
        purchase = datetime.strptime(str(purchase_date)[:10], "%Y-%m-%d")
        days_supply = quantity / daily_dose
        depletion = purchase + timedelta(days=days_supply)
        return depletion.strftime("%Y-%m-%d")
    except Exception:
        return None


async def get_refill_alerts(days_ahead: int = 7) -> List[Dict[str, Any]]:
    """
    Get list of customers who need refills within the specified days.
    Uses dosage_frequency from customer_orders to estimate daily dose.
    """
    today = datetime.now()
    cutoff = today + timedelta(days=days_ahead)

    # Get order history with customer and product details
    history = await execute_query("""
        SELECT
            co.id as order_id,
            co.customer_id,
            co.purchase_date,
            co.dosage_frequency,
            co.dosage_frequency_norm,
            coi.product_catalog_id,
            coi.quantity,
            c.external_patient_id,
            c.age,
            c.gender,
            pc.product_name,
            pc.package_size
        FROM customer_orders co
        JOIN customer_order_items coi ON co.id = coi.order_id
        JOIN customers c ON co.customer_id = c.id
        JOIN product_catalog pc ON coi.product_catalog_id = pc.id
        ORDER BY co.purchase_date DESC
    """)

    alerts = []
    seen_customer_products = set()

    for record in history:
        key = (record['customer_id'], record['product_catalog_id'])
        if key in seen_customer_products:
            continue

        # Estimate daily dose from dosage_frequency_norm
        daily_dose = _parse_daily_dose(record.get('dosage_frequency_norm') or record.get('dosage_frequency', ''))
        if daily_dose <= 0:
            daily_dose = 1  # Default assumption: 1 unit/day

        depletion_str = await calculate_depletion_date(
            record['quantity'],
            daily_dose,
            record['purchase_date'],
        )

        if not depletion_str:
            continue

        try:
            depletion_date = datetime.strptime(depletion_str, "%Y-%m-%d")
        except ValueError:
            continue

        if depletion_date <= cutoff:
            days_until = (depletion_date - today).days
            urgency = "critical" if days_until <= 2 else "soon" if days_until <= 5 else "upcoming"

            alerts.append({
                "customer_id": record['customer_id'],
                "customer_name": record['external_patient_id'],
                "customer_phone": "",
                "medication_id": record['product_catalog_id'],
                "brand_name": record['product_name'],
                "generic_name": record['product_name'],
                "dosage": record['package_size'] or "",
                "depletion_date": depletion_str,
                "days_until_depletion": days_until,
                "urgency": urgency,
                "last_quantity": record['quantity'],
                "daily_dose": daily_dose,
            })

            seen_customer_products.add(key)

    alerts.sort(key=lambda x: x['days_until_depletion'])
    return alerts


def _parse_daily_dose(frequency: str) -> int:
    """Parse dosage frequency string to daily dose count."""
    if not frequency:
        return 1
    freq_lower = frequency.lower().strip()
    mapping = {
        "once daily": 1,
        "twice daily": 2,
        "three times daily": 3,
        "once a day": 1,
        "twice a day": 2,
        "three times a day": 3,
        "einmal täglich": 1,
        "zweimal täglich": 2,
        "dreimal täglich": 3,
        "as needed": 1,
        "bei bedarf": 1,
    }
    for key, val in mapping.items():
        if key in freq_lower:
            return val
    return 1


async def get_customer_history(customer_id: int) -> List[Dict[str, Any]]:
    """Get purchase history for a specific customer."""
    history = await execute_query("""
        SELECT
            co.id as order_id,
            coi.product_catalog_id as medication_id,
            coi.quantity,
            co.purchase_date,
            co.dosage_frequency,
            pc.product_name as brand_name,
            pc.product_name as generic_name,
            pc.package_size as dosage
        FROM customer_orders co
        JOIN customer_order_items coi ON co.id = coi.order_id
        JOIN product_catalog pc ON coi.product_catalog_id = pc.id
        WHERE co.customer_id = ?
        ORDER BY co.purchase_date DESC
    """, (customer_id,))

    return [dict(row) for row in history]


async def create_refill_message(alert: Dict[str, Any]) -> str:
    """Create a refill conversation message for a customer."""
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


async def get_consumption_frequency(customer_id: int) -> List[Dict[str, Any]]:
    """
    Analyse purchase history to identify medicine consumption frequency.
    Groups by product and calculates avg interval between orders, daily rate,
    monthly rate and adherence score.
    """
    rows = await execute_query("""
        SELECT
            coi.product_catalog_id,
            pc.product_name,
            pc.package_size,
            co.purchase_date,
            coi.quantity,
            co.dosage_frequency,
            co.dosage_frequency_norm
        FROM customer_orders co
        JOIN customer_order_items coi ON co.id = coi.order_id
        JOIN product_catalog pc ON coi.product_catalog_id = pc.id
        WHERE co.customer_id = ?
        ORDER BY pc.product_name, co.purchase_date
    """, (customer_id,))

    # Group by product
    products: Dict[int, Dict[str, Any]] = {}
    for r in rows:
        pid = r['product_catalog_id']
        if pid not in products:
            products[pid] = {
                "product_id": pid,
                "product_name": r['product_name'],
                "package_size": r['package_size'] or "",
                "orders": [],
            }
        products[pid]["orders"].append({
            "date": r['purchase_date'],
            "quantity": r['quantity'],
            "dosage_frequency": r['dosage_frequency_norm'] or r['dosage_frequency'] or "",
        })

    results = []
    for pid, info in products.items():
        orders = info["orders"]
        total_qty = sum(o['quantity'] for o in orders)
        order_count = len(orders)

        # Parse dates
        dates = []
        for o in orders:
            try:
                dates.append(datetime.strptime(str(o['date'])[:10], "%Y-%m-%d"))
            except Exception:
                pass
        dates.sort()

        # Average interval between purchases
        avg_interval_days = None
        if len(dates) >= 2:
            intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
            avg_interval_days = round(sum(intervals) / len(intervals), 1)

        # Daily dose estimation
        daily_dose = _parse_daily_dose(orders[-1]['dosage_frequency'])

        # Total span
        if len(dates) >= 2:
            span_days = max((dates[-1] - dates[0]).days, 1)
        else:
            span_days = 30  # default

        daily_rate = round(total_qty * daily_dose / max(span_days, 1), 2)
        monthly_rate = round(daily_rate * 30, 1)

        # Adherence score: how consistent are their refills?
        adherence = 100
        if avg_interval_days and len(dates) >= 2:
            expected_interval = (total_qty / order_count) / max(daily_dose, 1)
            if expected_interval > 0:
                adherence = min(100, round((expected_interval / max(avg_interval_days, 1)) * 100))

        # Next predicted order date
        next_order_date = None
        if dates and avg_interval_days:
            next_dt = dates[-1] + timedelta(days=int(avg_interval_days))
            next_order_date = next_dt.strftime("%Y-%m-%d")

        results.append({
            "product_id": pid,
            "product_name": info["product_name"],
            "package_size": info["package_size"],
            "order_count": order_count,
            "total_quantity": total_qty,
            "first_order": dates[0].strftime("%Y-%m-%d") if dates else None,
            "last_order": dates[-1].strftime("%Y-%m-%d") if dates else None,
            "avg_interval_days": avg_interval_days,
            "daily_dose": daily_dose,
            "daily_rate": daily_rate,
            "monthly_rate": monthly_rate,
            "adherence_score": adherence,
            "next_predicted_order": next_order_date,
            "frequency_label": _frequency_label(avg_interval_days),
        })

    results.sort(key=lambda x: x['order_count'], reverse=True)
    return results


def _frequency_label(avg_days: Optional[float]) -> str:
    """Human-readable label for purchase frequency."""
    if avg_days is None:
        return "One-time"
    if avg_days <= 7:
        return "Weekly"
    if avg_days <= 15:
        return "Bi-weekly"
    if avg_days <= 35:
        return "Monthly"
    if avg_days <= 65:
        return "Bi-monthly"
    if avg_days <= 100:
        return "Quarterly"
    return "Occasional"


async def get_prediction_timeline(customer_id: int) -> Dict[str, Any]:
    """
    Build a rich prediction timeline combining depletion alerts with
    consumption frequency data for full transparency view.
    """
    alerts = await get_refill_alerts(days_ahead=60)
    customer_alerts = [a for a in alerts if a['customer_id'] == customer_id]
    frequency = await get_consumption_frequency(customer_id)
    history = await get_customer_history(customer_id)

    # Build medication timeline entries
    timeline_entries = []
    freq_map = {f['product_id']: f for f in frequency}

    for alert in customer_alerts:
        med_id = alert['medication_id']
        freq_info = freq_map.get(med_id, {})
        timeline_entries.append({
            **alert,
            "order_count": freq_info.get('order_count', 1),
            "avg_interval_days": freq_info.get('avg_interval_days'),
            "adherence_score": freq_info.get('adherence_score', 0),
            "frequency_label": freq_info.get('frequency_label', 'Unknown'),
            "monthly_rate": freq_info.get('monthly_rate', 0),
            "next_predicted_order": freq_info.get('next_predicted_order'),
            "daily_rate": freq_info.get('daily_rate', 0),
        })

    # Compute overall stats
    total_meds = len(frequency)
    regular_meds = sum(1 for f in frequency if f['order_count'] >= 2)
    avg_adherence = round(sum(f['adherence_score'] for f in frequency) / max(len(frequency), 1))

    return {
        "customer_id": customer_id,
        "timeline": timeline_entries,
        "consumption": frequency,
        "recent_orders": history[:10],
        "stats": {
            "total_medications": total_meds,
            "regular_medications": regular_meds,
            "avg_adherence": avg_adherence,
            "upcoming_refills": len([t for t in timeline_entries if t['days_until_depletion'] <= 7]),
            "critical_refills": len([t for t in timeline_entries if t['urgency'] == 'critical']),
        },
    }


if __name__ == "__main__":
    import asyncio

    async def test():
        alerts = await get_refill_alerts(days_ahead=14)
        print(f"Found {len(alerts)} refill alerts:")
        for alert in alerts:
            print(f"  - {alert['customer_name']}: {alert['brand_name']} "
                  f"(depletes in {alert['days_until_depletion']} days)")

    asyncio.run(test())
