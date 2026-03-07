"""
Vercel Serverless Entry Point
"""
import sys
import os
import traceback
from pathlib import Path

backend_dir = str(Path(__file__).parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from main import app
except Exception:
    # If the full app fails, provide a debug endpoint
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from fastapi.middleware.cors import CORSMiddleware

    _tb = traceback.format_exc()
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
    async def _debug(path: str = ""):
        return JSONResponse(status_code=500, content={
            "error": "Backend failed to start",
            "traceback": _tb.split("\n"),
            "python": sys.version,
        })

handler = app
