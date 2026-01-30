"""
Mediloon Backend - Main FastAPI Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from config import CORS_ORIGINS, API_HOST, API_PORT
from db.database import init_db
from db.seed_data import seed_database
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    # Startup
    print("🚀 Starting Mediloon Backend...")
    
    # Initialize database
    await init_db()
    print("✅ Database initialized")
    
    # Seed database
    await seed_database()
    print("✅ Database seeded")
    
    # Initialize vector store
    if VECTOR_BACKEND == "pinecone" and init_pinecone:
        if init_pinecone():
            await index_medications()
            print("✅ Pinecone vector store ready")
        else:
            print("⚠️ Pinecone not configured - using SQL fallback")
    elif VECTOR_BACKEND == "chromadb" and index_medications:
        await index_medications()
        print("✅ ChromaDB vector store indexed")
    else:
        print("ℹ️ Running with SQL-only search (no vector store)")
    
    print("🎯 Mediloon Backend ready!")
    
    yield
    
    # Shutdown
    print("👋 Shutting down Mediloon Backend...")


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
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": "Mediloon Agentic Ordering MVP",
        "version": "1.0.0",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )
