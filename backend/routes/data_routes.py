"""
Data Export Routes
Export real-time database data as CSV or JSON.
Queries V2 schema: product_catalog, inventory_items, customer_orders, procurement_orders.
"""
from fastapi import APIRouter
from fastapi.responses import Response
from typing import Dict, Any
import csv
import io
from datetime import datetime
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("/export/medications")
async def export_medications(format: str = "json") -> Response:
    """Export current products with real-time stock levels."""
    products = await execute_query("""
        SELECT
            pc.id as product_id,
            pc.product_name,
            pc.pzn,
            pc.package_size,
            pc.description,
            pc.base_price_eur,
            COALESCE(inv.stock_quantity, 0) as stock_quantity
        FROM product_catalog pc
        LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
        ORDER BY pc.product_name
    """)

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'product_id', 'product_name', 'pzn', 'package_size',
            'description', 'base_price_eur', 'stock_quantity'
        ])
        writer.writeheader()
        for p in products:
            writer.writerow(dict(p))

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=products_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )

    return {"products": products, "count": len(products), "exported_at": datetime.now().isoformat()}


@router.get("/export/inventory")
async def export_inventory(format: str = "json") -> Response:
    """Export current inventory state."""
    inventory = await execute_query("""
        SELECT
            pc.id as product_id,
            pc.product_name,
            pc.pzn,
            inv.stock_quantity,
            inv.reorder_threshold,
            inv.reorder_quantity,
            inv.last_updated
        FROM inventory_items inv
        JOIN product_catalog pc ON inv.product_catalog_id = pc.id
        ORDER BY pc.product_name
    """)

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'product_id', 'product_name', 'pzn',
            'stock_quantity', 'reorder_threshold', 'reorder_quantity', 'last_updated'
        ])
        writer.writeheader()
        for row in inventory:
            writer.writerow(dict(row))

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=inventory_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )

    return {"inventory": inventory, "count": len(inventory), "exported_at": datetime.now().isoformat()}


@router.get("/export/orders")
async def export_orders(format: str = "json") -> Response:
    """Export customer order history."""
    orders = await execute_query("""
        SELECT
            co.id as order_id,
            c.external_patient_id as customer_id,
            c.name as customer_name,
            c.email as customer_email,
            c.address,
            c.city,
            c.state,
            c.postal_code,
            c.phone,
            c.age as customer_age,
            c.gender as customer_gender,
            co.purchase_date,
            co.created_at as order_created_at,
            co.total_price_eur as order_total_eur,
            co.dosage_frequency,
            co.dosage_frequency_norm,
            co.prescription_required,
            coi.quantity,
            coi.line_total_eur,
            COALESCE(pc.product_name, coi.raw_product_name) as product_name
        FROM customer_orders co
        JOIN customers c ON co.customer_id = c.id
        JOIN customer_order_items coi ON co.id = coi.order_id
        LEFT JOIN product_catalog pc ON coi.product_catalog_id = pc.id
        ORDER BY co.purchase_date DESC, co.created_at DESC
    """)

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'order_id', 'customer_id', 'customer_name', 'customer_email',
            'address', 'city', 'state', 'postal_code', 'phone',
            'customer_age', 'customer_gender', 'purchase_date', 'order_created_at',
            'order_total_eur', 'quantity', 'line_total_eur', 'product_name',
            'dosage_frequency', 'dosage_frequency_norm', 'prescription_required'
        ])
        writer.writeheader()
        for row in orders:
            writer.writerow(dict(row))

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=orders_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )

    return {"orders": orders, "count": len(orders), "exported_at": datetime.now().isoformat()}


@router.get("/dashboard")
async def get_dashboard_data():
    """Get aggregated data for the admin dashboard."""
    product_count = await execute_query("SELECT COUNT(*) as count FROM product_catalog")
    customer_count = await execute_query("SELECT COUNT(*) as count FROM customers")
    order_count = await execute_query("SELECT COUNT(*) as count FROM customer_orders")

    low_stock = await execute_query("""
        SELECT COUNT(*) as count FROM inventory_items WHERE stock_quantity < reorder_threshold
    """)

    pending_procurement = await execute_query("""
        SELECT COUNT(*) as count FROM procurement_orders WHERE status = 'pending'
    """)

    return {
        "products": product_count[0]['count'] if product_count else 0,
        "customers": customer_count[0]['count'] if customer_count else 0,
        "orders": order_count[0]['count'] if order_count else 0,
        "low_stock_items": low_stock[0]['count'] if low_stock else 0,
        "pending_procurement": pending_procurement[0]['count'] if pending_procurement else 0,
    }
