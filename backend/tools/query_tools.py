"""
Tool Layer - Query Tools
Database and vector search tools for the agent.
Queries the V2 schema: product_catalog, inventory_items, customers, customer_orders, customer_order_items.
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


# ============================================================================
# SYMPTOM → PRODUCT KEYWORD MAPPING
# Maps common English symptoms/conditions to German/brand product keywords
# that are likely in the product catalog.
# ============================================================================
SYMPTOM_PRODUCT_MAP = {
    "fever": ["Paracetamol", "Nurofen", "Ibuprofen", "Aspirin"],
    "headache": ["Paracetamol", "Nurofen", "Ibuprofen", "Aspirin"],
    "cold": ["Sinupret", "Umckaloabo", "Mucosolvan", "Paracetamol"],
    "cough": ["Mucosolvan", "Sinupret", "Umckaloabo"],
    "allergy": ["Cetirizin", "Vividrin", "Livocab", "Cromo"],
    "allergies": ["Cetirizin", "Vividrin", "Livocab", "Cromo"],
    "pain": ["Paracetamol", "Nurofen", "Ibuprofen", "Diclo"],
    "stomach": ["Iberogast", "Kijimea", "Loperamid"],
    "diarrhea": ["Loperamid", "Kijimea"],
    "constipation": ["DulcoLax", "Dulcolax"],
    "skin": ["Panthenol", "Bepanthen", "Eucerin", "Aveeno", "Cetaphil", "FeniHydrocort"],
    "wound": ["Panthenol", "Bepanthen"],
    "eye": ["Augentropfen", "Vividrin", "Cromo", "Livocab", "Hyaluron"],
    "vitamin": ["Vitamin", "Vitasprint", "Multivitamin", "Vigantolvit", "Centrum"],
    "omega": ["NORSAN", "Omega"],
    "energy": ["Vitasprint", "Centrum"],
    "prostate": ["Prostata", "SAW PALMETO"],
    "urinary": ["Cystinol", "Aqualibra", "GRANU FINK"],
    "bladder": ["Cystinol", "Aqualibra", "GRANU FINK"],
    "digestive": ["Iberogast", "Kijimea", "OMNi-BiOTiC", "MULTILAC", "proBIO"],
    "probiotic": ["OMNi-BiOTiC", "MULTILAC", "proBIO", "Kijimea"],
    "hair loss": ["Minoxidil"],
    "muscle pain": ["Diclo", "Nurofen"],
    "joint pain": ["Diclo", "Nurofen"],
    "dry skin": ["Eucerin", "Aveeno", "Cetaphil"],
    "acne": ["Eucerin DERMOPURE"],
    "sleep": ["Calmvalera"],
    "anxiety": ["Calmvalera"],
    "menopause": ["femiLoges"],
    "magnesium": ["Magnesium Verla"],
    "baby": ["frida baby", "Osa"],
    "inflammation": ["Nurofen", "Diclo", "Ibuprofen"],
    "sore throat": ["Umckaloabo", "Sinupret"],
    "flu": ["Paracetamol", "Nurofen", "Sinupret", "Umckaloabo"],
    "runny nose": ["Sinupret", "Cetirizin", "Vividrin"],
    "itching": ["FeniHydrocort", "Cetirizin"],
    "rash": ["FeniHydrocort", "Panthenol", "Bepanthen"],
    "sunburn": ["Panthenol"],
    "diabetes": ["Metformin"],
    "blood pressure": ["Ramipril"],
    "hypertension": ["Ramipril"],
    "acidity": ["Iberogast"],
    "gas": ["Iberogast"],
    "bloating": ["Iberogast", "Kijimea"],
}


async def lookup_by_indication(indication: str) -> List[Dict[str, Any]]:
    """
    Look up products by keyword / indication.
    Uses a symptom→product keyword map first (since product names are in German),
    then falls back to SQL LIKE search on product name + description + translations.

    Args:
        indication: Keyword, condition, or product category

    Returns:
        List of products with inventory info
    """
    indication_lower = indication.lower().strip()

    # ---- STRATEGY 1: Symptom → Product keyword map ----
    # This bridges English symptoms to German product names
    mapped_keywords = SYMPTOM_PRODUCT_MAP.get(indication_lower, [])
    mapped_results = []
    if mapped_keywords:
        for keyword in mapped_keywords:
            kw_lower = keyword.lower()
            rows = await execute_query("""
                SELECT DISTINCT
                    pc.id, pc.product_name, pc.pzn, pc.package_size,
                    pc.description, pc.base_price_eur,
                    COALESCE(inv.stock_quantity, 0) as stock_quantity
                FROM product_catalog pc
                LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
                WHERE LOWER(pc.product_name) LIKE ?
                  AND COALESCE(inv.stock_quantity, 0) > 0
            """, (f"%{kw_lower}%",))
            for r in rows:
                if not any(m['id'] == r['id'] for m in mapped_results):
                    mapped_results.append({
                        "id": r['id'],
                        "product_name": r['product_name'],
                        "brand_name": r['product_name'],
                        "generic_name": r['product_name'],
                        "pzn": r['pzn'],
                        "package_size": r['package_size'],
                        "description": r['description'],
                        "price": r['base_price_eur'],
                        "stock_quantity": r['stock_quantity'],
                        "rx_required": False,
                        "form": r['package_size'] or "unit",
                        "dosage": r['package_size'] or "",
                    })

    if mapped_results:
        return mapped_results[:5]

    # ---- STRATEGY 2: SQL LIKE search on product name + description + translations ----
    results = await execute_query("""
        SELECT DISTINCT
            pc.id, pc.product_name, pc.pzn, pc.package_size,
            pc.description, pc.base_price_eur,
            COALESCE(inv.stock_quantity, 0) as stock_quantity,
            COALESCE(lst_name.translated_text, pc.product_name) as product_name_en,
            COALESCE(lst_desc.translated_text, pc.description) as description_en
        FROM product_catalog pc
        LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
        LEFT JOIN localized_strings ls_name ON ls_name.string_key = pc.product_name_i18n_key
            AND ls_name.namespace = 'product_export'
        LEFT JOIN localized_string_translations lst_name ON lst_name.localized_string_id = ls_name.id
            AND lst_name.language_code = 'en'
        LEFT JOIN localized_strings ls_desc ON ls_desc.string_key = pc.description_i18n_key
            AND ls_desc.namespace = 'product_export'
        LEFT JOIN localized_string_translations lst_desc ON lst_desc.localized_string_id = ls_desc.id
            AND lst_desc.language_code = 'en'
        WHERE LOWER(pc.product_name) LIKE ?
           OR LOWER(pc.description) LIKE ?
           OR LOWER(COALESCE(lst_name.translated_text, '')) LIKE ?
           OR LOWER(COALESCE(lst_desc.translated_text, '')) LIKE ?
    """, (f"%{indication_lower}%", f"%{indication_lower}%",
          f"%{indication_lower}%", f"%{indication_lower}%"))

    in_stock = [
        {
            "id": r['id'],
            "product_name": r['product_name'],
            "brand_name": r.get('product_name_en') or r['product_name'],
            "generic_name": r.get('product_name_en') or r['product_name'],
            "pzn": r['pzn'],
            "package_size": r['package_size'],
            "description": r.get('description_en') or r['description'],
            "price": r['base_price_eur'],
            "stock_quantity": r['stock_quantity'],
            "rx_required": False,
            "form": r['package_size'] or "unit",
            "dosage": r['package_size'] or "",
        }
        for r in results if (r['stock_quantity'] or 0) > 0
    ]

    if in_stock:
        return in_stock

    # ---- STRATEGY 3: Use vector search as final fallback ----
    if vector_search_fn:
        vector_results = await vector_search_fn(indication, 5)
        if vector_results:
            # Enrich with inventory
            enriched = []
            for c in vector_results:
                if 'stock_quantity' not in c or c.get('stock_quantity') is None:
                    inv = await execute_query(
                        "SELECT stock_quantity FROM inventory_items WHERE product_catalog_id = ?",
                        (c['id'],)
                    )
                    c['stock_quantity'] = inv[0]['stock_quantity'] if inv else 0
                if (c.get('stock_quantity') or 0) > 0:
                    enriched.append({
                        "id": c.get('id'),
                        "product_name": c.get('product_name', ''),
                        "brand_name": c.get('brand_name') or c.get('product_name', ''),
                        "generic_name": c.get('generic_name') or c.get('product_name', ''),
                        "pzn": c.get('pzn'),
                        "package_size": c.get('dosage', ''),
                        "description": "",
                        "price": c.get('price', 0),
                        "stock_quantity": c.get('stock_quantity', 0),
                        "rx_required": c.get('rx_required', False),
                        "form": c.get('form', 'unit'),
                        "dosage": c.get('dosage', ''),
                    })
            if enriched:
                return enriched[:5]

    return []


async def vector_search(name: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Search for products by name using fuzzy vector matching.
    Falls back to SQL LIKE search if no vector store is available.

    Args:
        name: Product name (German or English, or misspelling)
        top_k: Number of candidates to return

    Returns:
        List of candidate products with similarity scores
    """
    # Pre-clean the search query to remove filler words
    import re as _re
    clean_name = name.strip()
    for pattern in [
        r'^i\s+want\s+to\s+(order|get|buy)\s+',
        r'^i\s+need\s+to\s+(order|get|buy)\s+',
        r'^i\s+(need|want)\s+',
        r'^(can\s+i|could\s+i|please)\s+(get|have|order)\s+(me\s+)?',
        r'^(give|get|order|buy)\s+me\s+',
        r'^(to\s+)?(order|buy|get)\s+',
    ]:
        clean_name = _re.sub(pattern, '', clean_name, flags=_re.IGNORECASE).strip()
    # Strip trailing quantity+unit
    clean_name = _re.sub(
        r'\s+\d+\s*(strip|strips|tab|tabs|tablet|tablets|unit|units|pack|packs|bottle|bottles|capsule|capsules)\s*$',
        '', clean_name, flags=_re.IGNORECASE
    ).strip()
    clean_name = _re.sub(r'\s+\d+\s*$', '', clean_name).strip()
    clean_name = _re.sub(r'^(some|any|a|an|the|of)\s+', '', clean_name, flags=_re.IGNORECASE).strip()
    if not clean_name:
        clean_name = name.strip()

    # If vector search is available, use it
    if vector_search_fn:
        candidates = await vector_search_fn(clean_name, top_k)
    else:
        # SQL fallback - search product_catalog + translations
        name_lower = clean_name.lower()
        results = await execute_query("""
            SELECT DISTINCT
                pc.id, pc.product_name, pc.pzn, pc.package_size,
                pc.description, pc.base_price_eur,
                COALESCE(inv.stock_quantity, 0) as stock_quantity,
                COALESCE(lst_name.translated_text, pc.product_name) as product_name_en
            FROM product_catalog pc
            LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
            LEFT JOIN localized_strings ls_name ON ls_name.string_key = pc.product_name_i18n_key
                AND ls_name.namespace = 'product_export'
            LEFT JOIN localized_string_translations lst_name ON lst_name.localized_string_id = ls_name.id
                AND lst_name.language_code = 'en'
            WHERE LOWER(pc.product_name) LIKE ?
               OR LOWER(COALESCE(lst_name.translated_text, '')) LIKE ?
            LIMIT ?
        """, (f"%{name_lower}%", f"%{name_lower}%", top_k))

        candidates = [dict(r) for r in results] if results else []

    # Enrich with inventory data if not already present
    for candidate in candidates:
        if 'stock_quantity' not in candidate or candidate.get('stock_quantity') is None:
            inv = await execute_query(
                "SELECT stock_quantity FROM inventory_items WHERE product_catalog_id = ?",
                (candidate['id'],)
            )
            candidate['stock_quantity'] = inv[0]['stock_quantity'] if inv else 0

    # Normalize field names for compatibility with orchestrator
    normalized = []
    for c in candidates:
        normalized.append({
            "id": c.get('id'),
            "brand_name": c.get('product_name_en') or c.get('product_name') or c.get('brand_name', ''),
            "generic_name": c.get('product_name_en') or c.get('product_name') or c.get('generic_name', ''),
            "product_name": c.get('product_name', ''),
            "pzn": c.get('pzn'),
            "dosage": c.get('package_size') or c.get('dosage', ''),
            "form": c.get('package_size') or c.get('form', 'unit'),
            "unit_type": "unit",
            "price": c.get('base_price_eur') or c.get('price', 0),
            "rx_required": c.get('rx_required', False),
            "stock_quantity": c.get('stock_quantity', 0),
            "similarity": c.get('similarity', 0.8),
        })

    return normalized


