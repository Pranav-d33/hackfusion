"""
Stage 4: Populate Domain Tables
Reads from curated + i18n layers and populates the app-facing
product_catalog, customers, customer_orders, customer_order_items,
and inventory_items tables.
"""
import asyncio
import sys
from pathlib import Path
from typing import Dict, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from db.database import execute_query, execute_write


# ── Helpers ─────────────────────────────────────────────────

async def _get_translated(i18n_key: str, lang: str = "en") -> Optional[str]:
    """Look up translated text for an i18n key and language."""
    rows = await execute_query(
        """SELECT lst.translated_text
           FROM localized_strings ls
           JOIN localized_string_translations lst ON lst.localized_string_id = ls.id
           WHERE ls.string_key = ? AND lst.language_code = ?""",
        (i18n_key, lang),
    )
    return rows[0]["translated_text"] if rows else None


# ── Populate product_catalog ────────────────────────────────

async def populate_products(display_lang: str = "en") -> int:
    """
    Create product_catalog rows from products_export_records.
    product_name is set to the best available translation (fallback to source).
    """
    records = await execute_query(
        """SELECT id, product_id, product_name, product_name_i18n_key,
                  pzn, price_rec_eur, package_size,
                  descriptions, descriptions_i18n_key
           FROM products_export_records
           ORDER BY id""",
    )

    inserted = 0
    for r in records:
        # Best-effort translated name
        name_translated = None
        if r["product_name_i18n_key"]:
            name_translated = await _get_translated(r["product_name_i18n_key"], display_lang)

        desc_translated = None
        if r["descriptions_i18n_key"]:
            desc_translated = await _get_translated(r["descriptions_i18n_key"], display_lang)

        # product_name = translated if available, else original German
        product_name = name_translated or r["product_name"]
        description = desc_translated or r["descriptions"]

        try:
            await execute_write(
                """INSERT OR IGNORE INTO product_catalog
                   (external_product_id, product_name, product_name_i18n_key,
                    pzn, package_size, description, description_i18n_key,
                    base_price_eur, default_language, source_record_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'de', ?)""",
                (
                    r["product_id"], product_name, r["product_name_i18n_key"],
                    r["pzn"], r["package_size"],
                    description, r["descriptions_i18n_key"],
                    r["price_rec_eur"], r["id"],
                ),
            )
            inserted += 1
        except Exception as e:
            print(f"    ⚠ product_catalog insert failed for pid={r['product_id']}: {e}")

    print(f"  ✅ product_catalog: {inserted} rows")
    return inserted


# ── Populate inventory_items ────────────────────────────────

async def populate_inventory(default_stock: int = 100) -> int:
    """
    Create an inventory_items row for each product_catalog entry
    with a default stock quantity.
    """
    products = await execute_query("SELECT id FROM product_catalog ORDER BY id")
    inserted = 0
    for p in products:
        try:
            await execute_write(
                """INSERT OR IGNORE INTO inventory_items
                   (product_catalog_id, stock_quantity, reorder_threshold, reorder_quantity)
                   VALUES (?, ?, 10, 50)""",
                (p["id"], default_stock),
            )
            inserted += 1
        except Exception:
            pass

    print(f"  ✅ inventory_items: {inserted} rows (default stock={default_stock})")
    return inserted


# ── Populate customers ──────────────────────────────────────

async def populate_customers() -> int:
    """
    Deduplicate patients from consumer_order_history_records
    into the customers table.
    """
    patients = await execute_query(
        """SELECT DISTINCT patient_id,
                  MAX(patient_age) as age,
                  MAX(patient_gender_norm) as gender
           FROM consumer_order_history_records
           GROUP BY patient_id
           ORDER BY patient_id""",
    )
    inserted = 0
    for p in patients:
        try:
            await execute_write(
                """INSERT OR IGNORE INTO customers
                   (external_patient_id, age, gender)
                   VALUES (?, ?, ?)""",
                (p["patient_id"], p["age"], p["gender"]),
            )
            inserted += 1
        except Exception:
            pass

    print(f"  ✅ customers: {inserted} rows")
    return inserted


