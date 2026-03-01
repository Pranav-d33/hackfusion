import os
import glob
import base64
import httpx
import asyncio
from dotenv import load_dotenv

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

try:
    from bytez import Bytez
except ImportError:
    Bytez = None
    print("WARNING: bytez not installed. Bytez model will fail.")


async def test_qwen(model_name: str, image_path: str):
    print(f"\n--- Testing {model_name} on {os.path.basename(image_path)} ---")
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
    
    mime_type = "image/jpeg"
    if image_path.lower().endswith(".png"):
        mime_type = "image/png"
        
    data_url = f"data:{mime_type};base64,{encoded_string}"
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract all the text from this prescription image. Just return the text accurately, keeping the original layout or list items if possible. Do not include any conversational filler."
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
    
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            result_json = response.json()
            
            extracted_text = result_json["choices"][0]["message"]["content"].strip()
            print("RESULT:\n", extracted_text)
        except Exception as e:
            print(f"Error testing {model_name}: {repr(e)}")
            if 'response' in locals() and hasattr(response, 'text'):
                print("Response detail:", response.text)

def test_bytez(image_path: str):
    print(f"\n--- Testing microsoft/trocr-large-handwritten (Bytez) on {os.path.basename(image_path)} ---")
    if not Bytez:
        print("Bytez SDK not available.")
        return
        
    key = "7ac02882c6bf3d4863d427a2c4b416ab"
    sdk = Bytez(key)
    
    model = sdk.model("microsoft/trocr-large-handwritten")
    
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
    mime_type = "image/jpeg"
    if image_path.lower().endswith(".png"):
        mime_type = "image/png"
    data_url = f"data:{mime_type};base64,{encoded_string}"
    
    try:
        results = model.run(data_url)
        print("RESULT:")
        print({ "error": results.error, "output": results.output })
    except Exception as e:
        print(f"Error testing bytez: {e}")

async def main():
    images = glob.glob("uploads/*.*")
    images = [img for img in images if img.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    if not images:
        print("No images found in uploads/ directory for testing.")
        return

    print(f"Found {len(images)} images for testing.")
    
    qwen_models = [
        "qwen/qwen3-vl-235b-a22b-thinking",
        "qwen/qwen3-vl-30b-a3b-thinking"
    ]
    
    for image_path in images:
        print(f"\n{'='*50}\nEVALUATING IMAGE: {image_path}\n{'='*50}")
        
        for q_model in qwen_models:
            await test_qwen(q_model, image_path)
            
        # Run bytez test (sync)
        test_bytez(image_path)

if __name__ == "__main__":
    asyncio.run(main())
