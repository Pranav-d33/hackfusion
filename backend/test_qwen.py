import requests
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("OPENROUTER_API_KEY")

response = requests.get(
    "https://openrouter.ai/api/v1/models",
    headers={"Authorization": f"Bearer {api_key}"}
)
models = [m['id'] for m in response.json()['data'] if 'qwen' in m['id'].lower() and 'vl' in m['id'].lower()]
print(models)
