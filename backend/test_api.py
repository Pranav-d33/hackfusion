import asyncio
import os
import sys

from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, GROQ_API_KEY, GROQ_BASE_URL
import httpx

async def test_api(url, key, model):
    print(f"Testing {model} on {url}...")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    json_payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Say 'hello world' in JSON format like {\"greeting\": \"hello world\"}"}],
        "temperature": 0.3,
    }
    # OpenRouter tests might need omitting max_tokens or adding response_format to trigger the bug. Let's see if plain request works.
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(f"{url}/chat/completions", headers=headers, json=json_payload)
        status = resp.status_code
        try:
            print(f"Status: {status}\nResponse: {resp.json()}")
        except:
            print(f"Status: {status}\nResponse: {resp.text}")

async def main():
    await test_api(OPENROUTER_BASE_URL, OPENROUTER_API_KEY, "google/gemini-2.0-flash-lite-preview-02-05:free")
    print("-" * 40)
    await test_api(OPENROUTER_BASE_URL, OPENROUTER_API_KEY, "qwen/qwen2.5-7b-instruct:free")
    print("-" * 40)
    await test_api(GROQ_BASE_URL, GROQ_API_KEY, "gemma2-9b-it")

asyncio.run(main())
