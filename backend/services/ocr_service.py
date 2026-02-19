"""
OCR Service
Extracts text from prescription images and parses structured product data.
Uses Tesseract OCR (if available) or Mock for demo.
Queries V2 schema: product_catalog.
"""
import sys
import re
from typing import Dict, Any, List, Optional
import os

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query

try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


async def extract_text_from_image(image_path: str) -> Dict[str, Any]:
    """Extract text from an image using OCR."""
    if not os.path.exists(image_path):
        if "mock_prescription" in image_path:
            return {
                "text": "Dr. Mueller\nRx:\n1. Vitamin D3\n2. Calcium 600mg\n3. Omega-3\n\nSign...",
                "confidence": 0.99,
                "source": "mock"
            }
        return {"error": "File not found"}

    if not TESSERACT_AVAILABLE:
        return {
            "text": "MOCK OCR OUTPUT: Tesseract missing.\nContains: Vitamin D3, Calcium",
            "confidence": 0.5,
            "source": "mock_fallback"
        }

    try:
        import shutil
        if not shutil.which("tesseract"):
            return {
                "text": "MOCK OCR OUTPUT: Tesseract binary missing.\nContains: Vitamin D3, Calcium",
                "confidence": 0.5,
                "source": "mock_fallback_no_binary"
            }

        print(f"📖 Reading image: {image_path}")
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        return {
            "text": text,
            "confidence": 0.85,
            "source": "tesseract"
        }
    except Exception as e:
        print(f"❌ OCR Log: Error processing image: {e}")
        return {"error": str(e)}


async def parse_prescription_text(text: str) -> Dict[str, Any]:
    """
    Parse extracted text to find known products.

    Args:
        text: Raw text from OCR

    Returns:
        Structured data: {"medications": [...], "unknown_items": [...]}
    """
    text = text.lower()
    found_products = []
    unknown_items = []

    # Get all known products from DB
    all_products = await execute_query("""
        SELECT pc.id, pc.product_name, pc.package_size, pc.base_price_eur,
               COALESCE(lst.translated_text, pc.product_name) as product_name_en
        FROM product_catalog pc
        LEFT JOIN localized_strings ls ON ls.string_key = pc.product_name_i18n_key
            AND ls.namespace = 'product_export'
        LEFT JOIN localized_string_translations lst ON lst.localized_string_id = ls.id
            AND lst.language_code = 'en'
    """)

    for prod in all_products:
        name_de = prod['product_name'].lower()
        name_en = (prod.get('product_name_en') or '').lower()
        if name_de in text or (name_en and name_en in text):
            found_products.append({
                "medication_id": prod['id'],
                "brand_name": prod['product_name'],
                "generic_name": prod.get('product_name_en') or prod['product_name'],
                "dosage": prod['package_size'] or "",
                "confidence": 0.9,
                "match_type": "exact_name"
            })

    # Simple line processing for unmatched items
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line or len(line) < 3:
            continue
        if re.match(r'^\d+\.', line):
            content = re.sub(r'^\d+\.\s*', '', line).strip()
            already_found = any(
                m['brand_name'].lower() in content.lower()
                for m in found_products
            )
            if not already_found:
                unknown_items.append(content)

    return {
        "text": text,
        "medications": found_products,
        "unknown_items": unknown_items,
        "requires_review": len(unknown_items) > 0 or len(found_products) == 0
    }