async def get_inventory(med_id: int) -> Dict[str, Any]:
    """
    Get inventory information for a product.

    Args:
        med_id: Product catalog ID

    Returns:
        Inventory info with stock quantity
    """
    result = await execute_query("""
        SELECT pc.id, pc.product_name, pc.base_price_eur,
               COALESCE(inv.stock_quantity, 0) as stock_quantity
        FROM product_catalog pc
        LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
        WHERE pc.id = ?
    """, (med_id,))

    if not result:
        return {"error": "Product not found", "med_id": med_id}

    return {
        "med_id": result[0]['id'],
        "brand_name": result[0]['product_name'],
        "generic_name": result[0]['product_name'],
        "stock_quantity": result[0]['stock_quantity'],
        "in_stock": result[0]['stock_quantity'] > 0,
    }


async def get_rx_flag(med_id: int) -> Dict[str, Any]:
    """
    Check if a product requires prescription.
    V2 doesn't have rx_required per product — returns False by default.

    Args:
        med_id: Product catalog ID

    Returns:
        RX requirement info
    """
    result = await execute_query(
        "SELECT id, product_name FROM product_catalog WHERE id = ?",
        (med_id,)
    )

    if not result:
        return {"error": "Product not found", "med_id": med_id}

    return {
        "med_id": result[0]['id'],
        "brand_name": result[0]['product_name'],
        "rx_required": False,
    }


