"""
Agent Orchestrator (v2) — Simplified LLM-first pipeline.

Pipeline: Safety Check → Ordering Agent (single LLM call) → Execute Action → Output Guard

Replaces the old NLU → Planner → Execute cascade with a single ordering
agent that handles intent understanding, context resolution, and action
planning in one step.
"""
from typing import Dict, Any, Optional
import time
import uuid
import re
import sys
sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from agents.ordering_agent import handle as ordering_agent_handle, _detect_script_language
from agents.ui_agent import validate_ui_action
from agents.safety_agent import check_input_safety, validate_add_to_cart
from tools.query_tools import (
    lookup_by_indication, vector_search, get_inventory,
    get_rx_flag, get_medication_details, get_tier1_alternatives,
    suggest_similar_medications,
)
from tools.cart_tools import add_to_cart, get_cart, checkout, clear_cart, remove_from_cart
from tools.trace_tools import log_trace, get_trace

# Langfuse observability
from observability.langfuse_client import (
    init_langfuse, create_trace, get_trace_url, TracedOperation, flush, is_enabled,
)

# ── Session state ───────────────────────────────────────────────────────
_conversation_states: Dict[str, Dict[str, Any]] = {}
_SUPPORTED_RESPONSE_LANGS = {"en", "de", "ar", "hi"}


# ── Static output guard ────────────────────────────────────────────────
FORBIDDEN_OUTPUT_PATTERNS = [
    "take this medication",
    "i recommend",
    "you should take",
    "dosage is",
    "mg per day",
    "antibiotic",
]


# ── Lightweight language utilities ───────────────────────────────────
_L10N = {
    "ask_rx": {
        "en": "{med} requires a prescription. Do you have one?",
        "de": "{med} ist verschreibungspflichtig. Hast du ein Rezept?",
        "ar": "هذا الدواء يحتاج إلى وصفة طبية. هل لديك وصفة؟",
        "hi": "यह दवा प्रिस्क्रिप्शन पर मिलती है। क्या आपके पास प्रिस्क्रिप्शन है?",
    },
    "ask_quantity": {
        "en": "How many units of {med} would you like?",
        "de": "Wie viele Einheiten von {med} möchtest du?",
        "ar": "كم وحدة من {med} تريد؟",
        "hi": "{med} की कितनी यूनिट चाहिए?",
    },
    "ask_dose": {
        "en": "What dose for {med}?",
        "de": "Welche Dosierung für {med}?",
        "ar": "ما هي الجرعة لـ {med}؟",
        "hi": "{med} की कौन-सी डोज़ चाहिए?",
    },
    "checkout_start": {
        "en": "Let me start the checkout process for you.",
        "de": "Ich starte jetzt den Checkout für dich.",
        "ar": "سأبدأ عملية الدفع لك الآن.",
        "hi": "मैं आपके लिए चेकआउट प्रक्रिया शुरू करता हूँ। कृपया विवरण कन्फर्म करें।",
    },
    "checkout_empty": {
        "en": "Your cart is empty. Add some items first!",
        "de": "Dein Warenkorb ist leer. Bitte füge zuerst Artikel hinzu!",
        "ar": "سلة التسوق فارغة. أضف بعض المنتجات أولاً!",
        "hi": "आपका कार्ट खाली है। पहले कुछ आइटम जोड़ें।",
    },
    "search_empty": {
        "en": "I couldn't find {name}. Could you check the spelling or tell me what condition you're treating?",
        "de": "Ich konnte {name} nicht finden. Bitte prüfe die Schreibweise oder beschreibe, wofür du es brauchst.",
        "ar": "لم أجد {name}. هل يمكنك التحقق من التهجئة أو إخباري بالحالة التي تعالجها؟",
        "hi": "मुझे {name} नहीं मिला। कृपया स्पेलिंग जाँचें या बताएं कि किस समस्या के लिए चाहिए।",
    },
    "lookup_empty": {
        "en": "I couldn't find any medications for \"{indication}\". Could you describe your symptoms differently or provide the medication name?",
        "de": "Ich habe keine Medikamente für \"{indication}\" gefunden. Kannst du die Symptome anders beschreiben oder den Medikamentennamen nennen?",
        "ar": "لم أجد أدوية لـ \"{indication}\". هل يمكنك وصف الأعراض بطريقة مختلفة أو ذكر اسم الدواء؟",
        "hi": "\"{indication}\" के लिए कोई दवा नहीं मिली। कृपया लक्षण दूसरे तरीके से बताएं या दवा का नाम दें।",
    },
    "add_not_found": {
        "en": "I couldn't find that medication. Could you try searching again?",
        "de": "Ich konnte dieses Medikament nicht finden. Bitte suche erneut.",
        "ar": "لم أتمكن من العثور على هذا الدواء. هل يمكنك البحث مرة أخرى؟",
        "hi": "वह दवा नहीं मिली। क्या आप दोबारा खोजेंगे?",
    },
    "select_prompt": {
        "en": "Please select an item by number, or ask for more details.",
        "de": "Bitte wähle einen Artikel per Nummer oder frage nach Details.",
        "ar": "اختر منتجًا برقم، أو اطلب المزيد من التفاصيل.",
        "hi": "कृपया नंबर से आइटम चुनें या अधिक जानकारी पूछें।",
    },
    "indication_lead": {
        "en": "The following medications are available for {indication}:",
        "de": "Folgende Medikamente sind verfügbar für {indication}:",
        "ar": "الأدوية التالية متوفرة لـ {indication}:",
        "hi": "{indication} के लिए ये दवाइयाँ उपलब्ध हैं:",
    },
    "search_lead": {
        "en": "I found the following matches for your search:",
        "de": "Ich habe folgende Treffer gefunden:",
        "ar": "عثرت على النتائج التالية لبحثك:",
        "hi": "मुझे आपकी खोज के लिए ये परिणाम मिले हैं:",
    },
    "search_tts": {
        "en": "I found {name}. Here are the options. Please choose from the screen.",
        "de": "Ich habe {name} gefunden. Bitte wähle eine Option vom Bildschirm.",
        "ar": "وجدت {name}. يرجى الاختيار من الشاشة.",
        "hi": "मुझे {name} मिला है। कृपया स्क्रीन पर देखकर चुनें।",
    },
    "indication_search_tts": {
        "en": "I found medicines for {indication}. Please choose from the screen.",
        "de": "Ich habe Medikamente für {indication} gefunden. Bitte wähle vom Bildschirm.",
        "ar": "وجدت أدوية لـ {indication}. يرجى الاختيار من الشاشة.",
        "hi": "{indication} के लिए दवाइयाँ मिलीं। कृपया स्क्रीन पर देखकर चुनें।",
    },
    "single_rx": {
        "en": "{med} ({dosage}) is available at €{price:.2f}. This medication requires a valid prescription. Do you have one ready?",
        "de": "{med} ({dosage}) ist für €{price:.2f} verfügbar. Dieses Medikament braucht ein Rezept. Hast du eines?",
        "ar": "{med} ({dosage}) متوفر بسعر €{price:.2f}. هذا الدواء يحتاج إلى وصفة طبية. هل لديك وصفة؟",
        "hi": "{med} ({dosage}) €{price:.2f} में उपलब्ध है। इस दवा के लिए प्रिस्क्रिप्शन चाहिए। क्या आपके पास है?",
    },
    "single_otc": {
        "en": "{med} ({dosage}) is available at €{price:.2f}. Would you like to add this to your cart?",
        "de": "{med} ({dosage}) ist für €{price:.2f} verfügbar. Soll ich es in den Warenkorb legen?",
        "ar": "{med} ({dosage}) متوفر بسعر €{price:.2f}. هل تريد إضافته إلى سلة التسوق؟",
        "hi": "{med} ({dosage}) €{price:.2f} में उपलब्ध है। क्या इसे कार्ट में जोड़ दूँ?",
    },
    "add_success": {
        "en": "{med} ({qty} unit{plural}) has been added to your cart. Your cart now contains {cart_items} item{cart_plural}. Would you like to continue adding items or proceed to checkout?",
        "de": "{med} ({qty} Stück{plural}) wurde in deinen Warenkorb gelegt. Er enthält jetzt {cart_items} Artikel{cart_plural}. Möchtest du weiter einkaufen oder zur Kasse gehen?",
        "ar": "تمت إضافة {med} ({qty} وحدة{plural}) إلى سلة التسوق. السلة تحتوي الآن على {cart_items} منتج{cart_plural}. هل تريد إضافة المزيد أم المتابعة للدفع؟",
        "hi": "{med} ({qty} यूनिट{plural}) कार्ट में जोड़ दी गई है। अब आपके कार्ट में {cart_items} आइटम{cart_plural} हैं। क्या आप और आइटम जोड़ना चाहेंगे या चेकआउट करेंगे?",
    },
    "no_alternatives": {
        "en": "No alternatives with the same active ingredient are available right now. Would you like to search for something else?",
        "de": "Keine Alternativen mit gleichem Wirkstoff verfügbar. Möchtest du nach etwas anderem suchen?",
        "ar": "لا توجد بدائل بنفس المادة الفعالة حاليًا. هل تريد البحث عن شيء آخر؟",
        "hi": "अभी समान सक्रिय घटक वाला कोई विकल्प उपलब्ध नहीं है। क्या आप कुछ और खोजना चाहेंगे?",
    },
    "alternatives_lead": {
        "en": "The following alternatives with the same active ingredient are available:",
        "de": "Folgende Alternativen mit demselben Wirkstoff sind verfügbar:",
        "ar": "البدائل التالية متوفرة بنفس المادة الفعالة:",
        "hi": "समान सक्रिय घटक के साथ ये विकल्प उपलब्ध हैं:",
    },
    "alternatives_question": {
        "en": "Would you like to add one of these to your cart?",
        "de": "Möchtest du eines davon in den Warenkorb legen?",
        "ar": "هل تريد إضافة أحد هذه الخيارات إلى سلة التسوق؟",
        "hi": "क्या आप इनमें से किसी एक को कार्ट में जोड़ना चाहेंगे?",
    },
    "which_prefer": {
        "en": "Which would you prefer?",
        "de": "Welche möchtest du?",
        "ar": "أي واحد تفضل؟",
        "hi": "आप इनमें से कौन-सा चाहेंगे?",
    },
    "rx_required_block": {
        "en": "{med} is prescription-only. Please upload and verify a valid prescription before ordering.",
        "de": "{med} ist verschreibungspflichtig. Bitte lade ein gültiges Rezept hoch und verifiziere es vor der Bestellung.",
        "ar": "{med} دواء يُصرف بوصفة طبية فقط. يرجى رفع وصفة صالحة والتحقق منها قبل الطلب.",
        "hi": "{med} केवल प्रिस्क्रिप्शन पर मिलता है। कृपया ऑर्डर से पहले वैध प्रिस्क्रिप्शन अपलोड करके सत्यापित करें।",
    },
    "out_of_stock": {
        "en": "{med} is currently out of stock. Shall I check for alternatives with the same active ingredient?",
        "de": "{med} ist derzeit nicht auf Lager. Soll ich nach Alternativen mit dem gleichen Wirkstoff suchen?",
        "ar": "{med} غير متوفر حاليًا. هل تريد أن أبحث عن بدائل بنفس المادة الفعالة؟",
        "hi": "{med} फिलहाल स्टॉक में उपलब्ध नहीं है। क्या मैं समान सक्रिय घटक वाले विकल्प खोजूँ?",
    },
    "greeting_named": {
        "en": "Hello {name}! Welcome to Mediloon. How can I help you today?",
        "de": "Hallo {name}! Willkommen bei Mediloon. Wie kann ich dir heute helfen?",
        "ar": "مرحباً {name}! أهلاً بك في Mediloon. كيف يمكنني مساعدتك اليوم؟",
        "hi": "नमस्ते {name}! Mediloon में स्वागत है। आज कैसे मदद कर सकता हूँ?",
    },
    "checkout_confirm_full": {
        "en": (
            "Order #{order_id} has been confirmed.\n\n"
            "Items: {items}\n"
            "Total: €{total:.2f}\n"
            "Delivery to: {address}\n"
            "Payment method: Cash on Delivery (COD)\n\n"
            "Your order has been placed and your account updated. Thank you for choosing Mediloon."
        ),
        "de": (
            "Bestellung #{order_id} wurde bestätigt.\n\n"
            "Artikel: {items}\n"
            "Gesamt: €{total:.2f}\n"
            "Lieferadresse: {address}\n"
            "Zahlungsart: Nachnahme (COD)\n\n"
            "Deine Bestellung wurde aufgegeben und dein Konto aktualisiert. Danke, dass du Mediloon nutzt."
        ),
        "ar": (
            "تم تأكيد الطلب رقم {order_id}.\n\n"
            "العناصر: {items}\n"
            "الإجمالي: €{total:.2f}\n"
            "التوصيل إلى: {address}\n"
            "طريقة الدفع: الدفع عند الاستلام (COD)\n\n"
            "تم تقديم طلبك وتحديث حسابك. شكرًا لاختيارك Mediloon."
        ),
        "hi": (
            "ऑर्डर #{order_id} कन्फर्म हो गया है।\n\n"
            "आइटम: {items}\n"
            "कुल: €{total:.2f}\n"
            "डिलीवरी पता: {address}\n"
            "भुगतान का तरीका: कैश ऑन डिलीवरी (COD)\n\n"
            "आपका ऑर्डर प्लेस हो गया है और आपका अकाउंट अपडेट हो गया है। Mediloon चुनने के लिए धन्यवाद।"
        ),
    },
    "checkout_confirm_tts": {
        "en": "Order number {order_id} confirmed. Payment is Cash on Delivery. Thank you for ordering with Mediloon.",
        "de": "Bestellung Nummer {order_id} bestätigt. Zahlung per Nachnahme. Danke für deine Bestellung bei Mediloon.",
        "ar": "تم تأكيد الطلب رقم {order_id}. طريقة الدفع عند الاستلام. شكرًا لطلبك من Mediloon.",
        "hi": "ऑर्डर नंबर {order_id} कन्फर्म हो गया है। भुगतान कैश ऑन डिलीवरी है। Mediloon से ऑर्डर करने के लिए धन्यवाद।",
    },
    "remove_empty": {
        "en": "Your cart is already empty.",
        "de": "Dein Warenkorb ist bereits leer.",
        "ar": "سلة التسوق فارغة بالفعل.",
        "hi": "आपका कार्ट पहले से खाली है।",
    },
    "order_limit_reached": {
        "en": "Sorry, you've reached the maximum of {max_items} different medicines per order. Would you like to checkout with what's in your cart, or remove an item first?",
        "de": "Du hast die maximale Anzahl von {max_items} verschiedenen Medikamenten pro Bestellung erreicht. Möchtest du mit dem aktuellen Warenkorb fortfahren oder zuerst einen Artikel entfernen?",
        "ar": "عذراً، لقد وصلت إلى الحد الأقصى وهو {max_items} أدوية مختلفة لكل طلب. هل تريد إتمام الشراء بما في السلة أو إزالة منتج أولاً؟",
        "hi": "माफ़ कीजिए, एक ऑर्डर में अधिकतम {max_items} अलग-अलग दवाइयाँ ही ली जा सकती हैं। क्या आप कार्ट में जो है उससे चेकआउट करना चाहेंगे, या पहले कोई आइटम हटाएं?",
    },
    "order_units_limit": {
        "en": "You've reached the order limit. Only {actual} of {qty} unit(s) were added ({product}). Maximum allowed: {max_units} total units per order.",
        "de": "Du hast das Bestelllimit erreicht. Nur {actual} von {qty} Einheit(en) wurden hinzugefügt ({product}). Maximum: {max_units} Einheiten pro Bestellung.",
        "ar": "لقد وصلت إلى حد الطلب. تمت إضافة {actual} فقط من {qty} وحدة للمنتج {product}. الحد الأقصى المسموح به: {max_units} وحدة لكل طلب.",
        "hi": "ऑर्डर लिमिट पहुँच गई है। {product} की {qty} में से सिर्फ {actual} यूनिट जोड़ी गई। प्रति ऑर्डर अधिकतम: {max_units} कुल यूनिट।",
    },
    "remove_not_found": {
        "en": "I couldn't find that item in your cart. Please tell me the exact item name.",
        "de": "Ich konnte diesen Artikel im Warenkorb nicht finden. Bitte nenne den genauen Namen.",
        "ar": "لم أجد هذا المنتج في سلة التسوق. من فضلك اذكر الاسم بدقة.",
        "hi": "मुझे यह आइटम आपके कार्ट में नहीं मिला। कृपया सही नाम बताएं।",
    },
    "remove_ambiguous": {
        "en": "I found multiple matching items in your cart: {items}. Which one should I remove?",
        "de": "Ich habe mehrere passende Artikel im Warenkorb gefunden: {items}. Welchen soll ich entfernen?",
        "ar": "وجدت عدة عناصر متطابقة في السلة: {items}. أي عنصر تريد حذفه؟",
        "hi": "मुझे आपके कार्ट में कई मिलते-जुलते आइटम मिले: {items}। इनमें से कौन-सा हटाऊँ?",
    },
    "remove_success": {
        "en": "Removed {med} from your cart. You now have {cart_items} item{cart_plural} in your cart. Anything else?",
        "de": "{med} wurde aus deinem Warenkorb entfernt. Du hast jetzt {cart_items} Artikel{cart_plural} im Warenkorb. Noch etwas?",
        "ar": "تمت إزالة {med} من سلة التسوق. لديك الآن {cart_items} منتج{cart_plural} في السلة. هل تريد شيئًا آخر؟",
        "hi": "{med} को कार्ट से हटा दिया गया है। अब आपके कार्ट में {cart_items} आइटम{cart_plural} हैं। क्या और कुछ चाहिए?",
    },
    "clarify_request": {
        "en": "I can help with that. Please tell me the medicine name or symptom you want to order for.",
        "de": "Ich kann dir dabei helfen. Nenne bitte den Medikamentennamen oder das Symptom.",
        "ar": "يمكنني مساعدتك. من فضلك اذكر اسم الدواء أو العرض الذي تبحث عنه.",
        "hi": "मैं आपकी मदद कर सकता हूँ। कृपया दवा का नाम या लक्षण बताएं।",
    },
    "rx_upload_or_remove": {
        "en": "{med} requires a valid prescription. To proceed you can:\n1. **Upload your prescription** (say \"upload prescription\" or use the upload button)\n2. **Remove {med} from your cart** and continue with other items\n\nWhich would you prefer?",
        "de": "{med} erfordert ein gültiges Rezept. Um fortzufahren, kannst du:\n1. **Dein Rezept hochladen** (sage \"Rezept hochladen\" oder nutze den Upload-Button)\n2. **{med} aus dem Warenkorb entfernen** und mit anderen Artikeln fortfahren\n\nWas möchtest du tun?",
        "ar": "{med} يتطلب وصفة طبية صالحة. للمتابعة يمكنك:\n1. **رفع الوصفة الطبية** (قل \"ارفع الوصفة\" أو استخدم زر الرفع)\n2. **إزالة {med} من سلة التسوق** والمتابعة مع العناصر الأخرى\n\nماذا تفضل؟",
        "hi": "{med} के लिए वैध प्रिस्क्रिप्शन ज़रूरी है। आगे बढ़ने के लिए आप:\n1. **प्रिस्क्रिप्शन अपलोड करें** (\"प्रिस्क्रिप्शन अपलोड\" बोलें या अपलोड बटन दबाएं)\n2. **{med} को कार्ट से हटाएं** और बाकी आइटम के साथ आगे बढ़ें\n\nआप क्या करना चाहेंगे?",
    },
    "rx_checkout_blocked": {
        "en": "Your cart contains prescription-only medicine(s): {meds}. Before checkout, please either:\n1. **Upload your prescription** for verification\n2. **Remove the prescription items** from your cart\n\nYou cannot proceed to checkout until this is resolved.",
        "de": "Dein Warenkorb enthält verschreibungspflichtige(s) Medikament(e): {meds}. Vor dem Checkout musst du:\n1. **Dein Rezept hochladen** zur Verifizierung\n2. **Die verschreibungspflichtigen Artikel entfernen**\n\nDu kannst nicht zur Kasse gehen, bis dies erledigt ist.",
        "ar": "سلة التسوق تحتوي على أدوية تحتاج وصفة طبية: {meds}. قبل الدفع، يرجى:\n1. **رفع الوصفة الطبية** للتحقق منها\n2. **إزالة الأدوية التي تحتاج وصفة** من السلة\n\nلا يمكنك المتابعة للدفع حتى يتم حل هذا الأمر.",
        "hi": "आपके कार्ट में प्रिस्क्रिप्शन वाली दवाइयाँ हैं: {meds}. चेकआउट से पहले कृपया:\n1. **प्रिस्क्रिप्शन अपलोड करें** सत्यापन के लिए\n2. **प्रिस्क्रिप्शन वाले आइटम हटाएं** कार्ट से\n\nजब तक यह हल नहीं होता, आप चेकआउट नहीं कर सकते।",
    },
    "rx_ask_upload": {
        "en": "{med} requires a prescription. Please upload your prescription image so I can verify it. Say \"upload prescription\" or use the upload button.",
        "de": "{med} ist verschreibungspflichtig. Bitte lade dein Rezept hoch, damit ich es überprüfen kann. Sage \"Rezept hochladen\" oder nutze den Upload-Button.",
        "ar": "{med} يحتاج وصفة طبية. يرجى رفع صورة الوصفة حتى أتمكن من التحقق منها. قل \"ارفع الوصفة\" أو استخدم زر الرفع.",
        "hi": "{med} के लिए प्रिस्क्रिप्शन ज़रूरी है। कृपया अपने प्रिस्क्रिप्शन की फोटो अपलोड करें ताकि मैं सत्यापित कर सकूँ। \"प्रिस्क्रिप्शन अपलोड\" बोलें या अपलोड बटन दबाएं।",
    },
}


