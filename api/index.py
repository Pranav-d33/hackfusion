"""
Vercel Serverless Entry Point
"""
import sys
import os
import traceback
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = str(Path(__file__).parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

_startup_error = None
_startup_tb = None

try:
    from main import app
except Exception as exc:
    _startup_error = f"{type(exc).__name__}: {exc}"
    _startup_tb = traceback.format_exc()

    from fastapi import FastAPI
    app = FastAPI()

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    @app.get("/")
    async def _debug_error(path: str = ""):
        return {
            "error": "Backend failed to start",
            "detail": _startup_error,
            "traceback": _startup_tb.split("\n"),
            "python": sys.version,
            "env_set": sorted([k for k in os.environ if k.startswith(("SUPABASE", "VERCEL", "GROQ", "OPENROUTER", "LANGFUSE", "PINECONE"))]),
        }

# Handler for Vercel — must be named `handler` or `app`
handler = app
