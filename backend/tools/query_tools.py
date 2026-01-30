"""
Tool Layer - Query Tools
Database and vector search tools for the agent.
"""
from typing import List, Dict, Any, Optional
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query

# Try Pinecone first, then ChromaDB, then SQL-only fallback
try:
    from vector.pinecone_service import search_medications as pinecone_search
    vector_search_fn = pinecone_search
except ImportError:
    try:
        from vector.chroma_service import vector_search as chroma_search
        vector_search_fn = chroma_search
    except ImportError:
        vector_search_fn = None


async def lookup_by_indication(indication: str) -> List[Dict[str, Any]]:
    """
    Look up medications by indication/condition.
    
    Args:
        indication: Disease or condition name (e.g., "diabetes", "cold")
    
    Returns:
        List of medications with inventory info
    """
    # Normalize the indication
    indication_lower = indication.lower().strip()
    
    # Map common terms to indication labels
    indication_map = {
        "diabetes": "Type 2 Diabetes",
        "type 2 diabetes": "Type 2 Diabetes",
        "sugar": "Type 2 Diabetes",
        "hypertension": "Hypertension",
        "blood pressure": "Hypertension",
        "bp": "Hypertension",
        "high bp": "Hypertension",
        "thyroid": "Hypothyroidism",
        "hypothyroidism": "Hypothyroidism",
        "hyperthyroidism": "Hyperthyroidism",
        "cold": "Cold",
        "common cold": "Cold",
        "fever": "Fever",
        "cough": "Cough",
        "headache": "Headache",
        "allergies": "Allergies",
        "allergy": "Allergies",
        "acidity": "Acidity",
        "gas": "Acidity",
        "gastric": "Acidity",
    }
    
    # Try to map to known indication
    search_label = indication_map.get(indication_lower, indication)
    
    # Query medications by indication with inventory
    results = await execute_query("""
        SELECT 
            m.id, m.generic_name, m.brand_name, m.active_ingredient,
            m.dosage, m.form, m.unit_type, m.rx_required,
            i.stock_quantity,
            ind.label as indication, ind.category
        FROM medications m
        JOIN medication_indications mi ON m.id = mi.medication_id
        JOIN indications ind ON mi.indication_id = ind.id
        LEFT JOIN inventory i ON m.id = i.medication_id
        WHERE LOWER(ind.label) LIKE ? OR LOWER(ind.label) = ?
    """, (f"%{indication_lower}%", search_label.lower()))
    
    # Filter to in-stock only
    in_stock = [
        {
            "id": r['id'],
            "generic_name": r['generic_name'],
            "brand_name": r['brand_name'],
            "active_ingredient": r['active_ingredient'],
            "dosage": r['dosage'],
            "form": r['form'],
            "unit_type": r['unit_type'],
            "rx_required": bool(r['rx_required']),
            "stock_quantity": r['stock_quantity'] or 0,
            "indication": r['indication'],
            "category": r['category'],
        }
        for r in results if (r['stock_quantity'] or 0) > 0
    ]
    
    return in_stock


