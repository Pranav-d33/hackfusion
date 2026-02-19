"""
Pinecone Vector Service
Cloud-hosted vector search with integrated embeddings.
Queries V2 schema: product_catalog + localized_string_translations.
"""
from typing import List, Dict, Any
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from pinecone import Pinecone
from db.database import execute_query

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX = os.getenv("PINECONE_INDEX", "mediloon")
EMBEDDING_MODEL = "llama-text-embed-v2"

pc = None
index = None


def init_pinecone():
    """Initialize Pinecone client and index."""
    global pc, index

    if not PINECONE_API_KEY:
        print("⚠️ PINECONE_API_KEY not set - vector search disabled")
        return False

    try:
        pc = Pinecone(api_key=PINECONE_API_KEY)

        if not pc.has_index(PINECONE_INDEX):
            pc.create_index_for_model(
                name=PINECONE_INDEX,
                cloud="aws",
                region="us-east-1",
                embed={
                    "model": EMBEDDING_MODEL,
                    "field_map": {"text": "content"}
                }
            )
            print(f"✅ Created Pinecone index with {EMBEDDING_MODEL}: {PINECONE_INDEX}")

        index = pc.Index(PINECONE_INDEX)
        print(f"✅ Pinecone initialized: {PINECONE_INDEX}")
        return True

    except Exception as e:
        print(f"❌ Pinecone init failed: {e}")
        return False


async def index_medications():
    """Index all products in Pinecone."""
    if not index:
        print("⚠️ Pinecone not initialized - skipping indexing")
        return

    products = await execute_query("""
        SELECT
            pc.id, pc.product_name, pc.pzn, pc.package_size,
            pc.description, pc.base_price_eur,
            COALESCE(lst_name.translated_text, pc.product_name) as product_name_en,
            COALESCE(lst_desc.translated_text, '') as description_en
        FROM product_catalog pc
        LEFT JOIN localized_strings ls_name ON ls_name.string_key = pc.product_name_i18n_key
            AND ls_name.namespace = 'product_export'
        LEFT JOIN localized_string_translations lst_name ON lst_name.localized_string_id = ls_name.id
            AND lst_name.language_code = 'en'
        LEFT JOIN localized_strings ls_desc ON ls_desc.string_key = pc.description_i18n_key
            AND ls_desc.namespace = 'product_export'
        LEFT JOIN localized_string_translations lst_desc ON lst_desc.localized_string_id = ls_desc.id
            AND lst_desc.language_code = 'en'
    """)

    if not products:
        print("No products to index")
        return

    print(f"Indexing {len(products)} products in Pinecone...")

    records = []
    for prod in products:
        text_content = f"{prod['product_name']} {prod.get('product_name_en', '')} {prod.get('description', '')} {prod.get('description_en', '')}"

        records.append({
            "_id": str(prod['id']),
            "text": text_content,
            "brand_name": prod.get('product_name_en') or prod['product_name'],
            "generic_name": prod.get('product_name_en') or prod['product_name'],
            "product_name": prod['product_name'],
            "dosage": prod['package_size'] or "",
            "rx_required": False,
            "pzn": str(prod['pzn'] or ""),
        })

    if records:
        index.upsert_records(namespace="medications", records=records)
        print(f"✅ Indexed {len(records)} products in Pinecone")


async def search_medications(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Search products by semantic similarity."""
    if not index:
        return await fallback_sql_search(query, top_k)

    try:
        results = index.search(
            namespace="medications",
            query={
                "top_k": top_k,
                "inputs": {"text": query}
            },
            fields=["brand_name", "generic_name", "product_name", "dosage", "rx_required", "pzn"]
        )

        products = []
        for hit in results.get('result', {}).get('hits', []):
            prod_id = int(hit['_id'])
            prod = await execute_query(
                """SELECT pc.*, COALESCE(inv.stock_quantity, 0) as stock_quantity
                   FROM product_catalog pc
                   LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
                   WHERE pc.id = ?""",
                (prod_id,)
            )
            if prod:
                p = dict(prod[0])
                products.append({
                    "id": p['id'],
                    "brand_name": p['product_name'],
                    "generic_name": p['product_name'],
                    "product_name": p['product_name'],
                    "dosage": p['package_size'] or "",
                    "form": p['package_size'] or "unit",
                    "pzn": p['pzn'],
                    "price": p['base_price_eur'],
                    "rx_required": False,
                    "stock_quantity": p['stock_quantity'],
                    "score": hit.get('_score', 0),
                    "similarity": hit.get('_score', 0),
                })

        return products

    except Exception as e:
        print(f"Pinecone search error: {e}")
        return await fallback_sql_search(query, top_k)


async def fallback_sql_search(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Fallback SQL-based search when Pinecone unavailable."""
    query_lower = query.lower()

    results = await execute_query("""
        SELECT DISTINCT
            pc.id, pc.product_name, pc.pzn, pc.package_size,
            pc.description, pc.base_price_eur,
            COALESCE(inv.stock_quantity, 0) as stock_quantity
        FROM product_catalog pc
        LEFT JOIN inventory_items inv ON pc.id = inv.product_catalog_id
        LEFT JOIN localized_strings ls_name ON ls_name.string_key = pc.product_name_i18n_key
            AND ls_name.namespace = 'product_export'
        LEFT JOIN localized_string_translations lst_name ON lst_name.localized_string_id = ls_name.id
            AND lst_name.language_code = 'en'
        WHERE
            LOWER(pc.product_name) LIKE ? OR
            LOWER(COALESCE(lst_name.translated_text, '')) LIKE ? OR
            LOWER(COALESCE(pc.description, '')) LIKE ?
        LIMIT ?
    """, (f"%{query_lower}%", f"%{query_lower}%", f"%{query_lower}%", top_k))

    return [
        {
            "id": r['id'],
            "brand_name": r['product_name'],
            "generic_name": r['product_name'],
            "product_name": r['product_name'],
            "dosage": r['package_size'] or "",
            "form": r['package_size'] or "unit",
            "pzn": r['pzn'],
            "price": r['base_price_eur'],
            "rx_required": False,
            "stock_quantity": r['stock_quantity'],
        }
        for r in results
    ] if results else []


if __name__ == "__main__":
    import asyncio

    async def test():
        init_pinecone()
        await index_medications()
        results = await search_medications("vitamin")
        print(f"Found {len(results)} results for 'vitamin'")
        for r in results:
            print(f"  - {r['brand_name']}")

    asyncio.run(test())
