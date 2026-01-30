"""
Mediloon Backend Configuration
Loads environment variables and provides configuration constants.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "mediloon.db"
CHROMA_PATH = DATA_DIR / "chroma_db"

# OpenRouter Configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Model Configuration
NLU_MODEL = os.getenv("NLU_MODEL", "mistralai/mistral-7b-instruct")
PLANNER_MODEL = os.getenv("PLANNER_MODEL", "qwen/qwen-2.5-72b-instruct")

# Embedding Model (local)
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Vector Search Config
VECTOR_TOP_K = 3
SIMILARITY_THRESHOLD = 0.6

# Langfuse Observability
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")

# Server Config
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

