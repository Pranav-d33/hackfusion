"""
OCR Service
Extracts text from prescription images and parses structured product data.
Uses Gemma 3 27B Vision (google/gemma-3-27b-it:free) via OpenRouter for OCR,
then an LLM to extract clean medicine names + dosages, followed by fuzzy DB matching.
Queries V2 schema: product_catalog.
"""
import sys
import re
import json
from typing import Dict, Any, List, Optional
from difflib import SequenceMatcher
import os

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import execute_query

import base64
import httpx
import asyncio
from config import (
    OPENROUTER_API_KEY,
    GROQ_API_KEY,
    GROQ_BASE_URL,
    GROQ_PRIMARY_MODEL,
    GROQ_FALLBACK_MODEL,
    NLU_MODEL,
    NLU_FALLBACK_MODELS,
)


def _normalize_name_for_compare(name: str) -> str:
    """Normalize medicine names for robust similarity checks."""
    if not name:
        return ""
    normalized = name.lower().strip()
    # Remove common dosage/package tokens so similarity compares the core name.
    normalized = re.sub(r"\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b", "", normalized)
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return normalized


def _is_aggressive_name_rewrite(extracted_name: str, original_ocr_name: str) -> bool:
    """
    Detect when LLM changed OCR name too aggressively (possible hallucination).
    Example: OCR 'goodra' -> extracted 'oxprenolol'.
    """
    a = _normalize_name_for_compare(extracted_name)
    b = _normalize_name_for_compare(original_ocr_name)

    if not a or not b or a == b:
        return False

    similarity = SequenceMatcher(None, a, b).ratio()
    prefix_len = min(3, len(a), len(b))
    same_prefix = prefix_len > 0 and a[:prefix_len] == b[:prefix_len]

    # If similarity is low and prefixes differ, this is likely an unsafe rewrite.
    return similarity < 0.6 and not same_prefix

async def extract_text_from_image(image_path: str, image_base64: str = None, mime_type: str = "image/jpeg") -> Dict[str, Any]:
    """Extract text from an image using Gemma 3 27B Vision via OpenRouter.
    
    Args:
        image_path: Path to the image file on disk.
        image_base64: Pre-encoded base64 image data (used when file may not exist on disk, e.g. Vercel).
        mime_type: MIME type of the image (used with image_base64).
    """
    # If we have inline base64 data, use it directly (no filesystem dependency)
    if image_base64:
        encoded_string = image_base64
        data_url = f"data:{mime_type};base64,{encoded_string}"
    elif not os.path.exists(image_path):
        if "mock_prescription" in image_path:
            return {
                "text": "Dr. Mueller\nRx:\n1. Vitamin D3\n2. Calcium 600mg\n3. Omega-3\n\nSign...",
                "structured_data": {
                    "medications": [
                        {"medicine_name": "Vitamin D3", "dosage": ""},
                        {"medicine_name": "Calcium", "dosage": "600mg"},
                        {"medicine_name": "Omega-3", "dosage": ""}
                    ],
                    "disease_or_illness": "Vitamin Deficiency"
                },
                "confidence": 0.99,
                "source": "mock"
            }
        return {"error": f"File not found: {image_path}"}
    else:
        try:
            print(f"📖 Reading image from disk for OCR: {image_path}")
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
            
            mt = "image/jpeg"
            if image_path.lower().endswith(".png"):
                mt = "image/png"
            data_url = f"data:{mt};base64,{encoded_string}"
        except Exception as e:
            return {"error": f"Failed to read file: {e}"}

    try:
        print(f"📖 Running OCR (Gemma 3 Vision) — source: {'base64-inline' if image_base64 else image_path}")
        
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "google/gemma-3-27b-it:free",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Extract all the text from this prescription image. Just return the text accurately, keeping the original layout or list items if possible. Do not include any conversational filler.\n\nPlease also structure the extracted information into a JSON format with the following keys:\n- `medications`: A list of objects with `-medicine_name` and `dosage`.\n- `disease_or_illness`: The identified condition or primary illness based on the prescription (can be null if not found).\n- `raw_text`: The exact text extracted from the image.\n\nPlease wrap the JSON object in a markdown code block (```json ... ```)."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url
                            }
                        }
                    ]
                }
            ]
        }
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            result_json = response.json()
            
            extracted_text = result_json["choices"][0]["message"]["content"].strip()
            
            # Simple heuristic to extract JSON block from thinking model output
            structured_data = None
            json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', extracted_text, re.DOTALL)
            
            if json_match:
                try:
                    structured_data = json.loads(json_match.group(1).strip())
                except json.JSONDecodeError as e:
                    print(f"❌ OCR Log: JSON Decoder error: {e}")
            else:
                 # Try to parse the entire text as JSON
                try:
                    structured_data = json.loads(extracted_text)
                except json.JSONDecodeError:
                    pass

            # fallback to returning just the extracted string text if json parse failed completely
            final_text = structured_data.get("raw_text", extracted_text) if structured_data else extracted_text

            return {
                "text": final_text,
                "structured_data": structured_data,
                "confidence": 0.95,
                "source": "gemma3-27b-vision-openrouter"
            }
            
    except Exception as e:
        print(f"❌ OCR Log: Error processing image with Gemma 3: {e}")
        return {"error": str(e)}


