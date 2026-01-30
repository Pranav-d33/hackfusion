"""
Pinecone Vector Service
Cloud-hosted vector search with integrated embeddings.
Uses Pinecone's hosted llama-text-embed-v2 model (FREE - 5M tokens).
"""
from typing import List, Dict, Any
import os
import sys
from pathlib import Path

# Load .env first
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from pinecone import Pinecone
from db.database import execute_query

# Config
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX = os.getenv("PINECONE_INDEX", "mediloon")
EMBEDDING_MODEL = "llama-text-embed-v2"  # Free Pinecone-hosted model

# Initialize client
pc = None
index = None


def init_pinecone():
    """Initialize Pinecone client and index with integrated embeddings."""
    global pc, index
    
    if not PINECONE_API_KEY:
        print("⚠️ PINECONE_API_KEY not set - vector search disabled")
        return False
    
    try:
        pc = Pinecone(api_key=PINECONE_API_KEY)
        
        # Check if index exists
        if not pc.has_index(PINECONE_INDEX):
            # Create index with integrated embedding model
            pc.create_index_for_model(
                name=PINECONE_INDEX,
                cloud="aws",
                region="us-east-1",
                embed={
                    "model": EMBEDDING_MODEL,
                    "field_map": {"text": "content"}  # Map 'content' field to text
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
    """Index all medications in Pinecone using integrated embeddings."""
    if not index:
        print("⚠️ Pinecone not initialized - skipping indexing")
        return
    
    # Get all medications
    medications = await execute_query("""
        SELECT 
            m.id, m.generic_name, m.brand_name, m.active_ingredient,
            m.dosage, m.form, m.rx_required, m.notes,
            GROUP_CONCAT(i.label, ', ') as indications
        FROM medications m
        LEFT JOIN medication_indications mi ON m.id = mi.medication_id
        LEFT JOIN indications i ON mi.indication_id = i.id
        GROUP BY m.id
    """)
    
    if not medications:
        print("No medications to index")
        return
    
    print(f"Indexing {len(medications)} medications in Pinecone...")
    
    # Prepare records for upsert with integrated embeddings
    records = []
    for med in medications:
        # Create rich text for embedding (mapped to 'text' field per field_map)
        text_content = f"{med['brand_name']} {med['generic_name']} {med['active_ingredient']} {med['dosage']} {med.get('indications', '')}"
        
        records.append({
            "_id": str(med['id']),
            "text": text_content,  # This field gets embedded automatically per field_map
            "brand_name": med['brand_name'],
            "generic_name": med['generic_name'],
            "dosage": med['dosage'],
            "rx_required": bool(med['rx_required']),
            "indications": med.get('indications', ''),
        })
    
    # Upsert to Pinecone (embeddings happen automatically on server)
    if records:
        index.upsert_records(namespace="medications", records=records)
        print(f"✅ Indexed {len(records)} medications in Pinecone")


async def search_medications(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Search medications by semantic similarity using integrated embeddings."""
    if not index:
        # Fallback to SQL search
        return await fallback_sql_search(query, top_k)
    
    try:
        # Search with integrated embeddings (query is embedded automatically)
        results = index.search(
            namespace="medications",
            query={
                "top_k": top_k,
                "inputs": {"text": query}
            },
            fields=["brand_name", "generic_name", "dosage", "rx_required", "indications"]
        )
        
        medications = []
        for hit in results.get('result', {}).get('hits', []):
            med_id = int(hit['_id'])
            # Get full medication details from DB
            med = await execute_query(
                "SELECT * FROM medications WHERE id = ?",
                (med_id,)
            )
            if med:
                med_dict = dict(med[0])
                med_dict['score'] = hit.get('_score', 0)
                medications.append(med_dict)
        
        return medications
        
    except Exception as e:
        print(f"Pinecone search error: {e}")
        return await fallback_sql_search(query, top_k)


async def fallback_sql_search(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Fallback SQL-based search when Pinecone unavailable."""
    query_lower = query.lower()
    
    # Search by brand name, generic name, or indication
    results = await execute_query("""
        SELECT DISTINCT m.* FROM medications m
        LEFT JOIN medication_indications mi ON m.id = mi.medication_id
        LEFT JOIN indications i ON mi.indication_id = i.id
        WHERE 
            LOWER(m.brand_name) LIKE ? OR
            LOWER(m.generic_name) LIKE ? OR
            LOWER(m.active_ingredient) LIKE ? OR
            LOWER(i.label) LIKE ?
        LIMIT ?
    """, (f"%{query_lower}%", f"%{query_lower}%", f"%{query_lower}%", f"%{query_lower}%", top_k))
    
    return [dict(row) for row in results] if results else []


# Test
if __name__ == "__main__":
    import asyncio
    
    async def test():
        init_pinecone()
        await index_medications()
        results = await search_medications("diabetes")
        print(f"Found {len(results)} results for 'diabetes'")
        for r in results:
            print(f"  - {r['brand_name']}")
    
    asyncio.run(test())
