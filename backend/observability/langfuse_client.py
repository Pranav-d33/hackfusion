"""
Langfuse Observability Client
Provides tracing for NLU, Planner, and Agent operations.
"""
import os
from typing import Optional, Any, Dict
from functools import wraps
import time

# Try to import langfuse, handle gracefully if not installed
try:
    from langfuse import Langfuse
    LANGFUSE_AVAILABLE = True
except ImportError:
    LANGFUSE_AVAILABLE = False
    Langfuse = None


# Configuration
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")

# Global client instance
_client: Optional[Any] = None
_enabled = False


def init_langfuse() -> bool:
    """Initialize Langfuse client. Returns True if successful."""
    global _client, _enabled
    
    if not LANGFUSE_AVAILABLE:
        print("⚠️ Langfuse not installed. Run: pip install langfuse")
        return False
    
    if not LANGFUSE_PUBLIC_KEY or not LANGFUSE_SECRET_KEY:
        print("⚠️ Langfuse keys not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY")
        return False
    
    try:
        _client = Langfuse(
            public_key=LANGFUSE_PUBLIC_KEY,
            secret_key=LANGFUSE_SECRET_KEY,
            host=LANGFUSE_HOST,
        )
        _enabled = True
        print("✅ Langfuse initialized successfully")
        return True
    except Exception as e:
        print(f"⚠️ Failed to initialize Langfuse: {e}")
        return False


def get_client() -> Optional[Any]:
    """Get the Langfuse client instance."""
    return _client


def is_enabled() -> bool:
    """Check if Langfuse tracing is enabled."""
    return _enabled


def create_trace(
    name: str,
    session_id: str,
    user_id: Optional[str] = None,
    metadata: Optional[Dict] = None,
) -> Optional[Any]:
    """
    Create a new trace for a session.
    
    Returns:
        Trace object or None if Langfuse not enabled
    """
    if not _enabled or not _client:
        return None
    
    try:
        trace = _client.trace(
            name=name,
            session_id=session_id,
            user_id=user_id,
            metadata=metadata or {},
        )
        return trace
    except Exception as e:
        print(f"⚠️ Failed to create trace: {e}")
        return None


def get_trace_url(trace_id: str) -> str:
    """Get the public URL for a trace."""
    return f"{LANGFUSE_HOST}/trace/{trace_id}"


class TracedOperation:
    """Context manager for tracing operations."""
    
    def __init__(
        self,
        trace: Any,
        name: str,
        operation_type: str = "span",
        metadata: Optional[Dict] = None,
    ):
        self.trace = trace
        self.name = name
        self.operation_type = operation_type
        self.metadata = metadata or {}
        self.span = None
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        if self.trace:
            try:
                if self.operation_type == "generation":
                    self.span = self.trace.generation(
                        name=self.name,
                        metadata=self.metadata,
                    )
                else:
                    self.span = self.trace.span(
                        name=self.name,
                        metadata=self.metadata,
                    )
            except Exception:
                pass
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time if self.start_time else 0
        if self.span:
            try:
                self.span.end(
                    metadata={"duration_ms": round(duration * 1000)},
                    status_message="error" if exc_type else "success",
                )
            except Exception:
                pass
        return False
    
    def update(self, **kwargs):
        """Update span with additional data."""
        if self.span:
            try:
                self.span.update(**kwargs)
            except Exception:
                pass
    
    def log_input(self, input_data: Any):
        """Log input to the span."""
        if self.span:
            try:
                self.span.update(input=input_data)
            except Exception:
                pass
    
    def log_output(self, output_data: Any):
        """Log output to the span."""
        if self.span:
            try:
                self.span.update(output=output_data)
            except Exception:
                pass


def flush():
    """Flush any pending traces."""
    if _client:
        try:
            _client.flush()
        except Exception:
            pass
