"""
Chroma Vector Store Service
Handles product text-based similarity search.
Uses basic text matching as fallback when embeddings aren't available.
Queries V2 schema: product_catalog + localized_string_translations.
"""
try:
    import chromadb
    from chromadb.config import Settings
except ImportError:
    chromadb = None
from typing import List, Dict, Any
import sys
import re
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from config import CHROMA_PATH, VECTOR_TOP_K, SIMILARITY_THRESHOLD
from db.database import execute_query

# In-memory product index for text search
_product_index = {}
_initialized = False


async def _build_index():
    """Build in-memory product index for text search."""
    global _product_index, _initialized

    if _initialized:
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

    for prod in products:
        prod_id = prod['id']
        search_terms = [
            prod['product_name'].lower(),
        ]
        en_name = prod.get('product_name_en') or ''
        if en_name and en_name.lower() != prod['product_name'].lower():
            search_terms.append(en_name.lower())
        desc = prod.get('description') or ''
        desc_en = prod.get('description_en') or ''
        if desc:
            search_terms.append(desc.lower())
        if desc_en and desc_en.lower() != desc.lower():
            search_terms.append(desc_en.lower())

        _product_index[prod_id] = {
            "id": prod_id,
            "product_name": prod['product_name'],
            "brand_name": en_name or prod['product_name'],
            "generic_name": en_name or prod['product_name'],
            "dosage": prod['package_size'] or "",
            "form": prod['package_size'] or "unit",
            "pzn": prod['pzn'],
            "price": prod['base_price_eur'],
            "rx_required": False,
            "search_terms": search_terms,
        }

    _initialized = True
    print(f"✅ Indexed {len(_product_index)} products for text search")


def _levenshtein_ratio(s1: str, s2: str) -> float:
    """Calculate Levenshtein similarity ratio."""
    from difflib import SequenceMatcher
    return SequenceMatcher(None, s1, s2).ratio()


def _phonetic_normalize(text: str) -> str:
    """Normalize text for phonetic matching."""
    text = text.lower().strip()
    replacements = [
        ('ph', 'f'),
        ('ck', 'k'),
        ('x', 'ks'),
        ('ce', 'se'),
        ('ci', 'si'),
        ('oe', 'o'),
        ('ae', 'e'),
        ('ü', 'u'),
        ('ö', 'o'),
        ('ä', 'a'),
        ('ß', 'ss'),
        ('ii', 'i'),
        ('ee', 'i'),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def _calculate_similarity(query: str, terms: List[str]) -> float:
    """Calculate text similarity score between query and terms."""
    query = query.lower().strip()
    query_normalized = _phonetic_normalize(query)

    best_score = 0.0

    for term in terms:
        term_lower = term.lower()
        term_normalized = _phonetic_normalize(term_lower)

        if query == term_lower:
            return 1.0
        if query_normalized == term_normalized:
            return 0.98
        if term_lower.startswith(query) or query.startswith(term_lower):
            best_score = max(best_score, 0.9)
            continue
        if query in term_lower or term_lower in query:
            best_score = max(best_score, 0.85)
            continue

        # Multi-word overlap: count how many query words appear in the term
        query_words = set(query.split())
        term_words = set(term_lower.split())
        if query_words and term_words and len(query_words) > 1:
            common_words = query_words & term_words
            if common_words:
                # Weighted by how much of the query is covered
                coverage = len(common_words) / len(query_words)
                if coverage >= 0.6:
                    best_score = max(best_score, 0.7 + coverage * 0.25)
                    continue

        lev_score = _levenshtein_ratio(query, term_lower)
        if lev_score >= 0.7:
            best_score = max(best_score, lev_score * 0.85)

        phonetic_lev = _levenshtein_ratio(query_normalized, term_normalized)
        if phonetic_lev >= 0.65:
            best_score = max(best_score, phonetic_lev * 0.8)

        # Per-word Levenshtein: check if query is close to any individual word in the term
        # Catches misspellings like "paracetamoll" vs "paracetamol"
        for tw in term_words:
            if len(tw) < 3:
                continue
            word_lev = _levenshtein_ratio(query, tw)
            if word_lev >= 0.8:
                best_score = max(best_score, word_lev * 0.85)
            word_phon = _levenshtein_ratio(query_normalized, _phonetic_normalize(tw))
            if word_phon >= 0.75:
                best_score = max(best_score, word_phon * 0.8)

        # Single-word overlap (original logic)
        if query_words and term_words:
            common_words = query_words & term_words
            if common_words:
                word_score = len(common_words) / max(len(query_words), len(term_words))
                best_score = max(best_score, word_score * 0.7)

    return best_score


async def index_medications():
    """Index all products for text search."""
    global _initialized
    _initialized = False
    await _build_index()
    return len(_product_index)


async def vector_search(query: str, top_k: int = VECTOR_TOP_K) -> List[Dict[str, Any]]:
    """
    Search for products by name using text similarity.

    Args:
        query: Search query (product name in German or English)
        top_k: Number of results to return

    Returns:
        List of candidates with similarity scores
    """
    await _build_index()

    if not query or not query.strip():
        return []

    # Pre-clean the query: strip filler words, quantities, units
    cleaned_query = _clean_search_query(query)

    results = []
    for prod_id, prod in _product_index.items():
        similarity = _calculate_similarity(cleaned_query, prod['search_terms'])
        if similarity >= SIMILARITY_THRESHOLD:
            results.append({
                **prod,
                "similarity": round(similarity, 3),
            })

    # If no results with cleaned query, try individual significant words
    if not results and ' ' in cleaned_query:
        word_results = _word_level_search(cleaned_query, top_k)
        if word_results:
            results = word_results

    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]


