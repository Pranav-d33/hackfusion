import os
import glob
import base64
import asyncio
from dotenv import load_dotenv

load_dotenv()

try:
    from bytez import Bytez
except ImportError:
    Bytez = None

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

if __name__ == "__main__":
    test_bytez("uploads/prescription_fbe22ac4-68b7-4fc1-8399-ecee2a0ca4b8.jpeg")
