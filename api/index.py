"""
Vercel Serverless Entry Point
Imports the FastAPI app from the backend package so Vercel can serve it.
"""
import sys
import os
from pathlib import Path

# Add the backend directory to the Python path so all backend imports resolve
backend_dir = str(Path(__file__).parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Try importing; surface errors instead of silent 500
try:
    from main import app
except Exception as exc:
    # Fallback app that shows the actual error
    from fastapi import FastAPI
    app = FastAPI()

    _error = f"{type(exc).__name__}: {exc}"
    import traceback
    _tb = traceback.format_exc()

    @app.get("/api/{path:path}")
    @app.post("/api/{path:path}")
    @app.get("/")
    async def _debug_error(path: str = ""):
        return {
            "error": "Backend failed to start",
            "detail": _error,
            "traceback": _tb.split("\n"),
            "python_version": sys.version,
            "env_keys": [k for k in os.environ if k.startswith(("SUPABASE", "VERCEL", "GROQ", "OPENROUTER", "LANGFUSE", "PINECONE"))],
        }
