"""
Mediloon Backend Configuration
Loads environment variables and provides configuration constants.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from the .env file in the project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Base paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "mediloon.db"
CHROMA_PATH = DATA_DIR / "chroma_db"

# ── Groq Configuration (PRIMARY — fast, generous free tier) ─────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
# Primary model on Groq: fast 70B
GROQ_PRIMARY_MODEL = os.getenv("GROQ_PRIMARY_MODEL", "llama-3.3-70b-versatile")
# Groq fallback: ultra-fast 8B
GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")

# ── OpenRouter Configuration (SECONDARY — fallback when Groq is down) ─
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Model Configuration — Unified LLM-first ordering agent
# OpenRouter models: only used if Groq is unavailable
NLU_MODEL = os.getenv("NLU_MODEL", "google/gemma-3-27b-it:free")
# Fallback models: tried in order if primary returns 429 / timeout
NLU_FALLBACK_MODELS = [
    m.strip() for m in os.getenv(
        "NLU_FALLBACK_MODELS",
        "meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-4b:free,nvidia/nemotron-nano-9b-v2:free"
    ).split(",") if m.strip()
]
# Legacy — kept for backward compat but no longer used separately
PLANNER_MODEL = os.getenv("PLANNER_MODEL", "google/gemini-2.0-flash-exp:free")

# Embedding Model (local)
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Testing: force regex-only mode (skip LLM calls)
NLU_FORCE_REGEX = os.getenv("NLU_FORCE_REGEX", "").lower() in ("1", "true", "yes")

# Vector Search Config
VECTOR_TOP_K = 3
SIMILARITY_THRESHOLD = 0.5

# Langfuse Observability
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")

# Server Config
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

