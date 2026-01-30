"""
Admin API Routes
Catalog, inventory, and admin management endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
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


# ============ Models ============

class MedicationCreate(BaseModel):
    generic_name: str
    brand_name: str
    active_ingredient: str
    dosage: str
    form: str = "tablet"
    unit_type: str = "tablet"
    rx_required: bool = False
    notes: Optional[str] = None


class MedicationUpdate(BaseModel):
    generic_name: Optional[str] = None
    brand_name: Optional[str] = None
    active_ingredient: Optional[str] = None
    dosage: Optional[str] = None
    form: Optional[str] = None
    unit_type: Optional[str] = None
    rx_required: Optional[bool] = None
    notes: Optional[str] = None


class InventoryUpdate(BaseModel):
    stock_quantity: int


class SynonymCreate(BaseModel):
    medication_id: int
    synonym: str


class IndicationCreate(BaseModel):
    label: str
    category: str  # "chronic" or "otc"


class MedicationIndicationLink(BaseModel):
    medication_id: int
    indication_id: int


# ============ Medications ============

@router.get("/medications")
async def list_medications():
    """List all medications with inventory and indications."""
    meds = await execute_query("""
        SELECT 
            m.*, 
            i.stock_quantity,
            GROUP_CONCAT(ind.label) as indications
        FROM medications m
        LEFT JOIN inventory i ON m.id = i.medication_id
        LEFT JOIN medication_indications mi ON m.id = mi.medication_id
        LEFT JOIN indications ind ON mi.indication_id = ind.id
        GROUP BY m.id
        ORDER BY m.brand_name
    """)
    return {"medications": meds}


@router.get("/medications/{med_id}")
async def get_medication(med_id: int):
    """Get a single medication by ID."""
    med = await execute_query("""
        SELECT m.*, i.stock_quantity
        FROM medications m
        LEFT JOIN inventory i ON m.id = i.medication_id
        WHERE m.id = ?
    """, (med_id,))
    
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    
    # Get synonyms
    synonyms = await execute_query(
        "SELECT synonym FROM synonyms WHERE medication_id = ?",
        (med_id,)
    )
    
    # Get indications
    indications = await execute_query("""
        SELECT ind.* FROM indications ind
        JOIN medication_indications mi ON ind.id = mi.indication_id
        WHERE mi.medication_id = ?
    """, (med_id,))
    
    result = dict(med[0])
    result["synonyms"] = [s["synonym"] for s in synonyms]
    result["indications"] = indications
    
    return result


@router.post("/medications")
async def create_medication(med: MedicationCreate):
    """Create a new medication."""
    med_id = await execute_write("""
        INSERT INTO medications 
        (generic_name, brand_name, active_ingredient, dosage, form, unit_type, rx_required, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        med.generic_name, med.brand_name, med.active_ingredient,
        med.dosage, med.form, med.unit_type, med.rx_required, med.notes
    ))
    
    # Create inventory entry
    await execute_write(
        "INSERT INTO inventory (medication_id, stock_quantity) VALUES (?, 0)",
        (med_id,)
    )
    
    # Trigger reindex
    await reindex()
    
    return {"id": med_id, "message": "Medication created"}


@router.put("/medications/{med_id}")
async def update_medication(med_id: int, med: MedicationUpdate):
    """Update a medication."""
    updates = []
    params = []
    
    for field, value in med.dict(exclude_unset=True).items():
        if value is not None:
            updates.append(f"{field} = ?")
            params.append(value)
    
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    params.append(med_id)
    await execute_write(
        f"UPDATE medications SET {', '.join(updates)} WHERE id = ?",
        tuple(params)
    )
    
    # Trigger reindex
    await reindex()
    
    return {"message": "Medication updated"}


@router.delete("/medications/{med_id}")
async def delete_medication(med_id: int):
    """Delete a medication."""
    await execute_write("DELETE FROM medications WHERE id = ?", (med_id,))
    
    # Trigger reindex
    await reindex()
    
    return {"message": "Medication deleted"}


# ============ Inventory ============

@router.get("/inventory")
async def list_inventory():
    """List all inventory."""
    inv = await execute_query("""
        SELECT i.*, m.brand_name, m.generic_name, m.dosage
        FROM inventory i
        JOIN medications m ON i.medication_id = m.id
        ORDER BY m.brand_name
    """)
    return {"inventory": inv}


@router.put("/inventory/{med_id}")
async def update_inventory(med_id: int, inv: InventoryUpdate):
    """Update inventory for a medication."""
    existing = await execute_query(
        "SELECT * FROM inventory WHERE medication_id = ?",
        (med_id,)
    )
    
    if existing:
        await execute_write(
            "UPDATE inventory SET stock_quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE medication_id = ?",
            (inv.stock_quantity, med_id)
        )
    else:
        await execute_write(
            "INSERT INTO inventory (medication_id, stock_quantity) VALUES (?, ?)",
            (med_id, inv.stock_quantity)
        )
    
    return {"message": "Inventory updated"}


# ============ Synonyms ============

@router.get("/synonyms")
async def list_synonyms():
    """List all synonyms."""
    syns = await execute_query("""
        SELECT s.*, m.brand_name
        FROM synonyms s
        JOIN medications m ON s.medication_id = m.id
        ORDER BY m.brand_name
    """)
    return {"synonyms": syns}


@router.post("/synonyms")
async def create_synonym(syn: SynonymCreate):
    """Add a synonym for a medication."""
    syn_id = await execute_write(
        "INSERT INTO synonyms (medication_id, synonym) VALUES (?, ?)",
        (syn.medication_id, syn.synonym.lower())
    )
    
    # Trigger reindex
    await reindex()
    
    return {"id": syn_id, "message": "Synonym added"}


@router.delete("/synonyms/{syn_id}")
async def delete_synonym(syn_id: int):
    """Delete a synonym."""
    await execute_write("DELETE FROM synonyms WHERE id = ?", (syn_id,))
    
    # Trigger reindex
    await reindex()
    
    return {"message": "Synonym deleted"}


# ============ Indications ============

@router.get("/indications")
async def list_indications():
    """List all indications."""
    inds = await execute_query("SELECT * FROM indications ORDER BY category, label")
    return {"indications": inds}


@router.post("/indications")
async def create_indication(ind: IndicationCreate):
    """Create a new indication."""
    if ind.category not in ("chronic", "otc"):
        raise HTTPException(status_code=400, detail="Category must be 'chronic' or 'otc'")
    
    ind_id = await execute_write(
        "INSERT INTO indications (label, category) VALUES (?, ?)",
        (ind.label, ind.category)
    )
    
    return {"id": ind_id, "message": "Indication created"}


@router.delete("/indications/{ind_id}")
async def delete_indication(ind_id: int):
    """Delete an indication."""
    await execute_write("DELETE FROM indications WHERE id = ?", (ind_id,))
    return {"message": "Indication deleted"}


# ============ Medication-Indication Links ============

@router.post("/medication-indications")
async def link_medication_indication(link: MedicationIndicationLink):
    """Link a medication to an indication."""
    await execute_write(
        "INSERT OR IGNORE INTO medication_indications (medication_id, indication_id) VALUES (?, ?)",
        (link.medication_id, link.indication_id)
    )
    return {"message": "Linked"}


@router.delete("/medication-indications/{med_id}/{ind_id}")
async def unlink_medication_indication(med_id: int, ind_id: int):
    """Unlink a medication from an indication."""
    await execute_write(
        "DELETE FROM medication_indications WHERE medication_id = ? AND indication_id = ?",
        (med_id, ind_id)
    )
    return {"message": "Unlinked"}


# ============ Reindex ============

@router.post("/reindex")
async def trigger_reindex():
    """Manually trigger vector store reindex."""
    count = await reindex()
    return {"message": f"Reindexed {count} medications"}
