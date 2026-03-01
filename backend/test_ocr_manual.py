import asyncio
from services.ocr_service import extract_text_from_image, parse_prescription_text

async def run_test():
    image_path = "mock_prescription.jpg"
    result = await extract_text_from_image(image_path)
    if "error" in result:
        print("ERROR:", result["error"])
        return
    print("EXTRACTED TEXT:\n", result.get('text'))
    print("\nSTRUCTURED DATA:\n", result.get('structured_data'))
    parsed = await parse_prescription_text(result)
    print("\nPARSED RESULT:\n", parsed)

if __name__ == "__main__":
    asyncio.run(run_test())
