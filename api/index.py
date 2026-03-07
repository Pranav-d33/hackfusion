"""
Vercel Serverless Entry Point
"""
import sys
import os
import traceback
from pathlib import Path

# ── Step 1: ultra-minimal diagnostic endpoint ─────────────────
# If even this fails, the problem is at Vercel's Python runtime level
from fastapi import FastAPI

_startup_error = None
_startup_tb = None
_main_app = None

# ── Step 2: try importing the real app ─────────────────────────
backend_dir = str(Path(__file__).parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from main import app as _main_app
except Exception as exc:
    _startup_error = f"{type(exc).__name__}: {exc}"
    _startup_tb = traceback.format_exc()

if _main_app is not None:
    app = _main_app
else:
    app = FastAPI()

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    @app.get("/")
    async def _debug_error(path: str = ""):
        return {
            "error": "Backend failed to start",
            "detail": _startup_error,
            "traceback": _startup_tb.split("\n") if _startup_tb else [],
            "python": sys.version,
            "cwd": os.getcwd(),
            "backend_dir_exists": os.path.isdir(backend_dir),
            "backend_dir_contents": os.listdir(backend_dir) if os.path.isdir(backend_dir) else [],
            "env_set": sorted([k for k in os.environ if k.startswith(("SUPABASE", "VERCEL", "GROQ", "OPENROUTER", "LANGFUSE", "PINECONE"))]),
        }

# Handler for Vercel — must be named `handler` or `app`
handler = app
