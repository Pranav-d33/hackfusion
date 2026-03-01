"""
Langfuse Observability Client (v3 SDK)
Provides tracing for NLU, Planner, and Agent operations.
"""
from typing import Optional, Any, Dict
import time

# Import config which loads .env
from config import LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST

# Try to import langfuse, handle gracefully if not installed
try:
    from langfuse import Langfuse
    LANGFUSE_AVAILABLE = True
except ImportError:
    LANGFUSE_AVAILABLE = False
    Langfuse = None


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
            timeout=15,
        )
        _enabled = True
        print("✅ Langfuse initialized successfully (v3 SDK)")
        return True
    except Exception as e:
        print(f"⚠️ Failed to initialize Langfuse: {e}")
        return False


def get_client() -> Optional[Any]:
    """Get the raw Langfuse client instance."""
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
    Create a new trace for a session using Langfuse v3 SDK.

    Returns:
        A trace-like wrapper object, or None if Langfuse not enabled.
    """
    if not _enabled or not _client:
        return None

    try:
        # v3: use start_span at the top level to create a root span (acts as trace)
        trace_id = _client.create_trace_id()
        span = _client.start_span(
            name=name,
            trace_context={"trace_id": trace_id},
            metadata=metadata or {},
        )
        
        # In v3, set trace-level attributes separately if needed
        span.update_trace(
            session_id=session_id,
            user_id=user_id or "",
        )
        
        # Wrap so callers can access .id = trace_id
        return _TraceWrapper(trace_id=trace_id, root_span=span, session_id=session_id)
    except Exception as e:
        print(f"⚠️ Failed to create trace: {e}")
        return None


def get_trace_url(trace_id: str) -> str:
    """Get the public URL for a trace."""
    if _enabled and _client:
        try:
            url = _client.get_trace_url(trace_id=trace_id)
            if url:
                return url
        except Exception as e:
            print(f"Failed to get trace URL from client: {e}")
            pass
    return f"{LANGFUSE_HOST}/trace/{trace_id}"


class _TraceWrapper:
    """Wraps a Langfuse v3 root span to provide a trace-like interface."""

    def __init__(self, trace_id: str, root_span: Any, session_id: str):
        self.id = trace_id
        self._root_span = root_span
        self.session_id = session_id

    def span(self, name: str, **kwargs) -> Any:
        """Create a child span."""
        if not _client:
            return _NoopSpan()
        try:
            return _client.start_span(
                name=name,
                trace_context={"trace_id": self.id},
                **kwargs,
            )
        except Exception:
            return _NoopSpan()

    def generation(self, name: str, **kwargs) -> Any:
        """Create a child generation span."""
        if not _client:
            return _NoopSpan()
        try:
            return _client.start_generation(
                name=name,
                trace_context={"trace_id": self.id},
                **kwargs,
            )
        except Exception:
            return _NoopSpan()

    def end(self, **kwargs):
        """End the root span."""
        try:
            if self._root_span and hasattr(self._root_span, 'end'):
                self._root_span.end(**kwargs)
        except Exception:
            pass


class _NoopSpan:
    """No-op span for when Langfuse is not available."""
    id = None

    def __init__(self, **_kwargs):
        pass

    def end(self, **_kwargs):
        pass

    def update(self, **_kwargs):
        pass


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
            except Exception as e:
                print(f"⚠️ TracedOperation enter failed: {e}")
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