def _localize(key: str, lang: str, **kwargs) -> str:
    variants = _L10N.get(key, {})
    lang_key = lang if lang in variants else "en"
    template = variants.get(lang_key) or variants.get("en") or ""
    try:
        return template.format(**kwargs)
    except Exception:
        return template


def _normalize_preferred_language(lang: str | None) -> Optional[str]:
    """Normalize frontend language tags to supported short codes."""
    if not lang:
        return None
    cleaned = str(lang).strip().replace("_", "-").lower()
    if not cleaned:
        return None
    base = cleaned.split("-")[0]
    return base if base in _SUPPORTED_RESPONSE_LANGS else None


def _detect_user_lang(user_input: str | None, state: Dict[str, Any]) -> str:
    """Detect user language from current input or recent history."""
    preferred = _normalize_preferred_language(state.get("preferred_language"))
    if preferred:
        return preferred
    if user_input:
        return _detect_script_language(user_input)
    history = state.get("conversation_history", [])
    for msg in reversed(history):
        if msg.get("role") == "user":
            return _detect_script_language(msg.get("content", ""))
    return "en"


def _force_ui_language(state: Dict[str, Any]) -> bool:
    """When UI selected language is known, prefer localized backend templates."""
    return _normalize_preferred_language(state.get("preferred_language")) is not None


def _availability_label(stock_qty: int | float | None, lang: str) -> str:
    """Localized availability text for list rows."""
    available = bool((stock_qty or 0) > 0)
    labels = {
        "en": ("Available", "Currently unavailable"),
        "de": ("Verfügbar", "Derzeit nicht verfügbar"),
        "ar": ("متوفر", "غير متوفر حاليا"),
        "hi": ("उपलब्ध", "फिलहाल उपलब्ध नहीं"),
    }
    yes, no = labels.get(lang, labels["en"])
    return yes if available else no


def _hard_script_mismatch(text: str | None, lang: str) -> bool:
    """
    Detect obvious language-script mismatch against selected UI language.
    We only enforce hard mismatches (Arabic/Devanagari scripts), not EN-vs-DE.
    """
    if not text:
        return False
    raw = text or ""
    has_arabic = any(
        ("\u0600" <= ch <= "\u06FF")
        or ("\u0750" <= ch <= "\u077F")
        or ("\u08A0" <= ch <= "\u08FF")
        for ch in raw
    )
    has_devanagari = any("\u0900" <= ch <= "\u097F" for ch in raw)

    if lang in {"en", "de"} and (has_arabic or has_devanagari):
        return True
    # Hindi/Arabic mode must stay in native script.
    if lang == "hi":
        return not has_devanagari
    if lang == "ar":
        return not has_arabic
    return False


def _prefer_llm_text(
    llm_text: str | None,
    fallback_text: str,
    lang: str,
    force_localized: bool,
) -> str:
    """
    Prefer LLM-authored text when present; fall back only when missing
    or clearly script-mismatched for forced language mode.
    """
    candidate = (llm_text or "").strip()
    if candidate and not (force_localized and _hard_script_mismatch(candidate, lang)):
        return candidate
    return fallback_text


def _prefer_llm_tts(
    llm_tts: str | None,
    llm_message: str | None,
    fallback_tts: str,
    lang: str,
    force_localized: bool,
) -> str:
    candidate = (llm_tts or llm_message or "").strip()
    if candidate and not (force_localized and _hard_script_mismatch(candidate, lang)):
        return candidate
    return fallback_tts


