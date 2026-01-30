"""
Chroma Vector Store Service
Handles medication text-based similarity search.
Uses basic text matching as fallback when embeddings aren't available.
"""
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any
import sys
import re
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from config import CHROMA_PATH, VECTOR_TOP_K, SIMILARITY_THRESHOLD
from db.database import execute_query

# In-memory medication index for text search
_medication_index = {}
_initialized = False


async def _build_index():
    """Build in-memory medication index for text search."""
    global _medication_index, _initialized
    
    if _initialized:
        return
    
    # Get all medications with synonyms
    medications = await execute_query("""
        SELECT 
            m.id, m.generic_name, m.brand_name, m.active_ingredient,
            m.dosage, m.form, m.rx_required
        FROM medications m
    """)
    
    synonyms = await execute_query("SELECT medication_id, synonym FROM synonyms")
    
    # Build synonym map
    synonym_map = {}
    for syn in synonyms:
        med_id = syn['medication_id']
        if med_id not in synonym_map:
            synonym_map[med_id] = []
        synonym_map[med_id].append(syn['synonym'].lower())
    
    # Build index
    for med in medications:
        med_id = med['id']
        search_terms = [
            med['generic_name'].lower(),
            med['brand_name'].lower(),
            med['active_ingredient'].lower(),
        ]
        search_terms.extend(synonym_map.get(med_id, []))
        
        _medication_index[med_id] = {
            "id": med_id,
            "generic_name": med['generic_name'],
            "brand_name": med['brand_name'],
            "dosage": med['dosage'],
            "form": med['form'],
            "rx_required": bool(med['rx_required']),
            "search_terms": search_terms,
        }
    
    _initialized = True
    print(f"✅ Indexed {len(_medication_index)} medications for text search")


def _levenshtein_ratio(s1: str, s2: str) -> float:
    """Calculate Levenshtein similarity ratio using SequenceMatcher."""
    from difflib import SequenceMatcher
    return SequenceMatcher(None, s1, s2).ratio()


def _phonetic_normalize(text: str) -> str:
    """Normalize text for phonetic matching (handle common voice transcription errors)."""
    text = text.lower().strip()
    # Common phonetic substitutions for Indian medicine names
    replacements = [
        ('ph', 'f'),
        ('ck', 'k'),
        ('x', 'ks'),
        ('ce', 'se'),
        ('ci', 'si'),
        ('oe', 'o'),
        ('ae', 'e'),
        ('ii', 'i'),
        ('ee', 'i'),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def _calculate_similarity(query: str, terms: List[str]) -> float:
    """Calculate text similarity score between query and terms using multiple strategies."""
    query = query.lower().strip()
    query_normalized = _phonetic_normalize(query)
    
    best_score = 0.0
    
    for term in terms:
        term_lower = term.lower()
        term_normalized = _phonetic_normalize(term_lower)
        
        # Strategy 1: Exact match
        if query == term_lower:
            return 1.0
        
        # Strategy 2: Normalized phonetic match
        if query_normalized == term_normalized:
            return 0.98
        
        # Strategy 3: Starts with match
        if term_lower.startswith(query) or query.startswith(term_lower):
            best_score = max(best_score, 0.9)
            continue
        
        # Strategy 4: Contains match
        if query in term_lower or term_lower in query:
            best_score = max(best_score, 0.8)
            continue
        
        # Strategy 5: Levenshtein similarity (handles typos like "glcoemet" -> "glycomet")
        lev_score = _levenshtein_ratio(query, term_lower)
        if lev_score >= 0.7:
            best_score = max(best_score, lev_score * 0.85)
        
        # Strategy 6: Phonetic Levenshtein (even more forgiving)
        phonetic_lev = _levenshtein_ratio(query_normalized, term_normalized)
        if phonetic_lev >= 0.65:
            best_score = max(best_score, phonetic_lev * 0.8)
        
        # Strategy 7: Word overlap for multi-word queries
        query_words = set(query.split())
        term_words = set(term_lower.split())
        if query_words and term_words:
            common_words = query_words & term_words
            if common_words:
                word_score = len(common_words) / max(len(query_words), len(term_words))
                best_score = max(best_score, word_score * 0.7)
    
    return best_score


async def index_medications():
    """Index all medications for text search."""
    global _initialized
    _initialized = False
    await _build_index()
    return len(_medication_index)


async def vector_search(query: str, top_k: int = VECTOR_TOP_K) -> List[Dict[str, Any]]:
    """
    Search for medications by name using text similarity.
    
    Args:
        query: Search query (brand name, generic name, etc.)
        top_k: Number of results to return
    
    Returns:
        List of candidates with similarity scores
    """
    await _build_index()
    
    if not query or not query.strip():
        return []
    
    # Calculate similarity for each medication
    results = []
    for med_id, med in _medication_index.items():
        similarity = _calculate_similarity(query, med['search_terms'])
        if similarity >= SIMILARITY_THRESHOLD:
            results.append({
                **med,
                "similarity": round(similarity, 3),
            })
    
    # Sort by similarity descending
    results.sort(key=lambda x: x['similarity'], reverse=True)
    
    return results[:top_k]


async def reindex():
    """Force reindex all medications."""
    return await index_medications()


# Test function
if __name__ == "__main__":
    import asyncio
    
    async def test():
        # Index medications
        await index_medications()
        
        # Test searches
        test_queries = ["glycomet", "metformin", "crocin", "sugar"]
        for q in test_queries:
            results = await vector_search(q)
            print(f"\nQuery: '{q}'")
            for r in results:
                print(f"  - {r['brand_name']} ({r['generic_name']}) - score: {r['similarity']}")
    
    asyncio.run(test())
