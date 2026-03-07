"""
Mediloon Backend - Main FastAPI Application
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import sys
from pathlib import Path
import os

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from config import CORS_ORIGINS, API_HOST, API_PORT, IS_VERCEL
from db.database import init_db, close_pool, USE_POSTGRES
from db.seed_data import seed_all
from agents.procurement_agent import seed_suppliers
from routes.agent_routes import router as agent_router
from routes.admin_routes import router as admin_router
from routes.refill_routes import router as refill_router
from routes.warehouse_routes import router as warehouse_router
from routes.auth_routes import router as auth_router
from routes.forecast_routes import router as forecast_router
from routes.procurement_routes import router as procurement_router
from routes.webhook_routes import router as webhook_router
from routes.event_routes import router as event_router
from routes.data_routes import router as data_router
from routes.observability_routes import router as observability_router
from routes.upload_routes import router as upload_router


# Try Pinecone first, fallback to ChromaDB, then SQL-only
try:
    from vector.pinecone_service import init_pinecone, index_medications
    VECTOR_BACKEND = "pinecone"
except ImportError:
    try:
        from vector.chroma_service import index_medications
        VECTOR_BACKEND = "chromadb"
        init_pinecone = None
    except ImportError:
        VECTOR_BACKEND = "sql"
        index_medications = None
        init_pinecone = None


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    app.state.startup_errors = []
    app.state.startup_steps = []

    async def run_step(name, fn):
        try:
            await fn()
            app.state.startup_steps.append({"step": name, "status": "ok"})
            print(f"✅ {name}")
            return True
        except Exception as exc:
            app.state.startup_steps.append({"step": name, "status": "error", "error": str(exc)})
            app.state.startup_errors.append(f"{name}: {exc}")
            print(f"❌ {name} failed: {exc}")
            return False

    # Startup
    print("🚀 Starting Mediloon Backend...")

    db_ready = await run_step("database init", init_db)

    run_seed_on_startup = _env_flag("RUN_STARTUP_SEED", not IS_VERCEL)
    run_supplier_seed = _env_flag("RUN_SUPPLIER_SEED", not IS_VERCEL)
    run_vector_startup = _env_flag("RUN_VECTOR_STARTUP", not IS_VERCEL)

    if db_ready and run_seed_on_startup:
        await run_step("database seed", lambda: seed_all(skip_translation=True))
    elif IS_VERCEL:
        print("ℹ️ Skipping database seed on Vercel cold start")

    if db_ready and run_supplier_seed:
        await run_step("supplier seed", seed_suppliers)
    elif IS_VERCEL:
        print("ℹ️ Skipping supplier seed on Vercel cold start")

    if db_ready and run_vector_startup:
        if VECTOR_BACKEND == "pinecone" and init_pinecone:
            if init_pinecone():
                await run_step("vector index", index_medications)
            else:
                print("⚠️ Pinecone not configured - using SQL fallback")
        elif VECTOR_BACKEND == "chromadb" and index_medications:
            await run_step("vector index", index_medications)
        else:
            print("ℹ️ Running with SQL-only search (no vector store)")
    elif IS_VERCEL:
        print("ℹ️ Skipping vector initialization on Vercel cold start")

    if app.state.startup_errors:
        print("⚠️ Backend started in degraded mode")
    else:
        print("🎯 Mediloon Backend ready!")
    
    yield
    
    # Shutdown
    print("👋 Shutting down Mediloon Backend...")
    if USE_POSTGRES:
        await close_pool()
        print("✅ PostgreSQL pool closed")


# Create FastAPI app
app = FastAPI(
    title="Mediloon Agentic Ordering MVP",
    description="Voice/text medicine ordering with agentic autonomy",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS + ["*"],  # Allow all for demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(agent_router)
app.include_router(admin_router)
app.include_router(refill_router)
app.include_router(warehouse_router)
app.include_router(auth_router)
app.include_router(forecast_router)
app.include_router(procurement_router)
app.include_router(webhook_router)
app.include_router(event_router)
app.include_router(data_router)
app.include_router(observability_router)
app.include_router(upload_router)


@app.get("/")
async def root(request: Request):
    """Health check endpoint."""
    startup_errors = list(getattr(request.app.state, "startup_errors", []))
    return {
        "status": "degraded" if startup_errors else "healthy",
        "app": "Mediloon Agentic Ordering MVP",
        "version": "1.0.0",
        "startup_errors": startup_errors,
    }


@app.get("/health")
async def health(request: Request):
    """Health check endpoint."""
    startup_errors = list(getattr(request.app.state, "startup_errors", []))
    return {
        "status": "degraded" if startup_errors else "ok",
        "startup_errors": startup_errors,
        "startup_steps": list(getattr(request.app.state, "startup_steps", [])),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )
