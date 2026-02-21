"""
Agent API Routes
Chat and voice endpoints for the agent.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from agents.orchestrator import process_message, get_session_state, clear_session
from tools.trace_tools import get_trace, clear_trace
from tools.cart_tools import get_cart, clear_cart, update_cart_quantity
from tools.query_tools import vector_search

router = APIRouter(prefix="/api", tags=["agent"])


class ChatRequest(BaseModel):
    """Chat request model."""
    session_id: Optional[str] = None
    message: str
    source: str = "text"  # "text" or "voice"
    language: Optional[str] = None  # detected language from frontend (en/de/ar)
    customer_id: Optional[int] = None  # logged-in customer id from frontend


class ChatResponse(BaseModel):
    """Chat response model."""
    session_id: str
    message: str
    tts_message: Optional[str] = None
    candidates: List[Dict[str, Any]] = []
    cart: Dict[str, Any] = {}
    action_taken: Optional[str] = None
    needs_input: bool = True
    end_conversation: bool = False
    latency_ms: int = 0
    trace: List[Dict[str, Any]] = []
    language: Optional[str] = None  # language of the response


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Main chat endpoint for agent interaction.
    Accepts text or voice (STT) input.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    result = await process_message(
        session_id=request.session_id,
        user_input=request.message.strip(),
        customer_id=request.customer_id,
    )
    
    return ChatResponse(**result)


@router.post("/voice", response_model=ChatResponse)
async def voice(request: ChatRequest):
    """
    Voice input endpoint (same as chat, but marked as voice source).
    """
    request.source = "voice"
    return await chat(request)


@router.get("/cart/{session_id}")
async def get_session_cart(session_id: str):
    """Get cart for a session."""
    cart = await get_cart(session_id)
    return cart


@router.delete("/cart/{session_id}")
async def clear_session_cart(session_id: str):
    """Clear cart for a session."""
    cart = await clear_cart(session_id)
    return {"status": "cleared", "cart": cart}


@router.get("/trace/{session_id}")
async def get_session_trace(session_id: str):
    """Get agent trace for a session."""
    trace = get_trace(session_id)
    return {"session_id": session_id, "trace": trace}


@router.delete("/trace/{session_id}")
async def clear_session_trace(session_id: str):
    """Clear trace for a session."""
    clear_trace(session_id)
    return {"status": "cleared"}


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get full session state."""
    state = get_session_state(session_id)
    cart = await get_cart(session_id)
    trace = get_trace(session_id)
    
    return {
        "session_id": session_id,
        "state": state,
        "cart": cart,
        "trace": trace,
    }


@router.delete("/session/{session_id}")
async def end_session(session_id: str):
    """End and clear a session."""
    clear_session(session_id)
    await clear_cart(session_id)
    clear_trace(session_id)
    return {"status": "session_ended"}

@router.get("/search/medications")
async def search_medications(q: str = ""):
    """
    Search medications by name for the manual search UI.
    Returns results with rx_required, price, stock info.
    """
    if not q or not q.strip():
        return {"results": []}
    
    results = await vector_search(q.strip(), top_k=10)
    return {"results": results}


class UpdateQuantityRequest(BaseModel):
    quantity: int


class AddToCartRequest(BaseModel):
    med_id: int
    qty: int = 1
    dose: str = None


@router.post("/cart/{session_id}/add")
async def direct_add_to_cart(session_id: str, request: AddToCartRequest):
    """
    Direct add-to-cart endpoint that bypasses the LLM agent.
    More reliable for UI-driven add operations (clicking medicine cards).
    """
    from tools.cart_tools import add_to_cart
    cart = await add_to_cart(session_id, str(request.med_id), request.qty, dose=request.dose)
    return cart


@router.put("/cart/{session_id}/item/{cart_item_id}")
async def update_item_quantity(session_id: str, cart_item_id: int, request: UpdateQuantityRequest):
    """
    Update the quantity of a cart item.
    """
    if request.quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity must be non-negative")
    
    cart = await update_cart_quantity(session_id, cart_item_id, request.quantity)
    return cart
