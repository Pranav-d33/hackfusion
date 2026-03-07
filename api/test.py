"""Minimal Vercel Python test — no dependencies."""
from http.server import BaseHTTPRequestHandler
import sys
import os
import json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()

        # Try importing each dependency to find which one fails
        results = {}
        for mod in [
            "fastapi",
            "dotenv",
            "httpx",
            "openpyxl",
            "pydantic",
            "pg8000",
            "aiosqlite",
            "pinecone",
            "langfuse",
            "jwt",
        ]:
            try:
                __import__(mod)
                results[mod] = "ok"
            except Exception as e:
                results[mod] = f"FAIL: {type(e).__name__}: {e}"

        body = json.dumps({
            "status": "alive",
            "python": sys.version,
            "cwd": os.getcwd(),
            "imports": results,
            "env_keys": sorted([
                k for k in os.environ
                if k.startswith(("SUPABASE", "VERCEL", "GROQ", "OPENROUTER", "LANGFUSE", "PINECONE"))
            ]),
        }, indent=2)

        self.wfile.write(body.encode("utf-8"))
