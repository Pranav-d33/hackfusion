"""
Admin API Routes
Product catalog, inventory, and admin management endpoints.
Queries V2 schema: product_catalog, inventory_items.
"""
from fastapi import APIRouter, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import traceback
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query, execute_write

# Try Pinecone first, then ChromaDB, then no-op reindex
try:
    from vector.pinecone_service import index_medications as reindex
except ImportError:
    try:
        from vector.chroma_service import reindex
    except ImportError:
        async def reindex():
            """No-op reindex when no vector store is available."""
            return 0

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _safe_json(payload):
    return JSONResponse(content=jsonable_encoder(payload))


# ============ Models ============

class ProductCreate(BaseModel):
    product_name: str
    pzn: Optional[int] = None
    package_size: Optional[str] = None
    description: Optional[str] = None
    base_price_eur: Optional[float] = None
    rx_required: Optional[bool] = False


class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    pzn: Optional[int] = None
    package_size: Optional[str] = None
    description: Optional[str] = None
    base_price_eur: Optional[float] = None
    rx_required: Optional[bool] = None


class InventoryUpdate(BaseModel):
    stock_quantity: int


# ============ Products (replaces Medications) ============

@router.get("/medications")
async def list_medications():
    """List all products with inventory info."""
    try:
        products = await execute_query("""
            SELECT
                pc.id, pc.product_name, pc.external_product_id,
                pc.pzn, pc.package_size, pc.description,
                pc.base_price_eur, pc.default_language, pc.rx_required,
                COALESCE(inv.stock_quantity, 0) as stock_quantity,
                COALESCE(inv.reorder_threshold, 0) as reorder_threshold,
                COALESCE(inv.reorder_quantity, 0) as reorder_quantity,
                inv.last_restocked_at as last_restocked_at,
                inv.last_updated as last_updated,
                COALESCE(lst_name.translated_text, pc.product_name) as product_name_en
            FROM product_catalog pc
            LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
            LEFT JOIN localized_strings ls_name ON ls_name.string_key = pc.product_name_i18n_key
                AND ls_name.namespace = 'product_export'
            LEFT JOIN localized_string_translations lst_name ON lst_name.localized_string_id = ls_name.id
                AND lst_name.language_code = 'en'
            ORDER BY pc.product_name
        """)
        return _safe_json({"medications": products})
    except Exception as exc:
        print("list_medications failed:")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"detail": f"Failed to load medications: {str(exc)}"},
        )


@router.get("/medications/{med_id}")
async def get_medication(med_id: int):
    """Get a single product by ID."""
    product = await execute_query("""
        SELECT pc.*, COALESCE(inv.stock_quantity, 0) as stock_quantity
        FROM product_catalog pc
        LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
        WHERE pc.id = ?
    """, (med_id,))

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    result = dict(product[0])
    # For backward compat
    result["synonyms"] = []
    result["indications"] = []
    return result


@router.post("/medications")
async def create_medication(prod: ProductCreate):
    """Create a new product."""
    prod_id = await execute_write("""
        INSERT INTO product_catalog
        (product_name, pzn, package_size, description, base_price_eur, rx_required)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (prod.product_name, prod.pzn, prod.package_size, prod.description, prod.base_price_eur, prod.rx_required))

    # Create inventory entry
    await execute_write(
        "INSERT INTO inventory_items (product_catalog_id, stock_quantity) VALUES (?, 0)",
        (prod_id,)
    )

    await reindex()
    return {"id": prod_id, "message": "Product created"}


@router.put("/medications/{med_id}")
async def update_medication(med_id: int, prod: ProductUpdate):
    """Update a product."""
    updates = []
    params = []

    for field, value in prod.dict(exclude_unset=True).items():
        if value is not None:
            updates.append(f"{field} = ?")
            params.append(value)

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    params.append(med_id)
    await execute_write(
        f"UPDATE product_catalog SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        tuple(params)
    )

    await reindex()
    return {"message": "Product updated"}


@router.delete("/medications/{med_id}")
async def delete_medication(med_id: int):
    """Delete a product."""
    await execute_write("DELETE FROM product_catalog WHERE id = ?", (med_id,))
    await reindex()
    return {"message": "Product deleted"}


# ============ Inventory ============

@router.get("/inventory")
async def list_inventory():
    """List all inventory."""
    try:
        inv = await execute_query("""
            SELECT inv.*, pc.product_name, pc.package_size, pc.pzn
            FROM inventory_items inv
            JOIN product_catalog pc ON inv.product_catalog_id = pc.id
            ORDER BY pc.product_name
        """)
        return _safe_json({"inventory": inv})
    except Exception as exc:
        print("list_inventory failed:")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"detail": f"Failed to load inventory: {str(exc)}"},
        )


@router.put("/inventory/{med_id}")
async def update_inventory(med_id: int, inv: InventoryUpdate):
    """Update inventory for a product."""
    existing = await execute_query(
        "SELECT * FROM inventory_items WHERE product_catalog_id = ?",
        (med_id,)
    )

    if existing:
        await execute_write(
            "UPDATE inventory_items SET stock_quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE product_catalog_id = ?",
            (inv.stock_quantity, med_id)
        )
    else:
        await execute_write(
            "INSERT INTO inventory_items (product_catalog_id, stock_quantity) VALUES (?, ?)",
            (med_id, inv.stock_quantity)
        )

    return {"message": "Inventory updated"}


# ============ Backward compat stubs ============

@router.get("/synonyms")
async def list_synonyms():
    """Stub — synonyms are handled via i18n translations."""
    return {"synonyms": [], "note": "Synonyms handled via i18n translation layer"}


@router.get("/indications")
async def list_indications():
    """Stub — indications not in V2 schema."""
    return {"indications": [], "note": "Indications not tracked in V2 schema"}


# ============ Reindex ============

@router.post("/reindex")
async def trigger_reindex():
    """Manually trigger vector store reindex."""
    count = await reindex()
    return {"message": f"Reindexed {count} products"}
