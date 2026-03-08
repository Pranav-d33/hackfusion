"""
Agent API Routes
Chat and voice endpoints for the agent.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from agents.orchestrator import process_message, get_session_state, clear_session, update_session_state
from tools.trace_tools import get_trace, clear_trace
from tools.cart_tools import get_cart, clear_cart, update_cart_quantity, remove_from_cart
from tools.query_tools import vector_search
from tools.query_tools import get_medication_details
from agents.safety_agent import validate_add_to_cart
from services.speech_service import transcribe_audio_file

router = APIRouter(prefix="/api", tags=["agent"])


def _lang_key(lang: Optional[str]) -> str:
    base = (lang or "en").split("-")[0].lower()
    return base if base in {"en", "de", "ar", "hi"} else "en"


def _direct_add_error(reason: str, lang: str, med_name: str = "This medication") -> str:
    messages = {
        "not_found": {
            "en": "Medication not found.",
            "de": "Medikament nicht gefunden.",
            "ar": "لم يتم العثور على الدواء.",
            "hi": "दवा नहीं मिली।",
        },
        "rx_required": {
            "en": f"{med_name} is prescription-only. Please upload and verify a valid prescription before ordering.",
            "de": f"{med_name} ist verschreibungspflichtig. Bitte lade ein gültiges Rezept hoch und verifiziere es vor der Bestellung.",
            "ar": f"{med_name} دواء يُصرف بوصفة طبية فقط. يرجى رفع وصفة صالحة والتحقق منها قبل الطلب.",
            "hi": f"{med_name} केवल प्रिस्क्रिप्शन पर मिलता है। कृपया ऑर्डर से पहले वैध प्रिस्क्रिप्शन अपलोड करके सत्यापित करें।",
        },
        "out_of_stock": {
            "en": f"{med_name} is currently out of stock.",
            "de": f"{med_name} ist derzeit nicht auf Lager.",
            "ar": f"{med_name} غير متوفر حاليًا في المخزون.",
            "hi": f"{med_name} फिलहाल स्टॉक में उपलब्ध नहीं है।",
        },
        "default": {
            "en": "Cannot add medication to cart.",
            "de": "Das Medikament kann nicht zum Warenkorb hinzugefügt werden.",
            "ar": "لا يمكن إضافة الدواء إلى السلة.",
            "hi": "दवा को कार्ट में नहीं जोड़ा जा सकता।",
        },
    }
    bucket = messages.get(reason, messages["default"])
    return bucket.get(lang, bucket["en"])


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
    trace_id: Optional[str] = None
    trace_url: Optional[str] = None
    language: Optional[str] = None  # language of the response
    blocked: Optional[bool] = None
    reason: Optional[str] = None
    order: Optional[Dict[str, Any]] = None
    ui_action: Optional[str] = None


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
        preferred_language=request.language,
    )
    
    return ChatResponse(**result)


@router.post("/voice", response_model=ChatResponse)
async def voice(request: ChatRequest):
    """
    Voice input endpoint (same as chat, but marked as voice source).
    """
    request.source = "voice"
    return await chat(request)


@router.post("/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...), language: Optional[str] = Form(None)):
    """Transcribe raw audio uploaded by the frontend fallback voice recorder."""
    return await transcribe_audio_file(file, language=language)


@router.get("/cart/{session_id}")
async def get_session_cart(session_id: str):
    """Get cart for a session."""
    cart = await get_cart(session_id)
    return cart


@router.delete("/cart/{session_id}")
async def clear_session_cart(session_id: str):
    """Clear cart for a session."""
    cart = await clear_cart(session_id)
    update_session_state(session_id, {"cart": cart})
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
    med = await get_medication_details(request.med_id)
    state = get_session_state(session_id)
    preferred_lang = _lang_key(state.get("preferred_language"))
    if not med:
        raise HTTPException(status_code=404, detail=_direct_add_error("not_found", preferred_lang))

    rx_verified_ids = state.get("rx_verified_med_ids", set())
    rx_confirmed_for_this_med = (
        not med.get("rx_required", False)
        or request.med_id in rx_verified_ids
    )
    validation = validate_add_to_cart(
        med,
        rx_confirmed=rx_confirmed_for_this_med,
        rx_bypass=False,
    )
    if not validation.get("allowed"):
        reason = validation.get("reason", "default")
        detail = _direct_add_error(reason, preferred_lang, med.get("brand_name", "This medication"))
        raise HTTPException(status_code=400, detail=detail)

    cart = await add_to_cart(session_id, str(request.med_id), request.qty, dose=request.dose)
    if not cart.get("added", True):
        detail = cart.get("warning") or _direct_add_error("default", preferred_lang)
        raise HTTPException(status_code=400, detail=detail)
    update_session_state(session_id, {"cart": cart})
    return cart


@router.put("/cart/{session_id}/item/{cart_item_id}")
async def update_item_quantity(session_id: str, cart_item_id: int, request: UpdateQuantityRequest):
    """
    Update the quantity of a cart item.
    """
    if request.quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity must be non-negative")
    
    cart = await update_cart_quantity(session_id, cart_item_id, request.quantity)
    update_session_state(session_id, {"cart": cart})
    return cart


@router.delete("/cart/{session_id}/item/{cart_item_id}")
async def delete_cart_item(session_id: str, cart_item_id: int):
    """
    Remove one cart item explicitly.
    """
    cart = await remove_from_cart(session_id, cart_item_id)
    update_session_state(session_id, {"cart": cart})
    return cart