async def vector_search(name: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Search for medications by name using fuzzy vector matching.
    Falls back to SQL LIKE search if no vector store is available.
    
    Args:
        name: Medication name (brand, generic, or misspelling)
        top_k: Number of candidates to return
    
    Returns:
        List of candidate medications with similarity scores
    """
    # If vector search is available, use it
    if vector_search_fn:
        candidates = await vector_search_fn(name, top_k)
    else:
        # SQL fallback
        name_lower = name.lower()
        results = await execute_query("""
            SELECT m.*, i.stock_quantity
            FROM medications m
            LEFT JOIN inventory i ON m.id = i.medication_id
            LEFT JOIN synonyms s ON m.id = s.medication_id
            WHERE LOWER(m.brand_name) LIKE ?
               OR LOWER(m.generic_name) LIKE ?
               OR LOWER(s.synonym) LIKE ?
            LIMIT ?
        """, (f"%{name_lower}%", f"%{name_lower}%", f"%{name_lower}%", top_k))
        
        candidates = [dict(r) for r in results] if results else []
    
    # Enrich with inventory data if not already present
    for candidate in candidates:
        if 'stock_quantity' not in candidate or candidate.get('stock_quantity') is None:
            inv = await execute_query(
                "SELECT stock_quantity FROM inventory WHERE medication_id = ?",
                (candidate['id'],)
            )
            candidate['stock_quantity'] = inv[0]['stock_quantity'] if inv else 0
    
    return candidates


async def get_inventory(med_id: int) -> Dict[str, Any]:
    """
    Get inventory information for a medication.
    
    Args:
        med_id: Medication ID
    
    Returns:
        Inventory info with stock quantity
    """
    result = await execute_query("""
        SELECT m.id, m.brand_name, m.generic_name, i.stock_quantity
        FROM medications m
        LEFT JOIN inventory i ON m.id = i.medication_id
        WHERE m.id = ?
    """, (med_id,))
    
    if not result:
        return {"error": "Medication not found", "med_id": med_id}
    
    return {
        "med_id": result[0]['id'],
        "brand_name": result[0]['brand_name'],
        "generic_name": result[0]['generic_name'],
        "stock_quantity": result[0]['stock_quantity'] or 0,
        "in_stock": (result[0]['stock_quantity'] or 0) > 0,
    }


async def get_rx_flag(med_id: int) -> Dict[str, Any]:
    """
    Check if a medication requires prescription.
    
    Args:
        med_id: Medication ID
    
    Returns:
        RX requirement info
    """
    result = await execute_query(
        "SELECT id, brand_name, rx_required FROM medications WHERE id = ?",
        (med_id,)
    )
    
    if not result:
        return {"error": "Medication not found", "med_id": med_id}
    
    return {
        "med_id": result[0]['id'],
        "brand_name": result[0]['brand_name'],
        "rx_required": bool(result[0]['rx_required']),
    }


async def get_medication_details(med_id: int) -> Optional[Dict[str, Any]]:
    """
    Get full medication details.
    
    Args:
        med_id: Medication ID
    
    Returns:
        Complete medication info
    """
    result = await execute_query("""
        SELECT 
            m.*, i.stock_quantity
        FROM medications m
        LEFT JOIN inventory i ON m.id = i.medication_id
        WHERE m.id = ?
    """, (med_id,))
    
    if not result:
        return None
    
    med = result[0]
    return {
        "id": med['id'],
        "generic_name": med['generic_name'],
        "brand_name": med['brand_name'],
        "active_ingredient": med['active_ingredient'],
        "dosage": med['dosage'],
        "form": med['form'],
        "unit_type": med['unit_type'],
        "rx_required": bool(med['rx_required']),
        "notes": med['notes'],
        "stock_quantity": med['stock_quantity'] or 0,
    }


async def get_tier1_alternatives(med_id: int) -> List[Dict[str, Any]]:
    """
    Get Tier-1 alternatives (same active ingredient) that are in stock.
    
    Args:
        med_id: Medication ID
    
    Returns:
        List of alternative medications
    """
    # First get the active ingredient
    med = await execute_query(
        "SELECT active_ingredient FROM medications WHERE id = ?",
        (med_id,)
    )
    
    if not med:
        return []
    
    active_ingredient = med[0]['active_ingredient']
    
    # Find alternatives with same active ingredient
    alternatives = await execute_query("""
        SELECT 
            m.id, m.generic_name, m.brand_name, m.dosage, m.form,
            m.rx_required, i.stock_quantity
        FROM medications m
        LEFT JOIN inventory i ON m.id = i.medication_id
        WHERE m.active_ingredient = ? 
          AND m.id != ?
          AND (i.stock_quantity > 0 OR i.stock_quantity IS NULL)
    """, (active_ingredient, med_id))
    
    return [
        {
            "id": alt['id'],
            "generic_name": alt['generic_name'],
            "brand_name": alt['brand_name'],
            "dosage": alt['dosage'],
            "form": alt['form'],
            "rx_required": bool(alt['rx_required']),
            "stock_quantity": alt['stock_quantity'] or 0,
        }
        for alt in alternatives if (alt['stock_quantity'] or 0) > 0
    ]