# ── Populate orders ─────────────────────────────────────────

async def populate_orders() -> int:
    """
    Create customer_orders + customer_order_items from
    consumer_order_history_records.
    """
    records = await execute_query(
        """SELECT coh.id as record_id, coh.patient_id,
                  coh.purchase_date, coh.product_name,
                  coh.quantity, coh.total_price_eur,
                  coh.dosage_frequency, coh.dosage_frequency_norm,
                  coh.prescription_required_bool,
                  coh.source_row_index
           FROM consumer_order_history_records coh
           ORDER BY coh.purchase_date, coh.patient_id""",
    )

    # Build a patient_id → customer.id map
    cust_rows = await execute_query("SELECT id, external_patient_id FROM customers")
    cust_map: Dict[str, int] = {c["external_patient_id"]: c["id"] for c in cust_rows}

    # Build product_name → product_catalog.id map
    prod_rows = await execute_query(
        "SELECT id, product_name FROM product_catalog"
    )
    # Exact match map + a lowercase variant for fuzzy
    prod_map: Dict[str, int] = {}
    prod_map_lower: Dict[str, int] = {}
    for pr in prod_rows:
        prod_map[pr["product_name"]] = pr["id"]
        prod_map_lower[pr["product_name"].lower()] = pr["id"]

    # Also map by original German name from products_export_records
    orig_rows = await execute_query(
        "SELECT per.product_name, pc.id as catalog_id "
        "FROM products_export_records per "
        "JOIN product_catalog pc ON pc.source_record_id = per.id"
    )
    for orow in orig_rows:
        prod_map[orow["product_name"]] = orow["catalog_id"]
        prod_map_lower[orow["product_name"].lower()] = orow["catalog_id"]

    order_count = 0
    for r in records:
        customer_id = cust_map.get(r["patient_id"])

        try:
            order_id = await execute_write(
                """INSERT INTO customer_orders
                   (customer_id, external_source_row, source_record_id,
                    purchase_date, total_price_eur,
                    dosage_frequency, dosage_frequency_norm, prescription_required)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    customer_id, r["source_row_index"], r["record_id"],
                    r["purchase_date"], r["total_price_eur"],
                    r["dosage_frequency"], r["dosage_frequency_norm"],
                    r["prescription_required_bool"],
                ),
            )
        except Exception as e:
            print(f"    ⚠ order insert failed for row {r['source_row_index']}: {e}")
            continue

        # Resolve product catalog id
        pname = r["product_name"]
        catalog_id = (
            prod_map.get(pname)
            or prod_map_lower.get(pname.lower() if pname else "")
        )

        try:
            await execute_write(
                """INSERT INTO customer_order_items
                   (order_id, product_catalog_id, raw_product_name, quantity, line_total_eur)
                   VALUES (?, ?, ?, ?, ?)""",
                (order_id, catalog_id, pname, r["quantity"] or 1, r["total_price_eur"]),
            )
        except Exception as e:
            print(f"    ⚠ order_item insert failed: {e}")

        order_count += 1

    print(f"  ✅ customer_orders + items: {order_count} rows")
    return order_count


# ── Main entry point ────────────────────────────────────────

async def run_populate(display_lang: str = "en") -> Dict[str, int]:
    """Run Stage 4: populate all domain tables."""
    print("━━ Stage 4: Populate Domain Tables ━━━━━━━━━━━━━━━━")
    stats = {}
    stats["products"] = await populate_products(display_lang)
    stats["inventory"] = await populate_inventory()
    stats["customers"] = await populate_customers()
    stats["orders"] = await populate_orders()
    return stats


if __name__ == "__main__":
    asyncio.run(run_populate())
