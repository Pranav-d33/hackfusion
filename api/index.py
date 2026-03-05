"""
Vercel Serverless Entry Point
Imports the FastAPI app from the backend package so Vercel can serve it.
"""
import sys
from pathlib import Path

# Add the backend directory to the Python path so all backend imports resolve
backend_dir = str(Path(__file__).parent.parent / "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Import the FastAPI app — this is what Vercel's Python runtime calls
from main import app
