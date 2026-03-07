"""
Vercel Serverless Entry Point – staged import for debugging
"""
import sys
import os
import traceback
from pathlib import Path

# ── Phase 0: A working FastAPI app no matter what ──────────────
from fastapi import FastAPI
from fastapi.responses import JSONResponse

_errors: list = []
_main_app = None

# ── Phase 1: Try importing the real app ────────────────────────
backend_dir = str(Path(__file__).parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Stage-by-stage import to identify exactly where it fails
_stage = "not started"
try:
    _stage = "config"
    from config import SUPABASE_DATABASE_URL, IS_VERCEL, CORS_ORIGINS
    _errors.append(f"config: OK (VERCEL={IS_VERCEL}, PG={bool(SUPABASE_DATABASE_URL)})")

    _stage = "database"
    from db.database import init_db, close_pool, USE_POSTGRES, execute_query
    _errors.append(f"database: OK (USE_POSTGRES={USE_POSTGRES})")

    _stage = "seed_data"
    from db.seed_data import seed_all
    _errors.append("seed_data: OK")

    _stage = "agents"
    from agents.procurement_agent import seed_suppliers
    _errors.append("agents: OK")

    _stage = "routes"
    from routes.agent_routes import router as agent_router
    from routes.admin_routes import router as admin_router
    _errors.append("routes: OK")

    _stage = "main_import"
    from main import app as _real_app
    _main_app = _real_app
    _errors.append("main: OK")

except Exception as exc:
    _errors.append(f"FAILED at stage '{_stage}': {type(exc).__name__}: {exc}")
    _errors.append(traceback.format_exc())

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
            "stages": _errors,
            "python": sys.version,
        })

# ── Vercel handler ─────────────────────────────────────────────
handler = app
