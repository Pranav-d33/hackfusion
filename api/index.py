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
    from main import app as backend_app
except Exception:
    # If the full app fails, provide a debug endpoint
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from fastapi.middleware.cors import CORSMiddleware

    _tb = traceback.format_exc()
    backend_app = FastAPI()
    backend_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @backend_app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
    async def _debug(path: str = ""):
        return JSONResponse(status_code=500, content={
            "error": "Backend failed to start",
            "traceback": _tb.split("\n"),
            "python": sys.version,
        })

_PASSTHROUGH_PATHS = {"/", "/health", "/docs", "/openapi.json", "/redoc"}


def _normalize_vercel_scope(scope):
    if scope.get("type") != "http":
        return scope

    path = scope.get("path", "") or "/"
    if path in _PASSTHROUGH_PATHS or path == "/api" or path.startswith("/api/"):
        return scope

    normalized_path = f"/api{path if path.startswith('/') else f'/{path}'}"
    normalized_scope = dict(scope)
    normalized_scope["path"] = normalized_path

    raw_path = scope.get("raw_path")
    if isinstance(raw_path, (bytes, bytearray)):
        raw_text = raw_path.decode("latin-1") or "/"
        if raw_text != "/" and raw_text != "/api" and not raw_text.startswith("/api/"):
            normalized_scope["raw_path"] = f"/api{raw_text if raw_text.startswith('/') else f'/{raw_text}'}".encode("latin-1")

    return normalized_scope


async def app(scope, receive, send):
    await backend_app(_normalize_vercel_scope(scope), receive, send)


handler = app