async def _llm_extract_medicines(raw_text: str, structured_data: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Send raw OCR text to LLM to extract ONLY medicine names + dosages.
    Filters out addresses, dates, doctor names, hospital info, etc.
    Returns: {"medications": [{"name": ..., "dosage": ...}], "disease": ...}
    """
    # Build context from both raw text and any structured data from OCR
    structured_hint = ""
    if structured_data and "medications" in structured_data:
        med_names = [m.get("medicine_name", "") for m in structured_data["medications"] if m.get("medicine_name")]
        if med_names:
            structured_hint = f"\nThe OCR vision model also tentatively extracted these names: {', '.join(med_names)}"

    prompt = f"""You are a pharmacist assistant. Given raw text extracted from a prescription image, extract ONLY the medicine/drug names and their dosages.

RULES:
- Extract ONLY medicine/drug names. Ignore addresses, dates, doctor names, hospital names, patient info, signatures.
- For each medicine, extract the name and dosage (if present). If dosage is not mentioned, leave it empty.
- Keep the medicine name as written in OCR. Do NOT invent or substitute a different drug name.
- If uncertain about a word, keep the raw OCR token and put that same value in both "name" and "original_ocr_name".
- You may normalize only trivial formatting (spacing/case/hyphen), not the underlying drug identity.
- Return ONLY valid JSON. No extra text.
{structured_hint}

RAW PRESCRIPTION TEXT:
\"\"\"
{raw_text}
\"\"\"

Return JSON in this exact format:
{{
  "medications": [
    {{"name": "Medicine Name", "dosage": "dosage if found", "original_ocr_name": "name as it appeared in OCR"}},
  ],
  "disease_or_illness": "condition if identifiable, else null"
}}"""

    # Try Groq first (fast), then OpenRouter fallback
    llm_configs = []
    if GROQ_API_KEY:
        llm_configs.append({
            "url": f"{GROQ_BASE_URL}/chat/completions",
            "headers": {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            "model": GROQ_PRIMARY_MODEL,
            "provider": "groq",
        })
        llm_configs.append({
            "url": f"{GROQ_BASE_URL}/chat/completions",
            "headers": {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            "model": GROQ_FALLBACK_MODEL,
            "provider": "groq",
        })
    if OPENROUTER_API_KEY:
        for model_name in [NLU_MODEL] + NLU_FALLBACK_MODELS:
            if not model_name:
                continue
            llm_configs.append({
                "url": "https://openrouter.ai/api/v1/chat/completions",
                "headers": {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                "model": model_name,
                "provider": "openrouter",
            })

    retry_count_429 = 0
    max_429_retries = 3
    
    for idx, cfg in enumerate(llm_configs):
        try:
            # Add exponential backoff delay for OpenRouter to avoid rate limits
            if cfg["provider"] == "openrouter" and idx > 0:
                delay = min(2 ** retry_count_429, 8)  # Max 8 seconds delay
                print(f"⏳ Rate limit protection: waiting {delay}s before next OpenRouter request...")
                await asyncio.sleep(delay)
            
            payload = {
                "model": cfg["model"],
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 1024,
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(cfg["url"], headers=cfg["headers"], json=payload)
                if resp.status_code == 429:
                    retry_count_429 += 1
                    if retry_count_429 <= max_429_retries and cfg["provider"] == "openrouter":
                        # Exponential backoff for rate limiting
                        backoff_delay = min(2 ** retry_count_429, 16)
                        print(f"⚠️ OCR LLM extraction: 429 from {cfg['model']}, retrying after {backoff_delay}s (attempt {retry_count_429}/{max_429_retries})...")
                        await asyncio.sleep(backoff_delay)
                        # Retry this same model once more
                        resp = await client.post(cfg["url"], headers=cfg["headers"], json=payload)
                        if resp.status_code == 429:
                            print(f"⚠️ OCR LLM extraction: 429 again from {cfg['model']}, trying next model...")
                            continue
                    else:
                        print(f"⚠️ OCR LLM extraction: 429 from {cfg['model']}, trying next...")
                        continue
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"].strip()

                # Parse JSON from response (may be wrapped in ```json ... ```)
                json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group(1).strip())
                else:
                    parsed = json.loads(content)

                print(f"✅ OCR LLM extraction via {cfg['model']}: {len(parsed.get('medications', []))} medicines found")
                return parsed

        except Exception as e:
            print(f"⚠️ OCR LLM extraction failed ({cfg['model']}): {e}")
            continue

    # If all LLMs fail, return structured_data as-is
    print("⚠️ All LLM extraction attempts failed, using raw structured data")
    meds = []
    if structured_data and "medications" in structured_data:
        for m in structured_data["medications"]:
            meds.append({
                "name": m.get("medicine_name", ""),
                "dosage": m.get("dosage", ""),
                "original_ocr_name": m.get("medicine_name", ""),
            })
    return {
        "medications": meds,
        "disease_or_illness": structured_data.get("disease_or_illness") if structured_data else None,
    }


def _fuzzy_match_product(medicine_name: str, product_index: Dict[str, Dict], threshold: float = 0.7) -> Optional[Dict]:
    """
    Fuzzy-match a medicine name against the product index.
    Uses SequenceMatcher for similarity scoring.
    Returns the best-matching product if score >= threshold, else None.
    """
    med_lower = medicine_name.lower().strip()
    if not med_lower or len(med_lower) < 2:
        return None

    # 1) Exact match
    if med_lower in product_index:
        return product_index[med_lower]

    # 2) Strict substring containment (guards against false positives)
    if len(med_lower) >= 5:
        for pname, prod in product_index.items():
            if med_lower in pname or pname in med_lower:
                sim = SequenceMatcher(None, med_lower, pname).ratio()
                # Require strong lexical closeness for containment matches.
                if sim < 0.8:
                    continue
                return prod

    # 3) Fuzzy ratio scoring
    best_score = 0.0
    best_product = None
    for pname, prod in product_index.items():
        # Skip very short catalog names to avoid false positives
        if len(pname) < 3:
            continue
        score = SequenceMatcher(None, med_lower, pname).ratio()
        # Also check if medicine name starts with the same prefix (common for drug names)
        prefix_len = min(4, len(med_lower), len(pname))
        prefix_bonus = 0.1 if med_lower[:prefix_len] == pname[:prefix_len] else 0.0
        length_ratio = min(len(med_lower), len(pname)) / max(len(med_lower), len(pname))
        total = score + prefix_bonus + (0.05 if length_ratio >= 0.8 else 0.0)
        if total > best_score:
            best_score = total
            best_product = prod

    if best_score >= threshold and best_product:
        print(f"  🔍 Fuzzy matched '{medicine_name}' → '{best_product['product_name']}' (score: {best_score:.2f})")
        return best_product

    return None


async def parse_prescription_text(ocr_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse extracted text to find known products.
    
    Pipeline:
      1. Send raw OCR text to LLM → extract clean medicine names + dosages
      2. Fuzzy-match each medicine against the product_catalog DB
      3. Return structured results with matched and unmatched items

    Args:
        ocr_result: Full dictionary from OCR service

    Returns:
        Structured data: {"medications": [...], "unknown_items": [...]}
    """
    text = ocr_result.get("text", "")
    structured_data = ocr_result.get("structured_data")

    # ── Step 1: LLM-based extraction ──────────────────────────────
    llm_extracted = await _llm_extract_medicines(text, structured_data)
    llm_meds = llm_extracted.get("medications", [])
    disease_or_illness = llm_extracted.get("disease_or_illness")

    # Fallback disease from structured_data if LLM didn't find one
    if not disease_or_illness and structured_data:
        disease_or_illness = structured_data.get("disease_or_illness")

    # ── Step 2: Build product index from DB ───────────────────────
    all_products = await execute_query("""
        SELECT pc.id, pc.product_name, pc.package_size, pc.base_price_eur,
               COALESCE(lst.translated_text, pc.product_name) as product_name_en
        FROM product_catalog pc
        LEFT JOIN localized_strings ls ON ls.string_key = pc.product_name_i18n_key
            AND ls.namespace = 'product_export'
        LEFT JOIN localized_string_translations lst ON lst.localized_string_id = ls.id
            AND lst.language_code = 'en'
    """)

    product_index = {}  # lowered name -> product row
    for prod in all_products:
        name_de = prod['product_name'].lower().strip()
        name_en = (prod.get('product_name_en') or '').lower().strip()
        if name_de and len(name_de) >= 3:
            product_index[name_de] = prod
        if name_en and len(name_en) >= 3 and name_en != name_de:
            product_index[name_en] = prod

    # ── Step 3: Fuzzy-match each LLM-extracted medicine ───────────
    found_products = []
    unknown_items = []
    matched_ids = set()

    for med in llm_meds:
        med_name = (med.get("name") or "").strip()
        med_dosage = (med.get("dosage") or "").strip()
        original_name = (med.get("original_ocr_name") or med_name).strip()

        if not med_name or len(med_name) < 2:
            continue

        effective_name = med_name
        if original_name and _is_aggressive_name_rewrite(med_name, original_name):
            print(f"  ⚠️ Rejecting aggressive OCR rename '{med_name}' (original: '{original_name}')")
            effective_name = original_name

        match = _fuzzy_match_product(effective_name, product_index)

        if match and match['id'] not in matched_ids:
            matched_ids.add(match['id'])
            found_products.append({
                "medication_id": match['id'],
                "brand_name": match['product_name'],
                "generic_name": match.get('product_name_en') or match['product_name'],
                "dosage": med_dosage or match['package_size'] or "",
                "confidence": 0.95,
                "match_type": "llm_fuzzy_match",
                "searched_name": effective_name,
                "original_ocr_name": original_name,
            })
        elif not match:
            unknown_items.append({
                "name": effective_name,
                "dosage": med_dosage,
                "original_ocr_name": original_name,
            })

    # Cap to a realistic prescription size
    found_products = found_products[:10]

    return {
        "text": text,
        "medications": found_products,
        "disease_or_illness": disease_or_illness,
        "unknown_items": unknown_items,
        "llm_extracted_count": len(llm_meds),
        "requires_review": len(unknown_items) > 0 or len(found_products) == 0
    }