async def get_medication_details(med_id: int) -> Optional[Dict[str, Any]]:
    """
    Get full product details.

    Args:
        med_id: Product catalog ID

    Returns:
        Complete product info
    """
    result = await execute_query("""
        SELECT
            pc.*, COALESCE(inv.stock_quantity, 0) as stock_quantity
        FROM product_catalog pc
        LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
        WHERE pc.id = ?
    """, (med_id,))

    if not result:
        return None

    p = result[0]
    return {
        "id": p['id'],
        "generic_name": p['product_name'],
        "brand_name": p['product_name'],
        "product_name": p['product_name'],
        "active_ingredient": "",
        "dosage": p['package_size'] or "",
        "form": p['package_size'] or "unit",
        "unit_type": "unit",
        "rx_required": False,
        "notes": p['description'] or "",
        "price": p['base_price_eur'],
        "pzn": p['pzn'],
        "stock_quantity": p['stock_quantity'],
    }


async def get_tier1_alternatives(med_id: int) -> List[Dict[str, Any]]:
    """
    Get alternatives — products with similar names or in same price range.
    Since V2 has no active_ingredient column, we search by product name similarity.

    Args:
        med_id: Product catalog ID

    Returns:
        List of alternative products
    """
    prod = await execute_query(
        "SELECT product_name, base_price_eur FROM product_catalog WHERE id = ?",
        (med_id,)
    )

    if not prod:
        return []

    product_name = prod[0]['product_name']
    first_word = product_name.split()[0] if product_name else ""

    if not first_word or len(first_word) < 3:
        return []

    alternatives = await execute_query("""
        SELECT
            pc.id, pc.product_name, pc.package_size, pc.base_price_eur,
            COALESCE(inv.stock_quantity, 0) as stock_quantity
        FROM product_catalog pc
        LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
        WHERE pc.id != ?
          AND LOWER(pc.product_name) LIKE ?
          AND COALESCE(inv.stock_quantity, 0) > 0
    """, (med_id, f"%{first_word.lower()}%"))

    return [
        {
            "id": alt['id'],
            "generic_name": alt['product_name'],
            "brand_name": alt['product_name'],
            "dosage": alt['package_size'] or "",
            "form": alt['package_size'] or "unit",
            "rx_required": False,
            "stock_quantity": alt['stock_quantity'],
            "price": alt['base_price_eur'],
        }
        for alt in alternatives
    ]
