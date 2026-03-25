"""
Langfuse Observability Client
Provides tracing for NLU, Planner, and Agent operations.
Compatible with Langfuse Python SDK v2 and v3 style APIs.
"""
from typing import Optional, Any, Dict
import inspect
import time
import uuid

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


def _call_with_supported_kwargs(fn: Any, kwargs: Dict[str, Any]) -> Any:
    """Call SDK methods while tolerating version-specific kwargs."""
    try:
        sig = inspect.signature(fn)
        accepts_var_kw = any(
            p.kind == inspect.Parameter.VAR_KEYWORD
            for p in sig.parameters.values()
        )
        if accepts_var_kw:
            return fn(**kwargs)
        filtered = {k: v for k, v in kwargs.items() if k in sig.parameters}
        return fn(**filtered)
    except Exception:
        # Best effort fallback if introspection fails
        return fn(**kwargs)


def init_langfuse() -> bool:
    """Initialize Langfuse client. Returns True if successful."""
    global _client, _enabled

    _enabled = False
    _client = None

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
        print("✅ Langfuse initialized successfully")
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
    Create a new trace for a session.

    Returns:
        A trace wrapper object, or None if Langfuse not enabled.
    """
    if not _enabled or not _client:
        return None

    try:
        trace_id = None
        root = None
        metadata = metadata or {}

        # v3-style client: create trace id + root span
        if hasattr(_client, "create_trace_id"):
            try:
                trace_id = _client.create_trace_id()
            except Exception:
                trace_id = None

        if hasattr(_client, "start_span"):
            span_kwargs = {"name": name, "metadata": metadata}
            if trace_id:
                span_kwargs["trace_context"] = {"trace_id": trace_id}
            try:
                root = _call_with_supported_kwargs(_client.start_span, span_kwargs)
                if root and hasattr(root, "update_trace"):
                    _call_with_supported_kwargs(
                        root.update_trace,
                        {
                            "session_id": session_id,
                            "user_id": user_id or "",
                        },
                    )
            except Exception:
                root = None

        # v2-style client: top-level trace object
        if root is None and hasattr(_client, "trace"):
            try:
                root = _call_with_supported_kwargs(
                    _client.trace,
                    {
                        "name": name,
                        "session_id": session_id,
                        "user_id": user_id or "",
                        "metadata": metadata,
                    },
                )
                if root:
                    trace_id = trace_id or getattr(root, "id", None) or getattr(root, "trace_id", None)
            except Exception:
                root = None

        trace_id = trace_id or getattr(root, "id", None) or str(uuid.uuid4())
        return _TraceWrapper(trace_id=trace_id, root=root, session_id=session_id)
    except Exception as e:
        print(f"⚠️ Failed to create trace: {e}")
        return None


def get_trace_url(trace_id: str) -> str:
    """Get the public URL for a trace."""
    if _enabled and _client and trace_id:
        try:
            get_url = getattr(_client, "get_trace_url", None)
            if callable(get_url):
                try:
                    url = _call_with_supported_kwargs(get_url, {"trace_id": trace_id})
                    if url:
                        return url
                except Exception:
                    pass
        except Exception as e:
            print(f"Failed to get trace URL from client: {e}")
    return f"{LANGFUSE_HOST}/trace/{trace_id}"


def start_generation(
    trace_id: Optional[str],
    name: str,
    model: Optional[str] = None,
    input: Any = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Any:
    """Start a generation span directly from trace_id, across SDK versions."""
    if not _enabled or not _client or not trace_id:
        return _NoopSpan()

    payload = {
        "name": name,
        "model": model,
        "input": input,
        "metadata": metadata or {},
    }

    # v3-style client method
    start_generation_fn = getattr(_client, "start_generation", None)
    if callable(start_generation_fn):
        try:
            gen = _call_with_supported_kwargs(
                start_generation_fn,
                {
                    **payload,
                    "trace_context": {"trace_id": trace_id},
                },
            )
            if gen is not None:
                return _SpanAdapter(gen)
        except Exception:
            pass

    # v2-style top-level generation(trace_id=...)
    generation_fn = getattr(_client, "generation", None)
    if callable(generation_fn):
        try:
            gen = _call_with_supported_kwargs(
                generation_fn,
                {
                    **payload,
                    "trace_id": trace_id,
                },
            )
            if gen is not None:
                return _SpanAdapter(gen)
        except Exception:
            pass

    return _NoopSpan()


class _SpanAdapter:
    """Wraps SDK spans/generations with best-effort update/end compatibility."""

    def __init__(self, inner: Any):
        self._inner = inner
        self.id = getattr(inner, "id", None)
        self._pending_updates: Dict[str, Any] = {}

    def update(self, **kwargs):
        if not kwargs:
            return
        update_fn = getattr(self._inner, "update", None)
        if callable(update_fn):
            try:
                _call_with_supported_kwargs(update_fn, kwargs)
                return
            except Exception:
                pass
        # Store updates so we can attach on end() when update() is unavailable.
        self._pending_updates.update(kwargs)

    def end(self, **kwargs):
        end_fn = getattr(self._inner, "end", None)
        if not callable(end_fn):
            return

        payload = dict(self._pending_updates)
        payload.update(kwargs or {})
        try:
            _call_with_supported_kwargs(end_fn, payload)
        except Exception:
            try:
                end_fn()
            except Exception:
                pass


class _TraceWrapper:
    """Wraps a Langfuse trace/span object with a stable interface."""

    def __init__(self, trace_id: str, root: Any, session_id: str):
        self.id = trace_id
        self._root = root
        self.session_id = session_id

    def span(self, name: str, **kwargs) -> Any:
        """Create a child span."""
        # Prefer child span creation from root object
        for method_name in ("start_span", "span"):
            fn = getattr(self._root, method_name, None)
            if callable(fn):
                try:
                    span = _call_with_supported_kwargs(fn, {"name": name, **kwargs})
                    if span is not None:
                        return _SpanAdapter(span)
                except Exception:
                    pass

        # Fallback to client-level methods
        if _client:
            start_span_fn = getattr(_client, "start_span", None)
            if callable(start_span_fn):
                try:
                    span = _call_with_supported_kwargs(
                        start_span_fn,
                        {
                            "name": name,
                            "trace_context": {"trace_id": self.id},
                            **kwargs,
                        },
                    )
                    if span is not None:
                        return _SpanAdapter(span)
                except Exception:
                    pass

            span_fn = getattr(_client, "span", None)
            if callable(span_fn):
                try:
                    span = _call_with_supported_kwargs(
                        span_fn,
                        {
                            "name": name,
                            "trace_id": self.id,
                            **kwargs,
                        },
                    )
                    if span is not None:
                        return _SpanAdapter(span)
                except Exception:
                    pass

        return _NoopSpan()

    def generation(self, name: str, **kwargs) -> Any:
        """Create a child generation span."""
        # Prefer child generation creation from root object
        for method_name in ("start_generation", "generation"):
            fn = getattr(self._root, method_name, None)
            if callable(fn):
                try:
                    gen = _call_with_supported_kwargs(fn, {"name": name, **kwargs})
                    if gen is not None:
                        return _SpanAdapter(gen)
                except Exception:
                    pass

        # Fallback to client-level helper
        return start_generation(
            trace_id=self.id,
            name=name,
            model=kwargs.get("model"),
            input=kwargs.get("input"),
            metadata=kwargs.get("metadata"),
        )

    def end(self, **kwargs):
        """End the root trace/span."""
        end_fn = getattr(self._root, "end", None)
        if callable(end_fn):
            try:
                _call_with_supported_kwargs(end_fn, kwargs)
            except Exception:
                try:
                    end_fn()
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