def _is_affirmative_response(text: str | None) -> bool:
    """Heuristic yes/confirm detector for checkout/RX confirmation turns."""
    if not text:
        return False
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return False

    # Exact short confirmations
    affirmative_exact = {
        "yes", "y", "ok", "okay", "sure", "confirm", "confirmed",
        "ja", "klar", "bestätigen",
        "haan", "ha", "han", "hanji", "ji", "theek hai", "thik hai",
        "yes please", "confirm please",
        "نعم", "أيوه", "ايوه", "أكيد", "اكيد", "تمام", "موافق", "تأكيد", "اوكي",
    }
    if cleaned in affirmative_exact:
        return True

    # Contained confirmation phrases
    affirmative_contains = [
        "i have prescription", "i have a prescription", "have prescription",
        "i do have", "yes i do", "go ahead", "place order",
        "mere paas prescription", "prescription hai",
        "confirm order", "order confirm",
        "habe ein rezept", "ich habe ein rezept",
        "عندي وصفة", "لدي وصفة", "معي وصفة",
    ]
    return any(p in cleaned for p in affirmative_contains)


def _is_repeat_add_request(text: str | None) -> bool:
    """Detect follow-up 'add more of the same' intent."""
    if not text:
        return False
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return False
    repeat_terms = [
        "more", "add more", "same", "again", "another", "extra",
        "one more", "2 more", "3 more", "10 more",
        "aur", "और", "phir", "dobara", "fir se",
        "mehr", "noch", "nochmal",
        "المزيد", "مرة أخرى", "مره اخرى", "كمان",
    ]
    return any(term in cleaned for term in repeat_terms)


def _extract_medicine_query_from_utterance(text: str | None) -> str:
    """Extract likely medicine query from ordering utterances."""
    if not text:
        return ""
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    import re as _re
    q = cleaned
    for pattern in [
        r'^i\s+want\s+to\s+(order|get|buy)\s+',
        r'^i\s+need\s+to\s+(order|get|buy)\s+',
        r'^i\s+(need|want)\s+',
        r'^(can\s+i|could\s+i|please)\s+(get|have|order)\s+(me\s+)?',
        r'^(give|get|order|buy)\s+me\s+',
        r'^(to\s+)?(order|buy|get)\s+',
        r'^(mujhe|mujhko)\s+',
        r'^(ich\s+möchte|ich\s+will|bitte)\s+',
    ]:
        q = _re.sub(pattern, '', q, flags=_re.IGNORECASE).strip()

    # keep only first line and trim punctuation/spaces
    q = q.splitlines()[0].strip(" \t\n\r.,!?\"'`“”‘’")
    return q


def _looks_like_order_intent(text: str | None) -> bool:
    if not text:
        return False
    t = (text or "").strip().lower()
    if not t:
        return False
    order_markers = [
        "order", "buy", "get", "need", "want", "bestellen", "mujhe", "chahiye",
        "أريد", "اطلب", "طلب",
    ]
    return any(m in t for m in order_markers)


def _is_not_found_style_message(text: str | None) -> bool:
    """Detect generic 'not found' wording that can conflict with real results."""
    if not text:
        return False
    t = (text or "").strip().lower()
    if not t:
        return False
    cues = [
        "couldn't find", "could not find", "not found", "no information",
        "no medication", "check the spelling", "double-check the spelling",
        "ich konnte", "nicht finden", "لم أجد", "لا أجد", "नहीं मिला",
    ]
    return any(c in t for c in cues)


def _extract_candidate_index(text: str | None) -> Optional[int]:
    """Extract 0-based candidate index from user text (e.g., 'second one', '2')."""
    if not text:
        return None
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return None

    import re as _re
    match = _re.search(r"\b(\d+)\b", cleaned)
    if match:
        idx = int(match.group(1)) - 1
        if idx >= 0:
            return idx

    ordinal_map = {
        "first": 0, "1st": 0, "pehla": 0, "erste": 0,
        "second": 1, "2nd": 1, "dusra": 1, "zweite": 1,
        "third": 2, "3rd": 2, "teesra": 2, "dritte": 2,
    }
    for token, idx in ordinal_map.items():
        if token in cleaned:
            return idx
    return None


_REMOVE_NOISE_TOKENS = {
    # English
    "remove", "delete", "drop", "discard", "from", "cart", "my", "the", "item", "items",
    "medicine", "medicines", "medication", "medications", "please",
    "tablet", "tablets", "unit", "units", "pack", "packs",
    # German
    "entfernen", "löschen", "loeschen", "warenkorb", "artikel", "bitte",
    "tablette", "tabletten", "einheit", "einheiten",
    # Hindi/Hinglish
    "hatao", "hatado", "nikalo", "nikal", "cart", "se", "mera", "meri", "ko",
    "dawai", "dawa", "dawaai", "item", "please",
    # Arabic
    "احذف", "امسح", "ازالة", "إزالة", "العنصر", "العناصر", "السلة", "من", "لو", "سمحت",
}


def _normalize_lookup_text(text: str | None) -> str:
    if not text:
        return ""
    import re as _re
    cleaned = _re.sub(r"[^\w\s]", " ", str(text).lower())
    return _re.sub(r"\s+", " ", cleaned).strip()


# ── Transliteration map for matching Hindi/Arabic/German phonetics to Latin ─
_TRANSLITERATION_MAP = {
    # ── Hindi (Devanagari) → Latin ──────────────────────────────────
    # Nurofen
    "न्यूरोपीन": "nurofen", "न्यूरोफेन": "nurofen", "नूरोफेन": "nurofen",
    "नुरोफेन": "nurofen", "न्यूरोफीन": "nurofen", "न्यूरोपिन": "nurofen",
    # Paracetamol
    "पैरासिटामोल": "paracetamol", "पेरासिटामोल": "paracetamol", "पैरासीटामोल": "paracetamol",
    # Ibuprofen / Brufen
    "आइबुप्रोफेन": "ibuprofen", "इबुप्रोफेन": "ibuprofen", "इबूप्रोफेन": "ibuprofen",
    "ब्रूफेन": "brufen", "ब्रुफेन": "brufen",
    # Cetirizin
    "सेटिरिज़ीन": "cetirizin", "सेटिरिज़िन": "cetirizin", "सेटरिज़िन": "cetirizin",
    "सेटिरिजीन": "cetirizin", "सेटिरिजिन": "cetirizin", "सिटिरिजिन": "cetirizin",
    # Omeprazole / Omez
    "ओमेप्राज़ोल": "omeprazole", "ओमेज़": "omez",
    # Pantoprazole / Pan D
    "पैंटोप्राज़ोल": "pantoprazole", "पैन डी": "pan d",
    # Aspirin
    "एस्पिरिन": "aspirin", "एस्प्रिन": "aspirin",
    # Metformin / Glycomet
    "मेटफॉर्मिन": "metformin", "ग्लाइकोमेट": "glycomet",
    # Losartan / Losar
    "लोसार्टन": "losartan", "लोसार": "losar",
    # Amlodipine / Amlong
    "एम्लोडिपीन": "amlodipine", "एमलॉन्ग": "amlong",
    # Sinupret
    "सिनुप्रेट": "sinupret", "साइनुप्रेट": "sinupret",
    # Mucosolvan
    "म्यूकोसॉल्वन": "mucosolvan", "म्युकोसोल्वन": "mucosolvan",
    # Iberogast
    "इबेरोगैस्ट": "iberogast", "इबरोगैस्ट": "iberogast",
    # DulcoLax
    "डल्कोलैक्स": "dulcolax", "डुलकोलैक्स": "dulcolax",
    # Loperamid
    "लोपेरामिड": "loperamid",
    # Vitasprint
    "विटास्प्रिंट": "vitasprint",
    # Minoxidil
    "मिनोक्सिडिल": "minoxidil",
    # Vigantolvit / Vitamin D
    "विगैंटोल्विट": "vigantolvit",
    # Calmvalera
    "कैल्मवलेरा": "calmvalera",
    # Eucerin
    "यूसेरिन": "eucerin",
    # Bepanthen
    "बिपैंथन": "bepanthen", "बीपैन्थेन": "bepanthen",
    # Panthenol
    "पैंथेनॉल": "panthenol",
    # Dolo 650
    "डोलो": "dolo",
    # Crocin
    "क्रोसिन": "crocin",
    # Generic terms
    "विटामिन": "vitamin",

    # ── Arabic → Latin ──────────────────────────────────────────────
    # Nurofen
    "نوروفين": "nurofen", "نوروفن": "nurofen", "نيوروفين": "nurofen",
    "نيوروبين": "nurofen", "نوروبين": "nurofen",
    # Paracetamol
    "باراسيتامول": "paracetamol", "بارسيتامول": "paracetamol",
    # Ibuprofen / Brufen
    "ايبوبروفين": "ibuprofen", "إيبوبروفين": "ibuprofen", "ابيوبروفين": "ibuprofen",
    "بروفين": "brufen",
    # Cetirizin
    "سيتريزين": "cetirizin", "سيتيريزين": "cetirizin",
    # Omeprazole / Omez
    "اوميبرازول": "omeprazole", "أوميبرازول": "omeprazole", "أوميز": "omez",
    # Aspirin
    "أسبرين": "aspirin", "اسبرين": "aspirin",
    # Metformin
    "ميتفورمين": "metformin",
    # Losartan
    "لوسارتان": "losartan",
    # Amlodipine
    "أملوديبين": "amlodipine", "املوديبين": "amlodipine",
    # Sinupret
    "سينوبريت": "sinupret",
    # Mucosolvan
    "ميوكوسولفان": "mucosolvan", "موكوسولفان": "mucosolvan",
    # Iberogast
    "ايبيروجاست": "iberogast", "إيبيروجاست": "iberogast",
    # DulcoLax
    "دولكولاكس": "dulcolax",
    # Loperamid
    "لوبيراميد": "loperamid",
    # Vitasprint
    "فيتاسبرينت": "vitasprint",
    # Minoxidil
    "مينوكسيديل": "minoxidil",
    # Bepanthen
    "بيبانثين": "bepanthen",
    # Panthenol
    "بانثينول": "panthenol",
    # Calmvalera
    "كالمفاليرا": "calmvalera",
    # Eucerin
    "يوسيرين": "eucerin",
    # Generic terms
    "فيتامين": "vitamin",

    # ── German phonetic misspellings / colloquial → canonical ───────
    # (German speakers might misspell or use colloquial forms)
    "nuhrofen": "nurofen", "nuerofen": "nurofen", "nurofeen": "nurofen",
    "paracetamohl": "paracetamol", "paracetemol": "paracetamol", "paracetamool": "paracetamol",
    "ibuprophen": "ibuprofen", "iboprofen": "ibuprofen", "ibuprohen": "ibuprofen",
    "cetiricin": "cetirizin", "zetirizin": "cetirizin", "cetirizien": "cetirizin",
    "omeprasol": "omeprazole", "omeprazol": "omeprazole",
    "pantoprasol": "pantoprazole", "pantoprazol": "pantoprazole",
    "dulkolax": "dulcolax", "dulcolaks": "dulcolax",
    "mukosolvan": "mucosolvan", "mukusolvan": "mucosolvan",
    "sinuprett": "sinupret",
    "vitasprinnt": "vitasprint", "vitasprint": "vitasprint",
    "beepanthen": "bepanthen", "bepanten": "bepanthen",
    "minoksidil": "minoxidil",
    "kalvalera": "calmvalera",
    "euzerin": "eucerin",
    "panthenohl": "panthenol",
}


def _transliterate_to_latin(text: str) -> str:
    """Convert known transliterated/misspelled drug names back to Latin equivalents."""
    import re as _re
    normalized = text.strip().lower()
    # Normalize Devanagari: ज़ (U+095B) is equivalent to ज + ़ (U+091C + U+093C)
    normalized = normalized.replace('\u095B', '\u091C\u093C')
    # Normalize duplicate nukta (U+093C) AFTER decomposition
    normalized = _re.sub('\u093C+', '\u093C', normalized)
    for native, latin in _TRANSLITERATION_MAP.items():
        # Also normalize the map key the same way for consistent matching
        native_norm = native.replace('\u095B', '\u091C\u093C')
        native_norm = _re.sub('\u093C+', '\u093C', native_norm)
        if native_norm in normalized:
            normalized = normalized.replace(native_norm, latin)
    return normalized


