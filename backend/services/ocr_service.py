"""
OCR Service
Extracts text from prescription images and parses structured medication data.
Uses Tesseract OCR (if available) or Mock for demo.
"""
import sys
import re
from typing import Dict, Any, List, Optional
import os

# Add backend to path
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query

# Try importing pytesseract
try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


async def extract_text_from_image(image_path: str) -> Dict[str, Any]:
    """
    Extract text from an image using OCR.
    
    Args:
        image_path: Path to the image file
    
    Returns:
        Dict containing 'text' and 'confidence' (or 'error')
    """
    if not os.path.exists(image_path):
        # Demo fallback: If file doesn't exist, check if it's a "mock" path
        if "mock_prescription" in image_path:
            return {
                "text": "Dr. Smith\nRx:\n1. Glycomet 500mg\n2. Dolo 650\n3. Azithromycin 500mg\n\nSign...",
                "confidence": 0.99,
                "source": "mock"
            }
        return {"error": "File not found"}

    if not TESSERACT_AVAILABLE:
        print("⚠️ Tesseract not installed/importable. Using Mock OCR.")
        return {
            "text": "MOCK OCR OUTPUT: Tesseract missing.\nContains: Glycomet, Pan 40",
            "confidence": 0.5,
            "source": "mock_fallback"
        }

    try:
        # Check if tesseract binary is actually installed
        import shutil
        if not shutil.which("tesseract"):
             return {
                "text": "MOCK OCR OUTPUT: Tesseract binary missing.\nContains: Glycomet, Pan 40",
                "confidence": 0.5,
                "source": "mock_fallback_no_binary"
            }
            
        print(f"📖 Reading image: {image_path}")
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        return {
            "text": text,
            "confidence": 0.85, # Tesseract doesn't give global conf easily, approximating
            "source": "tesseract"
        }
    except Exception as e:
        print(f"❌ OCR Log: Error processing image: {e}")
        return {"error": str(e)}


async def parse_prescription_text(text: str) -> Dict[str, Any]:
    """
    Parse extracted text to find known medications.
    
    Args:
        text: Raw text from OCR
    
    Returns:
        Structured data: {"medications": [...], "unknown_items": [...]}
    """
    text = text.lower()
    found_medications = []
    unknown_items = []
    
    # Get all known medicines from DB (brand names)
    all_meds = await execute_query("SELECT id, brand_name, generic_name, dosage FROM medications")
    
    # 1. Direct Fuzzy Match
    # We iterate through our catalog and check if brand names appear in text
    for med in all_meds:
        brand = med['brand_name'].lower()
        if brand in text:
            found_medications.append({
                "medication_id": med['id'],
                "brand_name": med['brand_name'],
                "generic_name": med['generic_name'],
                "dosage": med['dosage'],
                "confidence": 0.9,
                "match_type": "exact_brand"
            })
            continue

    # 2. Simple Line Processing (if no brands found, try to guess lines)
    # This is rudimentary; a real system would use NER or stronger parsing
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line or len(line) < 3: 
            continue
            
        # Heuristic: Lines starting with numbers "1. Medicine"
        if re.match(r'^\d+\.', line):
            # Clean line
            content = re.sub(r'^\d+\.\s*', '', line).strip()
            # Check if we already found this
            already_found = False
            for m in found_medications:
                if m['brand_name'].lower() in content.lower():
                    already_found = True
                    break
            if not already_found:
                 unknown_items.append(content)

    return {
        "text": text,
        "medications": found_medications,
        "unknown_items": unknown_items,
        "requires_review": len(unknown_items) > 0 or len(found_medications) == 0
    }