def _clean_search_query(query: str) -> str:
    """
    Pre-clean a search query by removing filler words, quantities, and units.
    Ensures the similarity engine gets just the meaningful medicine/product name.
    """
    cleaned = query.strip()

    # Remove leading order-intent phrases
    filler_prefixes = [
        r'^i\s+want\s+to\s+(order|get|buy)\s+',
        r'^i\s+need\s+to\s+(order|get|buy)\s+',
        r'^i\s+(need|want)\s+',
        r'^(can\s+i|could\s+i|please)\s+(get|have|order)\s+(me\s+)?',
        r'^(give|get|order|buy)\s+me\s+',
        r'^(to\s+)?(order|buy|get)\s+',
    ]
    for pattern in filler_prefixes:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE).strip()

    # Remove trailing quantity + unit
    cleaned = re.sub(
        r'\s+\d+\s*(strip|strips|tab|tabs|tablet|tablets|cap|caps|capsule|capsules|'
        r'bottle|bottles|pack|packs|box|boxes|sachet|sachets|vial|vials|'
        r'ampule|ampules|unit|units|pieces?|nos?|numbers?)\s*$',
        '', cleaned, flags=re.IGNORECASE
    ).strip()

    # Remove standalone trailing numbers (e.g., "Aveeno 100")
    cleaned = re.sub(r'\s+\d+\s*$', '', cleaned).strip()

    # Remove leading/trailing "some", "any", "a", "an", "the"
    cleaned = re.sub(r'^(some|any|a|an|the|of)\s+', '', cleaned, flags=re.IGNORECASE).strip()

    return cleaned if cleaned else query.strip()


def _word_level_search(query: str, top_k: int) -> List[Dict[str, Any]]:
    """
    Fallback: search using individual significant words from the query.
    Returns products that match at least one significant word well.
    """
    stop_words = {
        'i', 'want', 'need', 'to', 'order', 'buy', 'get', 'me', 'please',
        'can', 'some', 'any', 'a', 'an', 'the', 'of', 'for', 'have',
        'do', 'you', 'give', 'medicine', 'medication', 'tablet', 'mg',
    }
    words = [w for w in query.lower().split() if w not in stop_words and len(w) >= 3]

    if not words:
        return []

    results = {}
    for word in words:
        for prod_id, prod in _product_index.items():
            sim = _calculate_similarity(word, prod['search_terms'])
            if sim >= 0.5:  # Lower threshold for individual words
                if prod_id not in results or sim > results[prod_id]['similarity']:
                    results[prod_id] = {**prod, "similarity": round(sim * 0.85, 3)}

    return sorted(results.values(), key=lambda x: x['similarity'], reverse=True)[:top_k]


async def reindex():
    """Force reindex all products."""
    return await index_medications()


if __name__ == "__main__":
    import asyncio

    async def test():
        await index_medications()
        test_queries = ["vitamin", "calcium", "omega"]
        for q in test_queries:
            results = await vector_search(q)
            print(f"\nQuery: '{q}'")
            for r in results:
                print(f"  - {r['brand_name']} - score: {r['similarity']}")

    asyncio.run(test())