def _match_candidate_by_name(query: str, candidates: list[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Check if a search query matches an already-shown candidate by name.
    Handles transliterations (e.g., "न्यूरोपीन" → "Nurofen").
    Returns the matched candidate or None.
    """
    if not query or not candidates:
        return None

    # Normalize and transliterate the query
    query_lower = query.strip().lower()
    query_latin = _transliterate_to_latin(query_lower)

    for candidate in candidates:
        brand = (candidate.get("brand_name") or "").lower()
        generic = (candidate.get("generic_name") or "").lower()

        # Direct match (case-insensitive)
        if query_lower in brand or brand in query_lower:
            return candidate
        if generic and (query_lower in generic or generic in query_lower):
            return candidate

        # Transliterated match
        if query_latin != query_lower:  # transliteration happened
            if query_latin in brand or brand.startswith(query_latin):
                return candidate
            if generic and (query_latin in generic or generic.startswith(query_latin)):
                return candidate

        # Fuzzy: first 4+ chars match (covers typos like "nurof" → "nurofen")
        if len(query_latin) >= 4 and brand.startswith(query_latin[:4]):
            return candidate
        if len(query_lower) >= 4 and brand.startswith(query_lower[:4]):
            return candidate

    return None


def _tokenize_lookup_text(text: str | None) -> list[str]:
    normalized = _normalize_lookup_text(text)
    if not normalized:
        return []
    return [tok for tok in normalized.split() if len(tok) > 1 and tok not in _REMOVE_NOISE_TOKENS]


def _to_int_or_none(value: Any) -> Optional[int]:
    try:
        return int(value)
    except Exception:
        return None


def _extract_remove_query(args: Dict[str, Any], user_input: str | None) -> str:
    for key in ("item_name", "name", "med_name", "medication", "brand_name", "product_name", "query"):
        val = args.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return (user_input or "").strip()


def _resolve_cart_item_for_removal(
    items: list[Dict[str, Any]],
    args: Dict[str, Any],
    user_input: str | None,
) -> tuple[Optional[Dict[str, Any]], Optional[str], list[Dict[str, Any]]]:
    if not items:
        return None, "empty", []

    # 1) Explicit cart item id
    explicit_item_id = _to_int_or_none(args.get("cart_item_id") or args.get("item_id"))
    if explicit_item_id is not None:
        for item in items:
            if _to_int_or_none(item.get("cart_item_id")) == explicit_item_id:
                return item, None, []
        return None, "not_found", []

    # 2) Explicit medication id
    explicit_med_id = _to_int_or_none(args.get("med_id") or args.get("medication_id"))
    if explicit_med_id is not None:
        med_matches = [item for item in items if _to_int_or_none(item.get("medication_id")) == explicit_med_id]
        if len(med_matches) == 1:
            return med_matches[0], None, []
        if len(med_matches) > 1:
            return None, "ambiguous", med_matches

    # 3) Numbered selection ("remove second one")
    idx = _extract_candidate_index(user_input)
    if idx is not None and 0 <= idx < len(items):
        return items[idx], None, []

    # 4) Name-based matching
    query = _extract_remove_query(args, user_input)
    query_norm = _normalize_lookup_text(query)
    query_tokens = _tokenize_lookup_text(query)
    if query_norm and query_tokens:
        ranked: list[tuple[int, Dict[str, Any]]] = []
        for item in items:
            hay = " ".join(
                str(item.get(field, "") or "")
                for field in ("brand_name", "generic_name", "dosage", "form")
            )
            hay_norm = _normalize_lookup_text(hay)
            if not hay_norm:
                continue
            score = 0
            if query_norm == hay_norm:
                score += 200
            if query_norm in hay_norm:
                score += 80
            score += sum(15 for tok in query_tokens if tok in hay_norm)
            brand_norm = _normalize_lookup_text(item.get("brand_name"))
            if brand_norm and query_norm == brand_norm:
                score += 120
            if score > 0:
                ranked.append((score, item))
        ranked.sort(key=lambda pair: pair[0], reverse=True)
        if ranked:
            if len(ranked) == 1 or ranked[0][0] > ranked[1][0]:
                return ranked[0][1], None, []
            top_score = ranked[0][0]
            tied = [item for score, item in ranked if score == top_score]
            return None, "ambiguous", tied

    # 5) Single-item fallback
    if len(items) == 1:
        return items[0], None, []

    return None, "not_found", []


def _detect_ui_action_intent(user_input: str | None) -> Optional[str]:
    """Detect direct UI navigation intent from user text.

    Chooses the *last-mentioned* intent so compound requests like
    "show my orders, now open trace" resolve to trace.
    """
    if not user_input:
        return None

    text = (user_input or "").lower()

    intents = {
        "open_my_orders": [
            # English
            "my orders", "past orders", "order history", "previous orders",
            "my refills", "refill timeline", "view refills",
            # German
            "meine bestellungen", "bestellverlauf", "bestellhistorie", "nachfüllverlauf",
            # Arabic
            "طلباتي", "سجل الطلبات", "الطلبات السابقة",
            # Hindi / Hinglish
            "mere orders", "meri orders", "order history dikhao",
            "मेरे ऑर्डर", "ऑर्डर हिस्ट्री",
        ],
        "open_trace": [
            # English
            "agent trace", "trace", "show trace", "debug trace", "thought process",
            # German
            "agent trace öffnen", "zeige trace", "debug trace",
            # Arabic
            "افتح التتبع", "اعرض التتبع", "تتبع الوكيل",
            # Hindi / Hinglish
            "trace dikhao", "agent trace kholo", "ट्रेस दिखाओ",
        ],
        "open_cart": [
            # English
            "open cart", "my cart", "show cart", "shopping cart", "basket",
            # German
            "warenkorb", "warenkorb öffnen", "meinen warenkorb",
            # Arabic
            "افتح السلة", "سلة التسوق", "اعرض السلة",
            # Hindi / Hinglish
            "cart dikhao", "mera cart", "कार्ट दिखाओ",
        ],
        "open_upload_prescription": [
            # English
            "upload prescription", "add prescription", "start with prescription", "prescription upload", "start prescription",
            # German
            "rezept hochladen", "verschreibung hochladen", "mit rezept starten",
            # Arabic
            "ارفع الوصفة", "تحميل الوصفة", "أضف وصفة", "ابدأ بالوصفة",
            # Hindi / Hinglish
            "prescription upload", "prescription add", "start with prescription", "प्रिस्क्रिप्शन अपलोड", "प्रिस्क्रिप्शन से शुरू करें",
        ],
    }

    best_action = None
    best_pos = -1
    for action, phrases in intents.items():
        for p in phrases:
            idx = text.rfind(p)
            if idx > best_pos:
                best_pos = idx
                best_action = action

    return best_action if best_pos >= 0 else None


def _ui_action_message(action: str, lang: str) -> str:
    messages = {
        "open_my_orders": {
            "en": "Opening your past orders and refill timeline.",
            "de": "Ich öffne deine bisherigen Bestellungen und Nachfüllübersicht.",
            "ar": "أفتح الآن الطلبات السابقة وجدول إعادة التعبئة.",
            "hi": "मैं आपके पिछले ऑर्डर और रिफिल टाइमलाइन खोल रहा हूँ।",
        },
        "open_trace": {
            "en": "Opening the agent trace now.",
            "de": "Ich öffne jetzt den Agent-Trace.",
            "ar": "أفتح الآن تتبع الوكيل.",
            "hi": "मैं अभी एजेंट ट्रेस खोल रहा हूँ।",
        },
        "open_cart": {
            "en": "Opening your cart.",
            "de": "Ich öffne deinen Warenkorb.",
            "ar": "أفتح سلة التسوق الخاصة بك.",
            "hi": "मैं आपका कार्ट खोल रहा हूँ।",
        },
        "open_upload_prescription": {
            "en": "Opening prescription upload.",
            "de": "Ich öffne den Rezept-Upload.",
            "ar": "أفتح رفع الوصفة الطبية.",
            "hi": "मैं प्रिस्क्रिप्शन अपलोड खोल रहा हूँ।",
        },
        "close_modal": {
            "en": "Closing the current modal.",
            "de": "Ich schließe das aktuelle Fenster.",
            "ar": "أغلق النافذة الحالية.",
            "hi": "मैं वर्तमान विंडो बंद कर रहा हूँ।",
        },
    }
    by_lang = messages.get(action, messages["open_cart"])
    return by_lang.get(lang, by_lang["en"])


def validate_output_static(message: str) -> Dict[str, Any]:
    """Fast static check (~0 ms) for forbidden phrases in agent output."""
    if not message:
        return {"safe": True}
    msg_lower = message.lower()
    for p in FORBIDDEN_OUTPUT_PATTERNS:
        if p in msg_lower:
            return {
                "safe": False,
                "reason": f"forbidden_pattern:{p}",
                "message": (
                    "I'm happy to help you order your medications, but for "
                    "dosage guidance or medical advice please consult your "
                    "doctor. Is there anything else I can help with?"
                ),
            }
    return {"safe": True}


# ── Langfuse init ───────────────────────────────────────────────────────
_langfuse_initialized = init_langfuse()


# ── Session helpers ─────────────────────────────────────────────────────
def get_session_state(session_id: str) -> Dict[str, Any]:
    """Get or create session state."""
    if session_id not in _conversation_states:
        _conversation_states[session_id] = {
            "customer_id": None,
            "preferred_language": None,
            "candidates": [],
            "selected_medication": None,
            "last_added_medication": None,
            "pending_rx_check": None,
            "pending_qty_dose_check": None,
            "pending_add_confirm": None,
            "pending_checkout_confirm": None,
            "pending_checkout_address": None,
            "collected_quantity": None,
            "collected_dose": None,
            "cart": {"items": [], "item_count": 0},
            "last_action": None,
            "turn_count": 0,
            "conversation_history": [],
            "search_cache": {},
            "rx_verified_med_ids": set(),
        }
    return _conversation_states[session_id]


def update_session_state(session_id: str, updates: Dict[str, Any]):
    """Merge updates into session state."""
    state = get_session_state(session_id)
    state.update(updates)
    _conversation_states[session_id] = state


# ── Main pipeline ───────────────────────────────────────────────────────
async def process_message(
    session_id: str,
    user_input: str,
    customer_id: Optional[int] = None,
    preferred_language: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process a single user turn through the full pipeline.

    1. Safety check (input guard)
    2. Ordering agent (fast path or single LLM call)
    3. Execute returned action (tool calls, state mutations)
    4. Output guard
    5. Return response
    """
    start_time = time.time()

    if not session_id:
        session_id = str(uuid.uuid4())

    state = get_session_state(session_id)
    if customer_id:
        state["customer_id"] = customer_id
    normalized_pref_lang = _normalize_preferred_language(preferred_language)
    if normalized_pref_lang:
        state["preferred_language"] = normalized_pref_lang
    state["turn_count"] += 1

    # Pre-fetch user intelligence and customer profile on first turn
    if state["turn_count"] == 1 or (customer_id and not state.get("customer_name")):
        try:
            from services.user_intelligence_service import get_user_refill_patterns
            from db.database import execute_query
            
            c_id = state.get("customer_id") or 2
            
            # Fetch user name for personalized greetings
            user_res = await execute_query("SELECT name FROM customers WHERE id = ?", (c_id,))
            if user_res and user_res[0].get("name"):
                state["customer_name"] = user_res[0]["name"]
                
            insights = await get_user_refill_patterns(c_id)
            if insights:
                state["user_insights"] = insights
                log_trace(session_id, "user_insights", insights)
        except Exception as e:
            print(f"Error fetching user profile/insights: {e}")

    # Langfuse trace
    trace = create_trace(
        name="agent_turn",
        session_id=session_id,
        metadata={"user_input": user_input, "turn": state["turn_count"]},
    )
    trace_id = trace.id if trace else None
    trace_url = get_trace_url(trace_id) if trace_id else None

    # ── Step 1: Input safety ────────────────────────────────────────
    with TracedOperation(trace, "safety_check", "span") as op:
        safety = await check_input_safety(user_input)
        op.log_input({"user_input": user_input})
        op.log_output(safety)

    log_trace(session_id, "safety_check", {
        "source": "Orchestrator", "target": "SafetyAgent",
        "action": "validate_input", "input": user_input, "result": safety,
    })

    if not safety.get("safe", True):
        # Add to history so context is preserved
        state.setdefault("conversation_history", []).append(
            {"role": "user", "content": user_input}
        )
        state["conversation_history"].append(
            {"role": "assistant", "content": safety["message"]}
        )
        flush()
        return {
            "session_id": session_id,
            "message": safety["message"],
            "tts_message": safety["message"],
            "language": _detect_user_lang(user_input, state),
            "blocked": True,
            "reason": safety.get("reason"),
            "trace": get_trace(session_id),
            "trace_id": trace_id,
            "trace_url": trace_url,
            "latency_ms": int((time.time() - start_time) * 1000),
        }

    # ── Step 1.5a: Prescription file fast-path (bypass LLM) ─────────
    _rx_match = re.match(r"(?i)please analyze this prescription file:\s*(.+)", user_input)
    if _rx_match:
        raw_payload = _rx_match.group(1).strip()
        # Parse inline base64 if present: "filepath |BASE64:mime:data"
        _b64_marker = "|BASE64:"
        image_base64 = None
        mime_type = None
        file_path = raw_payload
        if _b64_marker in raw_payload:
            file_path, b64_part = raw_payload.split(_b64_marker, 1)
            file_path = file_path.strip()
            # b64_part = "image/jpeg:<base64data>"
            if ":" in b64_part:
                mime_type, image_base64 = b64_part.split(":", 1)
            else:
                image_base64 = b64_part
        log_trace(session_id, "prescription_intercept", {"file_path": file_path, "has_base64": bool(image_base64)})
        rx_args = {"file_path": file_path}
        if image_base64:
            rx_args["image_base64"] = image_base64
            rx_args["mime_type"] = mime_type or "image/jpeg"
        rx_result = await _handle_prescription_upload(
            session_id, rx_args, state
        )
        # Add to conversation history (strip base64 data to save memory)
        history = state.setdefault("conversation_history", [])
        clean_input = re.sub(r"\s*\|BASE64:[^\s]*", "", user_input)  # strip inline base64
        history.append({"role": "user", "content": clean_input})
        history.append({"role": "assistant", "content": rx_result.get("message", "")})
        if len(history) > 20:
            state["conversation_history"] = history[-20:]
        flush()
        return {
            "session_id": session_id,
            "message": rx_result.get("message", ""),
            "tts_message": rx_result.get("tts_message", rx_result.get("message", "")),
            "language": _detect_user_lang(user_input, state),
            "candidates": rx_result.get("candidates", []),
            "cart": rx_result.get("cart", await get_cart(session_id)),
            "action_taken": rx_result.get("action_taken", "prescription_processed"),
            "needs_input": True,
            "trace": get_trace(session_id),
            "trace_id": trace_id,
            "trace_url": trace_url,
            "latency_ms": int((time.time() - start_time) * 1000),
        }

    # ── Step 1.5b: UI navigation fast-path (no LLM needed) ───────────
    ui_candidate = _detect_ui_action_intent(user_input)
    if ui_candidate:
        validated = validate_ui_action(ui_candidate).get("action")
        if validated and validated != "none":
            lang = _detect_user_lang(user_input, state)
            ui_msg = _ui_action_message(validated, lang)

            history = state.setdefault("conversation_history", [])
            history.append({"role": "user", "content": user_input})
            history.append({"role": "assistant", "content": ui_msg})
            if len(history) > 20:
                state["conversation_history"] = history[-20:]

            flush()
            return {
                "session_id": session_id,
                "message": ui_msg,
                "tts_message": ui_msg,
                "language": _detect_user_lang(user_input, state),
                "candidates": state.get("candidates", []),
                "cart": state.get("cart", await get_cart(session_id)),
                "action_taken": "ui_action",
                "ui_action": validated,
                "needs_input": True,
                "end_conversation": False,
                "trace": get_trace(session_id),
                "trace_id": trace_id,
                "trace_url": trace_url,
                "latency_ms": int((time.time() - start_time) * 1000),
            }

    # ── Step 2: Ordering agent (fast path or LLM) ──────────────────
    # Pass trace_id to agent for LLM observability
    state["trace_id"] = trace_id
    
    with TracedOperation(trace, "ordering_agent", "generation") as op:
        op.log_input({"user_input": user_input, "state_summary": _state_summary(state)})
        agent_result = await ordering_agent_handle(user_input, state)
        op.log_output(agent_result)

    log_trace(session_id, "ordering_agent", {
        "source": "Orchestrator", "target": "OrderingAgent",
        "action": agent_result.get("action", "respond"),
        "fast_path": agent_result.get("fast_path", False),
        "reasoning": agent_result.get("reasoning", ""),
        "model": agent_result.get("_model_used", "fast_path"),
        "input": user_input,
    })

    # Add user message to history
    history = state.setdefault("conversation_history", [])
    history.append({"role": "user", "content": user_input})
    if len(history) > 20:
        state["conversation_history"] = history[-20:]

    # ── Step 3: Execute action ──────────────────────────────────────
    with TracedOperation(trace, "execute_action", "span") as op:
        op.log_input({"agent_result": agent_result})
        result = await execute_action(session_id, agent_result, state, user_input)
        op.log_output(result)

    log_trace(session_id, "execute", {
        "source": "Orchestrator", "target": "ToolExecutor",
        "action": agent_result.get("action"),
        "result_action": result.get("action_taken"),
    })

    # ── Step 3.5: Inject personalized greeting on first turn ───────
    customer_name = state.get("customer_name")
    if customer_name and state["turn_count"] == 1:
        lang = _detect_user_lang(user_input, state)
        msg = result.get("message", "")
        tts = result.get("tts_message", "")
        # Check if LLM already included ANY part of the name (first or full)
        name_lower = customer_name.lower()
        first_name = name_lower.split()[0] if name_lower else name_lower
        msg_lower = (msg or "").lower()
        already_greeted = first_name in msg_lower or name_lower in msg_lower
        if not already_greeted:
            greeting = _localize("greeting_named", lang, name=customer_name)
            result["message"] = f"{greeting}\n\n{msg}" if msg else greeting
            result["tts_message"] = f"{greeting} {tts}" if tts else greeting
        elif any(w in msg_lower for w in ["welcome", "willkommen", "مرحب", "स्वागत", "hello", "hallo"]):
            # LLM already included a greeting with the name — strip redundant orchestrator greeting
            # Just use the LLM's response as-is
            pass

    # Add assistant response to history
    assistant_msg = result.get("message", "")
    if assistant_msg:
        state["conversation_history"].append({"role": "assistant", "content": assistant_msg})

    flush()

    # ── Step 4: Output guard ────────────────────────────────────────
    output_safety = validate_output_static(result.get("message", ""))
    if not output_safety.get("safe", True):
        log_trace(session_id, "output_guardrail_block", {
            "original": result["message"],
            "reason": output_safety.get("reason"),
        })
        result["message"] = output_safety["message"]
        result["tts_message"] = "I cannot provide that information for safety reasons."

    # ── Step 4.5: Persist trace to DB for observability dashboard ───
    try:
        from db.database import execute_write
        import json
        await execute_write(
            """INSERT INTO traces (trace_id, session_id, name, input_text, output_text, metadata_json, latency_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                trace_id or str(uuid.uuid4()),
                session_id,
                "agent_turn",
                user_input,
                result.get("message", ""),
                json.dumps({
                    "turn": state["turn_count"],
                    "action_taken": result.get("action_taken"),
                    "candidates_count": len(result.get("candidates", [])),
                    "cart_items": result.get("cart", {}).get("item_count", 0),
                    "retrieved_context": state.get("candidates", [])[:3],  # for RAG eval
                }),
                int((time.time() - start_time) * 1000),
            )
        )
    except Exception as e:
        print(f"Warning: Failed to persist trace to DB: {e}")

    # ── Step 5: Build response ──────────────────────────────────────
    latency_ms = int((time.time() - start_time) * 1000)

    return {
        "session_id": session_id,
        "message": result.get("message", ""),
        "tts_message": result.get("tts_message", result.get("message", "")),
        "language": _detect_user_lang(user_input, state),
        "candidates": result.get("candidates", []),
        "cart": result.get("cart", await get_cart(session_id)),
        "action_taken": result.get("action_taken"),
        "ui_action": result.get("ui_action"),
        "needs_input": result.get("needs_input", True),
        "end_conversation": result.get("end_conversation", False),
        "trace": get_trace(session_id),
        "trace_id": trace_id,
        "trace_url": trace_url,
        "latency_ms": latency_ms,
    }


# ── Action executor ─────────────────────────────────────────────────────
async def execute_action(
    session_id: str,
    plan: Dict[str, Any],
    state: Dict[str, Any],
    user_input: str | None = None,
) -> Dict[str, Any]:
    """Execute the action returned by the ordering agent."""
    lang = _detect_user_lang(user_input, state)
    force_localized = _force_ui_language(state)
    action = plan.get("action", "respond")

    # ── Guard: avoid LLM-only false "not found" responses on order intent ──
    # If the model returned a plain response while user appears to be ordering a
    # medicine, force a real catalog lookup against live DB/vector tools.
    if action == "respond" and _looks_like_order_intent(user_input):
        query = _extract_medicine_query_from_utterance(user_input)
        # Ignore known non-search control intents
        ql = (query or "").lower()
        if query and ql not in {"checkout", "cancel", "stop", "help"}:
            plan = dict(plan)
            plan["action"] = "tool_call"
            plan["tool"] = "vector_search"
            plan["tool_args"] = {"name": query}
            action = "tool_call"

    # ── Map hallucinated tool actions to tool_call ──────────────────
    legacy_tool_actions = [
        "add_to_cart", "vector_search", "lookup_by_indication", 
        "get_inventory", "get_tier1_alternatives", "remove_from_cart",
        "remove_item", "delete_from_cart",
        "upload_prescription", "analyze_prescription", "ocr",
        "process_prescription", "scan_prescription",
    ]
    _prescription_tool_aliases = {
        "analyze_prescription", "ocr", "process_prescription", "scan_prescription",
    }
    if action in legacy_tool_actions:
        if action in _prescription_tool_aliases:
            plan["tool"] = "upload_prescription"
        elif action in {"remove_item", "delete_from_cart"}:
            plan["tool"] = "remove_from_cart"
        else:
            plan["tool"] = action
        action = "tool_call"

    # Also catch hallucinated tool names inside tool_call
    if action == "tool_call" and plan.get("tool") in _prescription_tool_aliases:
        plan["tool"] = "upload_prescription"
        
    # ── tool_call ───────────────────────────────────────────────────
    if action == "tool_call":
        return await execute_tool_call(session_id, plan, state, lang, user_input=user_input)

    # ── ui_action ───────────────────────────────────────────────────
    if action == "ui_action":
        requested = plan.get("ui_action")
        validated = validate_ui_action(requested).get("action")
        if validated and validated != "none":
            default_ui_msg = _ui_action_message(validated, lang)
            ui_msg = _prefer_llm_text(plan.get("message"), default_ui_msg, lang, force_localized)
            ui_tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), ui_msg, lang, force_localized)
            return {
                "message": ui_msg,
                "tts_message": ui_tts,
                "action_taken": "ui_action",
                "ui_action": validated,
                "needs_input": True,
            }
        return {
            "message": plan.get("message", "I couldn't perform that UI action."),
            "tts_message": plan.get("tts_message", "I couldn't perform that action."),
            "action_taken": "respond",
            "needs_input": True,
        }

    # ── ask_rx ──────────────────────────────────────────────────────
    if action == "ask_rx":
        med = plan.get("medication") or {}
        # Resolve medication from session state if LLM didn't provide ID
        if not med.get("id"):
            med = (
                state.get("selected_medication")
                or state.get("pending_rx_check")
                or (state.get("candidates", [{}])[0] if state.get("candidates") else {})
            ) or med
        med_id = med.get("id")
        rx_verified_ids = state.get("rx_verified_med_ids", set())
        # If this specific medicine is already prescription-verified, skip the gate
        if med_id and med_id in rx_verified_ids:
            # Redirect to add_to_cart since RX is already verified for this med
            plan = dict(plan)
            plan["action"] = "tool_call"
            plan["tool"] = "add_to_cart"
            plan["tool_args"] = {
                "med_id": med_id,
                "qty": plan.get("quantity") or 1,
                "dose": plan.get("dose"),
            }
            return await execute_tool_call(session_id, plan, state, lang, user_input=user_input)
        update_session_state(session_id, {
            "pending_rx_check": med or None,
            "selected_medication": med or None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        # Ask user to upload prescription — don't just ask "do you have one?"
        default_msg = _localize("rx_ask_upload", lang, med=med.get("brand_name", "This medication"))
        msg = _prefer_llm_text(plan.get("message"), default_msg, lang, force_localized)
        tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), default_msg, lang, force_localized)
        return {
            "message": msg,
            "tts_message": tts,
            "action_taken": "ask_rx",
            "ui_action": "open_upload_prescription",
            "needs_input": True,
        }

    # ── ask_quantity ────────────────────────────────────────────────
    if action == "ask_quantity":
        med = plan.get("medication") or {}
        # Resolve medication from session state if LLM didn't provide ID
        if not med.get("id"):
            med = (
                state.get("selected_medication")
                or state.get("pending_add_confirm")
                or state.get("pending_qty_dose_check")
                or (state.get("candidates", [{}])[0] if state.get("candidates") else {})
            ) or med
        update_session_state(session_id, {
            "pending_qty_dose_check": med or None,
            "selected_medication": med or None,
            "pending_add_confirm": None,
            "pending_rx_check": None,
            "collected_quantity": plan.get("quantity", 1),
            "collected_dose": plan.get("dose"),
        })
        default_msg = _localize("ask_quantity", lang, med=med.get("brand_name", "this medication"))
        msg = _prefer_llm_text(plan.get("message"), default_msg, lang, force_localized)
        tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized)
        return {
            "message": msg,
            "tts_message": tts,
            "action_taken": "ask_quantity",
            "needs_input": True,
        }

    # ── ask_dose ────────────────────────────────────────────────────
    if action == "ask_dose":
        med = plan.get("medication") or {}
        # Resolve medication from session state if LLM didn't provide ID
        if not med.get("id"):
            med = (
                state.get("selected_medication")
                or state.get("pending_qty_dose_check")
                or (state.get("candidates", [{}])[0] if state.get("candidates") else {})
            ) or med
        qty = plan.get("quantity", 1)
        update_session_state(session_id, {
            "pending_qty_dose_check": med or None,
            "collected_quantity": qty,
        })
        default_msg = _localize("ask_dose", lang, med=med.get("brand_name", "this medication"))
        msg = _prefer_llm_text(plan.get("message"), default_msg, lang, force_localized)
        tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized)
        return {
            "message": msg,
            "tts_message": tts,
            "action_taken": "ask_dose",
            "needs_input": True,
        }

    # ── checkout / confirm_checkout ──────────────────────────────────
    if action in ("checkout", "confirm_checkout"):
        # ── RX GATE: Block checkout if cart has unverified prescription items ──
        cart_data = await get_cart(session_id)
        cart_items = cart_data.get("items", [])
        rx_verified_ids = state.get("rx_verified_med_ids", set())
        if cart_items:
            # Check each cart item individually for unverified RX requirement
            unverified_rx_items = []
            for item in cart_items:
                item_med_id = item.get("medication_id") or item.get("product_catalog_id")
                # Look up the actual product to check rx_required
                if item_med_id:
                    item_details = await get_medication_details(item_med_id)
                    if item_details and item_details.get("rx_required"):
                        if item_med_id not in rx_verified_ids:
                            unverified_rx_items.append(
                                item.get("brand_name") or item.get("product_name") or item_details.get("brand_name", "Unknown")
                            )
            if unverified_rx_items:
                rx_meds_str = ", ".join(unverified_rx_items)
                block_msg = _localize("rx_checkout_blocked", lang, meds=rx_meds_str)
                return {
                    "message": block_msg,
                    "tts_message": block_msg,
                    "cart": cart_data,
                    "action_taken": "checkout_rx_blocked",
                    "ui_action": "open_upload_prescription",
                    "needs_input": True,
                }

        # Search ALL recent conversation history for a delivery address
        delivery_address = state.get("pending_checkout_address")
        history = state.get("conversation_history", [])
        if not delivery_address:
            import re as _re
            for msg in reversed(history):
                if msg.get("role") == "user":
                    content = msg.get("content", "")
                    lower = content.lower()
                    if "deliver to:" in lower or "delivery address" in lower:
                        addr_match = _re.search(
                            r'deliver(?:y\s+address)?\s*(?:to)?\s*:?\s*(.+)',
                            content, _re.IGNORECASE | _re.DOTALL,
                        )
                        delivery_address = addr_match.group(1).strip() if addr_match else content
                        break

        # Execute checkout only when we have a delivery address.
        should_execute = bool(delivery_address)

        if should_execute:
            if delivery_address:
                update_session_state(session_id, {"pending_checkout_address": delivery_address})

            customer_id = state.get("customer_id") or 2
            result = await checkout(session_id, customer_id=customer_id, delivery_address=delivery_address)
            if result.get("error"):
                empty_msg = _localize("checkout_empty", lang)
                return {
                    "message": empty_msg,
                    "tts_message": empty_msg,
                    "action_taken": "checkout_failed",
                    "needs_input": True,
                }

            # Build final COD order confirmation message
            order_id = result.get("order_id", "N/A")
            items_summary = ", ".join(
                f"{item.get('brand_name', 'Item')} x{item.get('quantity', 1)}"
                for item in result.get("items", [])
            )
            total = result.get("total", 0)
            addr_display = delivery_address or "your registered address"

            default_confirm_msg = _localize(
                "checkout_confirm_full",
                lang,
                order_id=order_id,
                items=items_summary,
                total=float(total or 0),
                address=addr_display,
            )
            confirm_msg = _prefer_llm_text(
                plan.get("message"),
                default_confirm_msg,
                lang,
                force_localized,
            )
            default_tts_msg = _localize("checkout_confirm_tts", lang, order_id=order_id)
            tts_msg = _prefer_llm_tts(
                plan.get("tts_message"),
                plan.get("message"),
                default_tts_msg,
                lang,
                force_localized,
            )

            # Clear checkout state
            update_session_state(session_id, {
                "pending_checkout_address": None,
                "pending_checkout_confirm": None,
            })

            return {
                "message": confirm_msg,
                "tts_message": tts_msg,
                "action_taken": "checkout",
                "order": result,
                "end_conversation": True,
            }
        else:
            # No address yet — signal frontend to run login → address → checkout flow
            cart_data = await get_cart(session_id)
            if not cart_data.get("items"):
                empty_msg = _localize("checkout_empty", lang)
                return {
                    "message": empty_msg,
                    "tts_message": empty_msg,
                    "action_taken": "checkout_failed",
                    "needs_input": True,
                }
            # Mark checkout as pending so next confirmation closes the loop
            update_session_state(session_id, {"pending_checkout_confirm": True})
            start_msg = _localize("checkout_start", lang)
            msg = _prefer_llm_text(plan.get("message"), start_msg, lang, force_localized)
            tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized)
            return {
                "message": msg,
                "tts_message": tts,
                "cart": cart_data,
                "action_taken": "checkout_ready",
                "needs_input": True,
            }

    # ── end / cancel ────────────────────────────────────────────────
    if action == "end":
        await clear_cart(session_id)
        update_session_state(session_id, {
            "candidates": [],
            "pending_rx_check": None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
            "selected_medication": None,
            "last_added_medication": None,
        })
        return {
            "message": plan.get("message", "Session cleared."),
            "tts_message": plan.get("tts_message", plan.get("message")),
            "action_taken": "end",
            "end_conversation": True,
        }

    # ── default: respond ────────────────────────────────────────────
    default_msg = _localize("clarify_request", lang)
    msg = _prefer_llm_text(plan.get("message"), default_msg, lang, force_localized)
    tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized)
    return {
        "message": msg,
        "tts_message": tts,
        "action_taken": "respond",
        "needs_input": True,
    }


# ── Tool executor ───────────────────────────────────────────────────────
async def _llm_not_found_response(
    session_id: str,
    query: str,
    user_input: str | None,
    state: Dict[str, Any],
    lang: str,
    force_localized: bool,
    search_type: str = "name",  # "name" or "indication"
) -> Dict[str, Any]:
    """
    When a medicine search returns no results, do a follow-up LLM call
    with the 'not found' context injected so the agent generates a warm,
    natural response rather than a stiff hardcoded template.
    """
    suggestions = await suggest_similar_medications(query, limit=3)

    # Track repeated misses to avoid same answer loop
    q_norm = (query or "").strip().lower()
    if state.get("last_not_found_query") == q_norm:
        state["not_found_repeat_count"] = int(state.get("not_found_repeat_count", 0)) + 1
    else:
        state["last_not_found_query"] = q_norm
        state["not_found_repeat_count"] = 1
    repeat_count = int(state.get("not_found_repeat_count", 1))

    suggestions_line = ""
    if suggestions:
        lead_by_lang = {
            "en": "Did you mean",
            "de": "Meintest du vielleicht",
            "ar": "هل تقصد",
            "hi": "क्या आपका मतलब यह था",
        }
        lead = lead_by_lang.get(lang, lead_by_lang["en"])
        suggestions_line = f"\n\n{lead}: {', '.join(suggestions)}?"

    # Build a synthetic tool-result message to inject into conversation
    if search_type == "indication":
        tool_result_content = (
            f"[TOOL RESULT] lookup_by_indication(\"{query}\") returned NO results. "
            f"There are no medications in our catalog matching the indication/condition '{query}'."
        )
        fallback = _localize("lookup_empty", lang, indication=query)
    else:
        tool_result_content = (
            f"[TOOL RESULT] vector_search(\"{query}\") returned NO results. "
            f"There is no medication called '{query}' (or anything phonetically similar) in our catalog. "
            f"This name does not exist in our inventory — it may be misspelled, a fictional name, or simply not carried."
        )
        fallback = _localize("search_empty", lang, name=query)

    if suggestions:
        tool_result_content += f" Suggest these close matches to the user: {', '.join(suggestions)}."
        fallback = f"{fallback}{suggestions_line}"

    if repeat_count >= 2 and not suggestions:
        reinforce_by_lang = {
            "en": "I still can't find that name. Please share the active ingredient or your symptom (for example: fever, cold, allergy).",
            "de": "Ich finde diesen Namen weiterhin nicht. Bitte nenne den Wirkstoff oder dein Symptom (z. B. Fieber, Erkältung, Allergie).",
            "ar": "ما زلت لا أجد هذا الاسم. من فضلك اذكر المادة الفعالة أو العرض (مثل: حمى، زكام، حساسية).",
            "hi": "मुझे यह नाम अभी भी नहीं मिल रहा है। कृपया सक्रिय घटक या लक्षण बताएं (जैसे: बुखार, सर्दी, एलर्जी)।",
        }
        fallback = reinforce_by_lang.get(lang, reinforce_by_lang["en"])

    # Temporarily inject the tool result into history, call the LLM, then clean up
    history = state.setdefault("conversation_history", [])
    injected = {"role": "system", "content": tool_result_content}
    history.append(injected)

    try:
        # The original user_input drives the LLM to know what it was asked
        llm_result = await ordering_agent_handle(user_input or query, state)
    except Exception:
        llm_result = {}
    finally:
        # Remove the injected message to keep history clean
        if injected in history:
            history.remove(injected)

    msg = (llm_result.get("message") or "").strip()
    tts = (llm_result.get("tts_message") or "").strip()

    # Validate the LLM response makes sense — if it tries to do a tool_call or
    # another search, fall back to the template to avoid infinite loops.
    if not msg or llm_result.get("action") == "tool_call":
        msg = fallback
        tts = fallback
    elif suggestions and not any(s.lower() in msg.lower() for s in suggestions):
        msg = f"{msg}{suggestions_line}"
        if not tts:
            tts = msg

    return {"message": msg, "tts_message": tts or msg}


async def execute_tool_call(
    session_id: str,
    plan: Dict[str, Any],
    state: Dict[str, Any],
    lang: str,
    user_input: str | None = None,
) -> Dict[str, Any]:
    """Execute a tool call from the agent's plan."""
    tool = plan.get("tool")
    if tool in {"remove_item", "delete_from_cart"}:
        tool = "remove_from_cart"
    args = plan.get("tool_args", {})
    force_localized = _force_ui_language(state)

    log_trace(session_id, "tool_call", {
        "source": "Orchestrator", "target": f"Tool:{tool}",
        "args": args,
    })

    # ── lookup_by_indication ────────────────────────────────────────
    if tool == "lookup_by_indication":
        indication = args.get("indication", "")

        # ── Guard: if candidates are already shown and indication matches one,
        #    treat this as a candidate SELECTION, not a new search. ──────
        candidates = state.get("candidates", [])
        if candidates and indication:
            matched_candidate = _match_candidate_by_name(indication, candidates)
            if matched_candidate:
                plan = dict(plan)
                plan["tool"] = "add_to_cart"
                plan["tool_args"] = {
                    "med_id": matched_candidate["id"],
                    "qty": plan.get("quantity") or 1,
                    "dose": plan.get("dose"),
                }
                return await execute_tool_call(session_id, plan, state, lang, user_input=user_input)

        results = state.get("search_cache", {}).get(f"ind:{indication}")
        if not results:
            results = await lookup_by_indication(indication)
            if not results:
                results = await vector_search(indication)
            if results:
                state.setdefault("search_cache", {})[f"ind:{indication}"] = results
        if not results:
            not_found_result = await _llm_not_found_response(
                session_id, indication, user_input, state, lang, force_localized,
                search_type="indication"
            )
            return {
                "message": not_found_result.get("message", _localize("lookup_empty", lang, indication=indication)),
                "tts_message": not_found_result.get("tts_message", not_found_result.get("message", "")),
                "candidates": [],
                "action_taken": "lookup_empty",
            }
        update_session_state(session_id, {
            "candidates": results,
            "pending_rx_check": None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
        })
        def _fmt(i, m):
            dosage = (m.get('dosage') or '').strip()
            name = f"{m['brand_name']} ({dosage})" if dosage else m['brand_name']
            price = float(m.get('price', 0))
            stock = m.get('stock_quantity', 0)
            return f"{i+1}. {name} — \u20ac{price:.2f} — {_availability_label(stock, lang)}"
        med_list = "\n".join(_fmt(i, m) for i, m in enumerate(results[:5]))
        # Always build the real medication list — never trust the LLM's placeholder message
        lead_default = _localize("indication_lead", lang, indication=indication)
        llm_msg = plan.get("message")
        lead = lead_default if _is_not_found_style_message(llm_msg) else _prefer_llm_text(llm_msg, lead_default, lang, force_localized)
        select_prompt = _localize("select_prompt", lang)
        msg = f"{lead}\n{med_list}\n\n{select_prompt}"
        # TTS includes the indication name so user hears what was found
        tts_default = _localize("indication_search_tts", lang, indication=indication)
        tts = _prefer_llm_tts(plan.get("tts_message"), None, tts_default, lang, force_localized)
        return {
            "message": msg,
            "tts_message": tts,
            "candidates": results[:5],
            "action_taken": "lookup_indication",
        }

    # ── vector_search ───────────────────────────────────────────────
    if tool == "vector_search":
        name = args.get("name", "")

        # ── Guard: if candidates are already shown and query matches one,
        #    treat this as a candidate SELECTION, not a new search. ──────
        candidates = state.get("candidates", [])
        if candidates and name:
            matched_candidate = _match_candidate_by_name(name, candidates)
            if matched_candidate:
                # Redirect to add_to_cart with the matched candidate
                plan = dict(plan)
                plan["tool"] = "add_to_cart"
                plan["tool_args"] = {
                    "med_id": matched_candidate["id"],
                    "qty": plan.get("quantity") or plan.get("tool_args", {}).get("qty") or 1,
                    "dose": plan.get("dose") or plan.get("tool_args", {}).get("dose"),
                }
                return await execute_tool_call(session_id, plan, state, lang, user_input=user_input)

        results = state.get("search_cache", {}).get(f"vec:{name}")
        if not results:
            results = await vector_search(name)
            if not results and name:
                results = await lookup_by_indication(name)
            if results:
                state.setdefault("search_cache", {})[f"vec:{name}"] = results
        if not results:
            # ── Do a follow-up LLM call so the agent generates a natural
            #    "not found" response instead of a stiff hardcoded template. ──
            not_found_result = await _llm_not_found_response(
                session_id, name, user_input, state, lang, force_localized,
                search_type="name"
            )
            return {
                "message": not_found_result.get("message", _localize("search_empty", lang, name=name)),
                "tts_message": not_found_result.get("tts_message", not_found_result.get("message", "")),
                "candidates": [],
                "action_taken": "search_empty",
            }
        update_session_state(session_id, {
            "candidates": results,
            "pending_rx_check": None,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
        })

        if len(results) == 1:
            med = results[0]
            # ── Check if single result is out of stock ──────────────────
            stock_qty = med.get('stock_quantity', 0)
            if stock_qty is not None and int(stock_qty) <= 0:
                # Out of stock — check for alternatives immediately
                oos_msg = _localize(
                    "out_of_stock", lang,
                    med=med.get("brand_name", "This medication"),
                )
                # Try to find alternatives
                med_id = med.get("id")
                if med_id:
                    alternatives = await get_tier1_alternatives(med_id)
                    if alternatives:
                        in_stock_alts = [a for a in alternatives if a.get('stock_quantity', 0) > 0]
                        display_alts = in_stock_alts[:3] if in_stock_alts else alternatives[:3]
                        update_session_state(session_id, {"candidates": display_alts})

                        def _fmt_oos_alt(i, a):
                            dosage = (a.get('dosage') or '').strip()
                            aname = f"{a['brand_name']} ({dosage})" if dosage else a['brand_name']
                            astock = a.get('stock_quantity', 0)
                            aprice = float(a.get('price', 0))
                            return f"{i+1}. {aname} — \u20ac{aprice:.2f} — {_availability_label(astock, lang)}"
                        alt_list = "\n".join(_fmt_oos_alt(i, a) for i, a in enumerate(display_alts))

                        lead_default = _localize("alternatives_lead", lang)
                        question_default = _localize("alternatives_question", lang)
                        msg = f"{oos_msg}\n\n{lead_default}\n{alt_list}\n\n{question_default}"
                        tts_fallback = f"{oos_msg} {question_default}"
                        tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), tts_fallback, lang, force_localized)
                        return {
                            "message": msg,
                            "tts_message": tts,
                            "candidates": display_alts,
                            "action_taken": "out_of_stock_alternatives",
                        }
                # No alternatives found
                no_alt_msg = _localize("no_alternatives", lang)
                full_msg = f"{oos_msg} {no_alt_msg}"
                return {
                    "message": full_msg,
                    "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), full_msg, lang, force_localized),
                    "action_taken": "out_of_stock_no_alternatives",
                }

            if med.get("rx_required"):
                update_session_state(session_id, {
                    "pending_rx_check": med,
                    "selected_medication": med,
                })
                default_msg = _localize(
                    "single_rx",
                    lang,
                    med=med["brand_name"],
                    dosage=med.get("dosage", ""),
                    price=float(med.get("price") or 0),
                )
                llm_msg = plan.get("message")
                msg = default_msg if _is_not_found_style_message(llm_msg) else _prefer_llm_text(llm_msg, default_msg, lang, force_localized)
                return {
                    "message": msg,
                    "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized),
                    "candidates": results,
                    "action_taken": "ask_rx",
                }
            else:
                update_session_state(session_id, {
                    "selected_medication": med,
                    "pending_add_confirm": med,
                })
                default_msg = _localize(
                    "single_otc",
                    lang,
                    med=med["brand_name"],
                    dosage=med.get("dosage", ""),
                    price=float(med.get("price") or 0),
                )
                llm_msg = plan.get("message")
                msg = default_msg if _is_not_found_style_message(llm_msg) else _prefer_llm_text(llm_msg, default_msg, lang, force_localized)
                return {
                    "message": msg,
                    "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized),
                    "candidates": results,
                    "action_taken": "search_single",
                }

        def _fmt_r(i, m):
            dosage = (m.get('dosage') or '').strip()
            name = f"{m['brand_name']} ({dosage})" if dosage else m['brand_name']
            price = float(m.get('price', 0))
            stock = m.get('stock_quantity', 0)
            return f"{i+1}. {name} — \u20ac{price:.2f} — {_availability_label(stock, lang)}"
        med_list = "\n".join(_fmt_r(i, m) for i, m in enumerate(results[:5]))
        lead_default = _localize("search_lead", lang)
        llm_msg = plan.get("message")
        lead = lead_default if _is_not_found_style_message(llm_msg) else _prefer_llm_text(llm_msg, lead_default, lang, force_localized)
        select_prompt = _localize("select_prompt", lang)
        msg = f"{lead}\n{med_list}\n\n{select_prompt}"
        # TTS includes the searched medicine name so user knows what was found
        tts_default = _localize("search_tts", lang, name=name)
        tts = _prefer_llm_tts(plan.get("tts_message"), None, tts_default, lang, force_localized)
        return {
            "message": msg,
            "tts_message": tts,
            "candidates": results[:5],
            "action_taken": "search_multiple",
        }

    # ── add_to_cart ─────────────────────────────────────────────────
    if tool == "add_to_cart":
        med_id = args.get("med_id") or plan.get("med_id")
        if not med_id and plan.get("medication") and isinstance(plan["medication"], dict):
            med_id = plan["medication"].get("id")
            
        qty = args.get("qty") or args.get("quantity") or plan.get("quantity") or plan.get("qty") or 1
        dose = args.get("dose") or plan.get("dose")

        # Validate med_id — if LLM hallucinated, try to resolve from session state
        med = await get_medication_details(med_id) if med_id else None
        if not med:
            # Try selected_medication or pending states first
            fallback_med = (
                state.get("selected_medication")
                or state.get("pending_add_confirm")
                or state.get("pending_qty_dose_check")
                or state.get("last_added_medication")
            )
            if fallback_med and fallback_med.get("id"):
                med_id = fallback_med["id"]
                med = await get_medication_details(med_id)
            # Try matching by name against current candidates (handles transliterated names)
            if not med:
                candidates = state.get("candidates", [])
                search_name = args.get("name") or args.get("med_name") or args.get("medication") or ""
                if candidates and search_name:
                    name_match = _match_candidate_by_name(search_name, candidates)
                    if name_match:
                        med_id = name_match["id"]
                        med = await get_medication_details(med_id)
            # Try candidate index from user input; fallback to first candidate.
            if not med:
                candidates = state.get("candidates", [])
                if candidates:
                    idx = _extract_candidate_index(user_input)
                    if idx is None or idx < 0 or idx >= len(candidates):
                        idx = 0
                    med_id = candidates[idx]["id"]
                    med = await get_medication_details(med_id)
            # For repeat-add (or single-item cart), use most recent cart item when no explicit med was resolved.
            if not med:
                cart_items = (state.get("cart") or {}).get("items", [])
                should_reuse_last = _is_repeat_add_request(user_input) or len(cart_items) == 1
                if should_reuse_last and cart_items:
                    repeat_med_id = cart_items[0].get("medication_id")
                    if repeat_med_id:
                        med_id = repeat_med_id
                        med = await get_medication_details(med_id)
            if not med:
                msg = _localize("add_not_found", lang)
                return {
                    "message": msg,
                    "tts_message": msg,
                    "action_taken": "add_blocked",
                }

        # Require explicit RX confirmation for RX meds unless this specific med has been verified.
        rx_verified_ids = state.get("rx_verified_med_ids", set())
        rx_confirmed = (
            not med.get("rx_required", False)
            or med_id in rx_verified_ids
        )
        validation = validate_add_to_cart(med, rx_confirmed=rx_confirmed, rx_bypass=False)

        if not validation.get("allowed"):
            validation_msg = validation.get("message") or _localize("add_not_found", lang)
            reason = validation.get("reason")
            if reason == "rx_required":
                # RX block — tell the user to upload prescription or remove the item
                update_session_state(session_id, {
                    "pending_rx_check": med,
                    "selected_medication": med,
                })
                validation_msg = _localize(
                    "rx_upload_or_remove",
                    lang,
                    med=med.get("brand_name", "This medication"),
                )
                return {
                    "message": validation_msg,
                    "tts_message": _localize(
                        "rx_ask_upload", lang,
                        med=med.get("brand_name", "This medication"),
                    ),
                    "action_taken": "rx_upload_required",
                    "ui_action": "open_upload_prescription",
                    "needs_input": True,
                }
            elif reason == "out_of_stock":
                validation_msg = _localize(
                    "out_of_stock",
                    lang,
                    med=med.get("brand_name", "This medication"),
                )

            if validation.get("suggest_alternatives"):
                alternatives = await get_tier1_alternatives(med_id)
                if alternatives:
                    update_session_state(session_id, {"candidates": alternatives})
                    # Filter only in-stock alternatives
                    in_stock_alts = [a for a in alternatives if a.get('stock_quantity', 0) > 0]
                    display_alts = in_stock_alts[:3] if in_stock_alts else alternatives[:3]
                    
                    def _fmt_alt(i, a):
                        dosage = (a.get('dosage') or '').strip()
                        name = f"{a['brand_name']} ({dosage})" if dosage else a['brand_name']
                        stock = a.get('stock_quantity', 0)
                        price = float(a.get('price', 0))
                        return f"{i+1}. {name} — \u20ac{price:.2f} — {_availability_label(stock, lang)}"
                    alt_list = "\n".join(_fmt_alt(i, a) for i, a in enumerate(display_alts))

                    lead_default = _localize("alternatives_lead", lang)
                    question_default = _localize("alternatives_question", lang)
                    lead = _prefer_llm_text(plan.get("message"), lead_default, lang, force_localized)
                    msg = f"{validation_msg}\n\n{lead}\n{alt_list}\n\n{question_default}"
                    tts_fallback = f"{validation_msg} {question_default}"
                    tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), tts_fallback, lang, force_localized)
                    
                    return {
                        "message": msg,
                        "tts_message": tts,
                        "candidates": display_alts,
                        "action_taken": "out_of_stock_alternatives",
                    }
                else:
                    no_alt_msg = _localize("no_alternatives", lang)
                    full_msg = f"{validation_msg} {no_alt_msg}"
                    return {
                        "message": full_msg,
                        "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), full_msg, lang, force_localized),
                        "action_taken": "out_of_stock_no_alternatives",
                    }
            final_msg = _prefer_llm_text(plan.get("message"), validation_msg, lang, force_localized)
            return {
                "message": final_msg,
                "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), final_msg, lang, force_localized),
                "action_taken": "add_blocked",
            }

        cart = await add_to_cart(session_id, med_id, qty, dose=dose)
        if not cart.get("added", True):
            raw_warning = cart.get("warning") or ""
            # Detect order limit hit and produce a localized, user-friendly message
            from config import MAX_ORDER_ITEMS, MAX_ORDER_TOTAL_UNITS
            if "Order limit reached" in raw_warning or f"{MAX_ORDER_ITEMS} different medicines" in raw_warning:
                blocked_msg = _localize("order_limit_reached", lang, max_items=MAX_ORDER_ITEMS)
            elif "cart limit reached" in raw_warning or f"{MAX_ORDER_TOTAL_UNITS} units" in raw_warning:
                blocked_msg = _localize("order_units_limit", lang,
                    product=med.get("brand_name", "item"), qty=qty,
                    actual=0, max_units=MAX_ORDER_TOTAL_UNITS)
            else:
                blocked_msg = raw_warning or _localize("add_not_found", lang)
            return {
                "message": blocked_msg,
                "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), blocked_msg, lang, force_localized),
                "cart": cart,
                "action_taken": "add_blocked",
                "needs_input": True,
            }
        update_session_state(session_id, {
            "pending_rx_check": None,
            "pending_qty_dose_check": None,
            "pending_add_confirm": None,
            "selected_medication": None,
            "last_added_medication": {"id": med.get("id"), "brand_name": med.get("brand_name")},
            "collected_quantity": None,
            "collected_dose": None,
            "candidates": [],
            "cart": cart,
        })

        # If cart capped the quantity, relay the localized warning
        warning_suffix = ""
        if cart.get("warning"):
            from config import MAX_ORDER_TOTAL_UNITS, MAX_ORDER_LINE_QTY
            actual_added = cart.get("total_quantity", qty)
            warning_suffix = "\n\n" + _localize(
                "order_units_limit", lang,
                product=med.get("brand_name", "item"),
                qty=qty, actual=actual_added,
                max_units=MAX_ORDER_TOTAL_UNITS,
            )

        default_add_msg = _localize(
            "add_success",
            lang,
            med=med["brand_name"],
            qty=qty,
            plural="s" if qty != 1 else "",
            cart_items=cart["item_count"],
            cart_plural="s" if cart.get("item_count", 0) != 1 else "",
        ) + warning_suffix
        msg = _prefer_llm_text(plan.get("message"), default_add_msg, lang, force_localized)
        return {
            "message": msg,
            "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized),
            "cart": cart,
            "candidates": [],
            "action_taken": "add_to_cart",
        }

    # ── remove_from_cart ────────────────────────────────────────────
    if tool == "remove_from_cart":
        cart_data = await get_cart(session_id)
        items = cart_data.get("items", [])
        if not items:
            empty_msg = _localize("remove_empty", lang)
            return {
                "message": empty_msg,
                "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), empty_msg, lang, force_localized),
                "cart": cart_data,
                "action_taken": "remove_empty",
            }

        target, reason, ambiguous_matches = _resolve_cart_item_for_removal(items, args, user_input)
        if not target:
            if reason == "ambiguous" and ambiguous_matches:
                options = ", ".join(m.get("brand_name", "Item") for m in ambiguous_matches[:3])
                if len(ambiguous_matches) > 3:
                    options += ", ..."
                ask_msg = _localize("remove_ambiguous", lang, items=options)
                return {
                    "message": ask_msg,
                    "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), ask_msg, lang, force_localized),
                    "cart": cart_data,
                    "action_taken": "remove_ambiguous",
                    "needs_input": True,
                }

            not_found_msg = _localize("remove_not_found", lang)
            return {
                "message": not_found_msg,
                "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), not_found_msg, lang, force_localized),
                "cart": cart_data,
                "action_taken": "remove_not_found",
                "needs_input": True,
            }

        cart_item_id = _to_int_or_none(target.get("cart_item_id"))
        if cart_item_id is None:
            not_found_msg = _localize("remove_not_found", lang)
            return {
                "message": not_found_msg,
                "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), not_found_msg, lang, force_localized),
                "cart": cart_data,
                "action_taken": "remove_not_found",
                "needs_input": True,
            }

        updated_cart = await remove_from_cart(session_id, cart_item_id)
        update_session_state(session_id, {
            "cart": updated_cart,
            "pending_add_confirm": None,
            "pending_qty_dose_check": None,
            "pending_rx_check": None,
        })
        default_remove_msg = _localize(
            "remove_success",
            lang,
            med=target.get("brand_name", "item"),
            cart_items=updated_cart.get("item_count", 0),
            cart_plural="s" if updated_cart.get("item_count", 0) != 1 else "",
        )
        msg = _prefer_llm_text(plan.get("message"), default_remove_msg, lang, force_localized)
        return {
            "message": msg,
            "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), msg, lang, force_localized),
            "cart": updated_cart,
            "action_taken": "remove_from_cart",
        }

    # ── get_inventory ───────────────────────────────────────────────
    if tool == "get_inventory":
        med_id = args.get("med_id")
        inv = await get_inventory(med_id)
        return {
            "message": f"{inv.get('brand_name','Item')}: {inv.get('stock_quantity',0)} in stock",
            "inventory": inv,
            "action_taken": "check_inventory",
        }

    # ── get_tier1_alternatives ──────────────────────────────────────
    if tool == "get_tier1_alternatives":
        med_id = args.get("med_id")
        alts = await get_tier1_alternatives(med_id)
        if not alts:
            no_alt_default = _localize("no_alternatives", lang)
            no_alt_msg = _prefer_llm_text(plan.get("message"), no_alt_default, lang, force_localized)
            return {
                "message": no_alt_msg,
                "tts_message": _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), no_alt_msg, lang, force_localized),
                "action_taken": "no_alternatives",
            }
        update_session_state(session_id, {"candidates": alts})
        def _fmt_t1(i, a):
            dosage = (a.get('dosage') or '').strip()
            name = f"{a['brand_name']} ({dosage})" if dosage else a['brand_name']
            stock = a.get('stock_quantity', 0)
            price = float(a.get('price', 0))
            return f"{i+1}. {name} — \u20ac{price:.2f} — {_availability_label(stock, lang)}"
        alt_list = "\n".join(_fmt_t1(i, a) for i, a in enumerate(alts[:5]))
        lead_default = _localize("alternatives_lead", lang)
        q_default = _localize("which_prefer", lang)
        lead = _prefer_llm_text(plan.get("message"), lead_default, lang, force_localized)
        tts = _prefer_llm_tts(plan.get("tts_message"), plan.get("message"), q_default, lang, force_localized)
        return {
            "message": f"{lead}\n{alt_list}\n\n{q_default}",
            "tts_message": tts,
            "candidates": alts,
            "action_taken": "show_alternatives",
        }

    # ── upload_prescription ─────────────────────────────────────────
    if tool == "upload_prescription":
        return await _handle_prescription_upload(session_id, args, state)

    # ── Unknown tool ────────────────────────────────────────────────
    return {
        "message": "Something went wrong. Please try again.",
        "action_taken": "tool_error",
    }


