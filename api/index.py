"""
Vercel Serverless Entry Point – staged import for debugging
"""
import sys
import os
import traceback
import json as _json
from pathlib import Path

# ── Phase 0: A working FastAPI app no matter what ──────────────
from fastapi import FastAPI
from fastapi.responses import JSONResponse

_errors: list[str] = []
_main_app = None

# ── Phase 1: Try importing the real app ────────────────────────
backend_dir = str(Path(__file__).parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from main import app as _real_app
    _main_app = _real_app
except Exception as exc:
    _errors.append(f"main import: {type(exc).__name__}: {exc}\n{traceback.format_exc()}")

# ── Phase 2: Choose which app to serve ─────────────────────────
if _main_app is not None:
    app = _main_app
else:
    app = FastAPI()

    @app.get("/api/health")
    @app.get("/api/debug")
    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    async def _debug_error(path: str = ""):
        return JSONResponse(content={
            "ok": False,
            "errors": _errors,
            "python": sys.version,
            "cwd": os.getcwd(),
            "env_keys": sorted([k for k in os.environ if k.startswith(
                ("SUPABASE", "VERCEL", "GROQ", "OPENROUTER", "LANGFUSE", "PINECONE")
            )]),
        })

# ── Vercel handler ─────────────────────────────────────────────
handler = app