# ── Prescription upload (kept from v1) ──────────────────────────────────
async def _handle_prescription_upload(
    session_id: str, args: Dict[str, Any], state: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle prescription image upload and OCR → cart or verify flow."""
    image_path = (
        args.get("file_path")
        or args.get("filepath")
        or args.get("image_path")
        or args.get("path")
        or "mock_prescription.jpg"
    )
    # Accept inline base64 data (sent from frontend to survive Vercel ephemeral fs)
    image_base64 = args.get("image_base64")
    mime_type = args.get("mime_type", "image/jpeg")

    from services.ocr_service import extract_text_from_image, parse_prescription_text

    ocr_result = await extract_text_from_image(image_path, image_base64=image_base64, mime_type=mime_type)
    if "error" in ocr_result:
        return {"message": f"Failed to read prescription: {ocr_result['error']}", "action_taken": "upload_failed"}

    parsed_rx = await parse_prescription_text(ocr_result)
    meds_found = parsed_rx.get("medications", [])
    unknown_items = parsed_rx.get("unknown_items", [])
    disease = parsed_rx.get("disease_or_illness")

    if not meds_found and not unknown_items:
        msg = "Couldn't identify any medicines from the prescription. Try again or type them manually."
        if disease:
            msg += f"\nNote: recognized condition as {disease}."
        return {
            "message": msg,
            "action_taken": "upload_empty",
        }

    cart = await get_cart(session_id)

    if cart["item_count"] == 0:
        # Scan-to-cart mode
        from tools.query_tools import vector_search as _search, get_tier1_alternatives
        added, oos, unknown = [], [], []
        # Normalize unknown_items: may be dicts (new format) or strings (legacy)
        for ui in unknown_items:
            if isinstance(ui, dict):
                label = ui.get("name", "")
                dosage = ui.get("dosage", "")
                unknown.append(f"{label} {dosage}".strip() if dosage else label)
            else:
                unknown.append(str(ui))

        # Cap to prevent timeout on overly broad OCR matches
        meds_found = meds_found[:10]
        for med in meds_found:
            query = f"{med['brand_name']} {med.get('dosage','')}"
            results = await _search(query)
            match = results[0] if results else None
            if match and match.get("stock_quantity", 0) > 0:
                await add_to_cart(session_id, match["id"], 1)
                searched = med.get("searched_name") or med["brand_name"]
                added.append(f"{match['brand_name']} (from: {searched})" if searched.lower() != match['brand_name'].lower() else match['brand_name'])
                # Track this medicine as RX-verified (scan-to-cart is prescription-sourced)
                verified_ids = state.get("rx_verified_med_ids", set())
                verified_ids.add(match["id"])
                update_session_state(session_id, {"rx_verified_med_ids": verified_ids})
            elif match:
                alts = await get_tier1_alternatives(match["id"])
                alts = [a for a in alts if a["id"] != match["id"] and a.get("stock_quantity", 0) > 0][:3]
                oos.append({"requested": match["brand_name"], "alternatives": alts})
            else:
                searched = med.get("searched_name") or med["brand_name"]
                unknown.append(searched)

        parts = []
        if disease:
            parts.append(f"📋 Identified condition: **{disease}**")

        llm_count = parsed_rx.get("llm_extracted_count", 0)
        if llm_count:
            parts.append(f"🔎 Extracted **{llm_count}** medicine(s) from prescription.")

        if added:
            parts.append(f"✅ Added to cart: {', '.join(added)}.")
        for o in oos:
            alt_names = [a["brand_name"] for a in o["alternatives"]]
            parts.append(f"⚠️ {o['requested']} is out of stock." + (f" Alternatives: {', '.join(alt_names)}." if alt_names else ""))
        if unknown:
            parts.append(f"❌ Not found in catalog: {', '.join(unknown)}. You can try searching by generic name or ask me to find alternatives.")
        if added:
            update_session_state(session_id, {"pending_rx_check": None})
        # Return the updated cart so the frontend refreshes immediately
        updated_cart = await get_cart(session_id)
        return {"message": "\n".join(parts) or "No items found.", "action_taken": "scan_to_cart_processed", "cart": updated_cart}
    else:
        # Verify existing cart — also check against pending_rx_check medicine
        from agents.safety_agent import validate_prescription
        validation = await validate_prescription(parsed_rx, cart["items"])

        # Also check if the prescription covers the pending_rx_check medicine
        pending_rx_med = state.get("pending_rx_check")
        pending_rx_covered = False
        if pending_rx_med:
            pending_name = (pending_rx_med.get("brand_name") or "").lower()
            pending_generic = (pending_rx_med.get("generic_name") or "").lower()
            # Build set of all medicine names found in the prescription
            prescribed_names = set()
            for m in parsed_rx.get("medications", []):
                prescribed_names.add((m.get("brand_name") or "").lower())
                prescribed_names.add((m.get("generic_name") or "").lower())
                prescribed_names.add((m.get("searched_name") or "").lower())
            # Check partial/substring matches too (e.g. "goodra" in "Goodra 500mg")
            for pname in prescribed_names:
                if pname and pending_name and (pending_name in pname or pname in pending_name):
                    pending_rx_covered = True
                    break
                if pname and pending_generic and (pending_generic in pname or pname in pending_generic):
                    pending_rx_covered = True
                    break

        verified_ids = state.get("rx_verified_med_ids", set())

        if validation["valid"]:
            # Mark all RX cart items as verified
            for item in cart["items"]:
                item_med_id = item.get("medication_id") or item.get("product_catalog_id")
                if item_med_id:
                    verified_ids.add(item_med_id)

        if pending_rx_covered and pending_rx_med:
            pending_id = pending_rx_med.get("id")
            if pending_id:
                verified_ids.add(pending_id)

        update_session_state(session_id, {"rx_verified_med_ids": verified_ids})

        if validation["valid"] or pending_rx_covered:
            update_session_state(session_id, {"pending_rx_check": None})
            msg = "✅ Prescription verified! "
            if pending_rx_covered and pending_rx_med:
                med_name = pending_rx_med.get("brand_name", "The medicine")
                msg += f"{med_name} has been confirmed on your prescription. You can now add it to your cart."
            else:
                msg += "All RX items approved."
            return {"message": msg, "action_taken": "upload_verified_success"}
        return {"message": validation["message"], "action_taken": "upload_verified_failed"}


# ── Helpers ─────────────────────────────────────────────────────────────
def _state_summary(state: Dict[str, Any]) -> Dict[str, Any]:
    """Compact summary for trace logging (avoid dumping full candidates)."""
    return {
        "turn": state.get("turn_count"),
        "n_candidates": len(state.get("candidates", [])),
        "pending_rx": bool(state.get("pending_rx_check")),
        "pending_qty": bool(state.get("pending_qty_dose_check")),
        "pending_add": bool(state.get("pending_add_confirm")),
        "cart_items": state.get("cart", {}).get("item_count", 0),
    }


def clear_session(session_id: str):
    """Clear session state."""
    _conversation_states.pop(session_id, None)
