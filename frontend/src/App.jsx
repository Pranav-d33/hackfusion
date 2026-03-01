import React, { useState, useEffect, useRef, useCallback } from 'react';
import VoiceSettingsModal from './components/VoiceSettingsModal';
import MicButton from './components/MicButton';
import TextInput from './components/TextInput';
import ChatMessage from './components/ChatMessage';
import ResultsList from './components/ResultsList';
import Cart from './components/Cart';
import TracePanel from './components/TracePanel';
import Login from './components/Login';
import UserProfileModal from './components/UserProfileModal';
import RefillNotification from './components/RefillNotification';
import AdminDashboard from './pages/AdminDashboard';
import LiveOverlay from './components/LiveOverlay';
import FlyToCartLayer from './components/FlyToCartLayer';
import MedicineSearch from './components/MedicineSearch';
import AddressModal from './components/AddressModal';
import OrderSummaryModal from './components/OrderSummaryModal';
import CheckoutAnimation from './components/CheckoutAnimation';
import CartDetailModal from './components/CartDetailModal';
import PastOrdersModal from './components/PastOrdersModal';
import PrescriptionModal from './components/PrescriptionModal';
import UpdatesModal from './components/UpdatesModal';
import { useSpeech } from './hooks/useSpeech';
import { useRefillPredictions } from './hooks/useRefillPredictions';
import { useLanguage } from './i18n/LanguageContext';
import LanguageSelector from './components/LanguageSelector';
import { useUI } from './contexts/UIContext';

const API_BASE = '/api';
const CHAT_TIMEOUT_MS = 60000;
const OCR_CHAT_TIMEOUT_MS = 180000; // 3 min for prescription OCR analysis
const DEFAULT_TTS_RATE = 1.0;
const SHORT_VOICE_STABLE_MS = 700;
const SHORT_VOICE_COMMANDS = new Set([
    // yes / no
    'yes', 'yeah', 'yep', 'ya', 'ok', 'okay', 'sure',
    'no', 'nope', 'nah',
    // numbers
    '1', 'one', 'won',
    '2', 'two', 'too', 'to',
    '3', 'three',
    '4', 'four', 'for',
    '5', 'five',
    '6', 'six',
    '7', 'seven',
    '8', 'eight', 'ate',
    '9', 'nine',
    '10', 'ten',
    // Hindi/Hinglish short confirmations
    'haan', 'han', 'ha', 'hanji', 'ji', 'nahi',
    'haanji', 'theek', 'thik',
    // Hindi (Devanagari)
    'हाँ', 'हां', 'जी', 'नहीं', 'ठीक',
    'एक', 'दो', 'तीन', 'चार', 'पांच', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
    // German short confirmations
    'ja', 'nein', 'sicher', 'klar', 'ok',
    // German numbers
    'eins', 'zwei', 'drei', 'vier', 'fünf', 'fuenf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
    // Arabic short confirmations
    'نعم', 'ايوه', 'أيوه', 'لا', 'طيب', 'تمام',
    // Arabic numbers
    'واحد', 'اثنين', 'اتنين', 'ثلاثة', 'أربعة', 'اربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
    // Arabic-Indic numerals
    '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠',
]);

function normalizeShortVoiceCommand(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isShortVoiceCommand(text) {
    const normalized = normalizeShortVoiceCommand(text);
    if (!normalized) return false;
    const wordCount = normalized.split(' ').length;
    return wordCount <= 2 && SHORT_VOICE_COMMANDS.has(normalized);
}

const LANGUAGE_OPTIONS = [
    { code: 'en-US', label: 'English', sub: 'US/International' },
    { code: 'de-DE', label: 'Deutsch', sub: 'Deutschland' },
    { code: 'ar-SA', label: 'العربية', sub: 'العربية' },
    { code: 'hi-IN', label: 'हिन्दी', sub: 'भारत' },
];

/* ──────────────────────────────────────────
   Feature Highlight Cards (shown above chat)
   ────────────────────────────────────────── */
function FeatureCards() {
    const { t } = useLanguage();
    const features = [
        {
            icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
            ),
            title: t('voiceOrdering'),
            desc: t('voiceOrderingDesc'),
            color: 'mediloon',
        },
        {
            icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            ),
            title: t('smartRefills'),
            desc: t('smartRefillsDesc'),
            color: 'violet',
        },
        {
            icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            title: t('prescriptionOCR'),
            desc: t('prescriptionOCRDesc'),
            color: 'sapphire',
        },
    ];

    const colorMap = {
        mediloon: {
            iconBg: 'bg-mediloon-50',
            iconText: 'text-mediloon-600',
            border: 'border-mediloon-100 hover:border-mediloon-300',
            glow: 'hover:shadow-glow-red-sm',
        },
        violet: {
            iconBg: 'bg-accent-violet-light',
            iconText: 'text-accent-violet',
            border: 'border-violet-100 hover:border-violet-300',
            glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]',
        },
        sapphire: {
            iconBg: 'bg-accent-sapphire-light',
            iconText: 'text-accent-sapphire',
            border: 'border-blue-100 hover:border-blue-300',
            glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]',
        },
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 animate-fade-in-up">
            {features.map((f, i) => {
                const c = colorMap[f.color];
                return (
                    <div
                        key={i}
                        className={`feature-card border ${c.border} ${c.glow} group`}
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        <div className={`w-12 h-12 ${c.iconBg} ${c.iconText} rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                            {f.icon}
                        </div>
                        <h3 className="font-brand font-bold text-ink-primary text-sm mb-1">{f.title}</h3>
                        <p className="text-xs text-ink-muted leading-relaxed">{f.desc}</p>
                    </div>
                );
            })}
        </div>
    );
}

/* ──────────────────────────────────────
   Main App Component
   ────────────────────────────────────── */
export default function App() {
    // --- Language ---
    const { t, lang, bcp47, dir, setLang } = useLanguage();

    // --- UI Context (agent-controlled navigation) ---
    const { executeUIAction, isCartOpen, setCartOpen, isOrdersOpen, setOrdersOpen, isPrescriptionModalOpen, setPrescriptionModalOpen, prescriptionMode, isTraceOpen, setTraceOpen, modalEpoch } = useUI();

    // --- State ---
    const [messages, setMessages] = useState([{
        id: 0,
        text: t('welcomeMessage'),
        isUser: false
    }]);
    const [candidates, setCandidates] = useState([]);
    const [cart, setCart] = useState({ items: [], item_count: 0 });
    const [trace, setTrace] = useState([]);
    const [latency, setLatency] = useState(null);
    const [traceUrl, setTraceUrl] = useState(null);
    const [traceId, setTraceId] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState(null);
    const [sessionToken, setSessionToken] = useState(null);
    const [showLogin, setShowLogin] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [viewMode, setViewMode] = useState('user');
    const [liveMode, setLiveMode] = useState(false);
    const [showMobileCart, setShowMobileCart] = useState(false);
    const [showVoiceIntroPopup, setShowVoiceIntroPopup] = useState(false);
    const [showVoiceSettings, setShowVoiceSettings] = useState(false);

    // New UI State
    const [showSearch, setShowSearch] = useState(false);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [showCartDetail, setShowCartDetail] = useState(false);
    const [checkoutOrder, setCheckoutOrder] = useState(null);
    const [showCheckoutAnim, setShowCheckoutAnim] = useState(false);
    const [pendingCheckout, setPendingCheckout] = useState(false);
    const [showLoginForCheckout, setShowLoginForCheckout] = useState(false);
    const [orderUpdates, setOrderUpdates] = useState([]);
    const [showOrderSummary, setShowOrderSummary] = useState(false);
    const [pendingAddress, setPendingAddress] = useState('');
    const [pendingOrderData, setPendingOrderData] = useState(null);

    // Selection State
    const [selectedMedId, setSelectedMedId] = useState(null);

    // Animation State
    const [flyingItems, setFlyingItems] = useState([]);
    const cartRef = useRef(null);
    const liveModeRef = useRef(false);

    // --- Hooks ---
    const {
        isListening,
        isSpeaking,
        transcript,
        audioLevel,
        detectedLanguage,
        manualLanguage,
        startListening,
        stopListening,
        speak,
        stopSpeaking,
        setTranscript,
        scriptInfo,
        voices,
        selectedVoice,
        setVoice,
        setPreferredLanguage,
    } = useSpeech();
    const messagesEndRef = useRef(null);
    const pendingTranscriptQueueRef = useRef([]);
    const shortVoiceFinalizeTimerRef = useRef(null);
    const transcriptLiveRef = useRef('');

    // Refill predictions hook (used across UI + updates)
    const { timeline: refillTimeline, consumption: refillConsumption, recentOrders, stats: refillStats, alerts: refillAlerts, loading: refillLoading, refresh: refreshRefills } = useRefillPredictions(user?.id);

    // Effects
    useEffect(() => {
        const token = localStorage.getItem('session_token');
        if (!token) return;
        let active = true;
        const restoreSession = async () => {
            try {
                const response = await fetch(`${API_BASE}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (!response.ok) throw new Error('Session has expired');
                const profile = await response.json();
                if (!active) return;
                setUser(profile);
                setSessionToken(token);
                if (!profile.profile_completed) setShowProfileModal(true);
                checkFirstTimeLogin();
            } catch (error) {
                console.warn('Session restore failed:', error);
                localStorage.removeItem('session_token');
                if (active) { setUser(null); setSessionToken(null); }
            }
        };
        restoreSession();
        return () => { active = false; };
    }, []);

    const [pendingVoiceIntro, setPendingVoiceIntro] = useState(false);
    const checkFirstTimeLogin = useCallback(() => {
        const hasSeenIntro = localStorage.getItem('mediloon_voice_intro_seen');
        if (!hasSeenIntro) {
            setPendingVoiceIntro(true);
        }
    }, []);

    // Show voice intro AFTER profile modal is dismissed
    useEffect(() => {
        if (pendingVoiceIntro && !showProfileModal && user) {
            const timer = setTimeout(() => {
                setShowVoiceIntroPopup(true);
                localStorage.setItem('mediloon_voice_intro_seen', 'true');
                setPendingVoiceIntro(false);
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [pendingVoiceIntro, showProfileModal, user]);

    // Auto-scroll chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

    // Handle Transcript from Voice
    useEffect(() => {
        liveModeRef.current = liveMode;
    }, [liveMode]);

    const restartListeningIfLive = useCallback((delayMs = 300) => {
        setTimeout(() => {
            if (liveModeRef.current) startListening();
        }, delayMs);
    }, [startListening]);

    // Pause voice agent while auth/profile modals are active
    const isAuthModalOpen = showLogin || showLoginForCheckout || showProfileModal;
    const voicePausedByAuthRef = useRef(false);

    useEffect(() => {
        if (isAuthModalOpen) {
            if (isListening || isSpeaking || liveMode) {
                stopListening();
                stopSpeaking();
                voicePausedByAuthRef.current = true;
            }
        } else if (voicePausedByAuthRef.current) {
            voicePausedByAuthRef.current = false;
            if (liveMode) {
                restartListeningIfLive(500);
            }
        }
    }, [isAuthModalOpen, isListening, isSpeaking, liveMode, stopListening, stopSpeaking, restartListeningIfLive]);

    // Voice mode stall recovery: if idle for > 8s, auto-restart listening
    useEffect(() => {
        if (!liveMode || isListening || isSpeaking || isLoading) return;
        const timer = setTimeout(() => {
            console.warn('[VoiceMode] Stall detected — auto-restarting listening');
            startListening();
        }, 8000);
        return () => clearTimeout(timer);
    }, [liveMode, isListening, isSpeaking, isLoading, startListening]);

    // Keep short-command detector in sync with latest transcript.
    useEffect(() => {
        transcriptLiveRef.current = transcript || '';
    }, [transcript]);

    // If STT catches only a short command (e.g., "yes", "one"), stabilize briefly then stop listening
    // so the existing transcript-send flow can submit it reliably.
    useEffect(() => {
        if (!liveMode || !isListening || !isShortVoiceCommand(transcript)) {
            if (shortVoiceFinalizeTimerRef.current) {
                clearTimeout(shortVoiceFinalizeTimerRef.current);
                shortVoiceFinalizeTimerRef.current = null;
            }
            return;
        }

        const expected = normalizeShortVoiceCommand(transcript);
        if (!expected) return;

        if (shortVoiceFinalizeTimerRef.current) {
            clearTimeout(shortVoiceFinalizeTimerRef.current);
        }
        shortVoiceFinalizeTimerRef.current = setTimeout(() => {
            const latest = normalizeShortVoiceCommand(transcriptLiveRef.current);
            if (latest === expected && isListening) {
                stopListening();
            }
        }, SHORT_VOICE_STABLE_MS);

        return () => {
            if (shortVoiceFinalizeTimerRef.current) {
                clearTimeout(shortVoiceFinalizeTimerRef.current);
                shortVoiceFinalizeTimerRef.current = null;
            }
        };
    }, [liveMode, isListening, transcript, stopListening]);

    const handleFlyToCart = useCallback((startRect) => {
        const id = Date.now();
        setFlyingItems(prev => [...prev, { id, startRect, onComplete: () => setFlyingItems(p => p.filter(i => i.id !== id)) }]);
    }, []);

    // --- Handlers ---
    const toggleLiveMode = () => {
        if (liveMode) {
            setLiveMode(false); stopListening(); stopSpeaking();
            pendingTranscriptQueueRef.current = [];
        } else {
            setLiveMode(true); startListening();
        }
    };

    // Sync speech language with UI language
    useEffect(() => {
        setPreferredLanguage(bcp47);
    }, [bcp47, setPreferredLanguage]);

    // Update welcome message when language changes
    useEffect(() => {
        setMessages(prev => {
            if (prev.length === 1 && prev[0].id === 0 && !prev[0].isUser) {
                return [{ id: 0, text: t('welcomeMessage'), isUser: false }];
            }
            return prev;
        });
    }, [lang, t]);

    const handleLanguageSelect = useCallback((langCode) => {
        setPreferredLanguage(langCode);
        // Also sync UI language
        if (langCode) {
            const base = langCode.split('-')[0].toLowerCase();
            if (['en', 'de', 'ar', 'hi'].includes(base)) setLang(base);
        }
        // If currently listening, restart quickly to apply new model
        if (isListening) {
            stopListening();
            setTimeout(() => startListening(), 120);
        }
    }, [isListening, setPreferredLanguage, startListening, stopListening, setLang]);

    const fetchOrderUpdates = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`${API_BASE}/events?limit=50&event_type=CUSTOMER_ORDER&customer_id=${user.id}`);
            if (!res.ok) throw new Error('Failed to fetch order updates');
            const data = await res.json();
            const updates = (data.events || []).map(evt => {
                const meta = evt.metadata || {};
                const etaDays = meta.estimated_delivery ? Math.max(0, Math.round((new Date(meta.estimated_delivery) - new Date()) / 86400000)) : null;
                return {
                    id: `order-${meta.order_id || evt.id}`,
                    order_id: meta.order_id || evt.id,
                    estimated_delivery: meta.estimated_delivery,
                    days_left: etaDays,
                    address: meta.delivery_address,
                    total: meta.total,
                    items: meta.items || [],
                    created_at: evt.created_at,
                    status: evt.message,
                };
            });
            setOrderUpdates(updates);
        } catch (err) {
            console.error('Failed to fetch order updates:', err);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) {
            setOrderUpdates([]);
            return;
        }

        fetchOrderUpdates();
        const interval = setInterval(fetchOrderUpdates, 60 * 1000);
        return () => clearInterval(interval);
    }, [user?.id, fetchOrderUpdates]);

    // Ref to allow handleCheckoutFlow to trigger a chat message (defined before handleSend)
    const pendingCheckoutChatRef = useRef(null);

    // Checkout flow: enforce login first (defined before handleSend so it can be referenced)
    const handleCheckoutFlow = useCallback(() => {
        executeUIAction('close_modal');
        setShowCartDetail(false);
        if (!user) {
            setPendingCheckout(true);
            setShowLoginForCheckout(true);
            return;
        }
        if (!user.profile_completed) {
            setPendingCheckout(true);
            setShowProfileModal(true);
            return;
        }
        // RX gate: check if cart has unverified prescription items
        const rxItems = (cart?.items || []).filter(item => item.rx_required);
        if (rxItems.length > 0) {
            // Queue a checkout message to be sent through the chat pipeline
            // This will trigger the backend RX validation gate
            pendingCheckoutChatRef.current = 'checkout';
            return;
        }
        setShowAddressModal(true);
    }, [user, executeUIAction, cart]);

    const handleSend = useCallback(async (text) => {
        if (!text.trim() || isLoading) return;
        const userMsg = { id: Date.now(), text, isUser: true };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);
        const controller = new AbortController();
        const isOCR = text.toLowerCase().includes('prescription file');
        const timeoutId = setTimeout(() => controller.abort(), isOCR ? OCR_CHAT_TIMEOUT_MS : CHAT_TIMEOUT_MS);
        try {
            const response = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    session_id: sessionId,
                    message: text,
                    source: liveMode ? 'voice' : 'text',
                    language: bcp47 || detectedLanguage || scriptInfo?.lang || 'en-US',
                    customer_id: user?.id,
                }),
            });
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            if (data.session_id) setSessionId(data.session_id);
            // Only add a text message if data.message actually has text (UI actions often have empty text)
            if (data.message) {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    text: data.message,
                    isUser: false,
                    latency: data.latency_ms,
                }]);
            }

            // Handle voice response AND ensuring we restart listening
            if (liveMode) {
                const msgToSpeak = data.tts_message || data.message;
                if (msgToSpeak) {
                    const ttsLangByResponse =
                        data.language === 'de' ? 'de-DE'
                            : data.language === 'ar' ? 'ar-SA'
                                : data.language === 'hi' ? 'hi-IN'
                                    : null;
                    const ttsLang = bcp47 || ttsLangByResponse || detectedLanguage || scriptInfo?.lang || 'en-US';
                    speak(msgToSpeak, { rate: DEFAULT_TTS_RATE, lang: ttsLang, onEnd: () => restartListeningIfLive(300) });
                } else {
                    // No speech needed, but we MUST restart listening so it doesn't get stuck in "Processing..."
                    restartListeningIfLive(300);
                }
            }
            // Update candidates — clear them on add/quantity/dose actions, otherwise set from response
            if (data.action_taken === 'add_to_cart' || data.action_taken === 'ask_quantity' || data.action_taken === 'ask_dose') {
                setCandidates([]);
            } else if (data.candidates) {
                setCandidates(data.candidates);
            }
            if (data.cart) setCart(data.cart);
            if (data.trace) setTrace(data.trace);
            if (data.latency_ms != null) setLatency(data.latency_ms);
            if (data.trace_url) setTraceUrl(data.trace_url);
            if (data.trace_id) setTraceId(data.trace_id);
            if (data.action_taken === 'checkout_ready') {
                // Agent signals checkout intent — run the proper login+address flow
                handleCheckoutFlow();
            } else if (data.action_taken === 'checkout_rx_blocked' || data.action_taken === 'rx_upload_required') {
                // Cart has unverified prescription items — do NOT proceed to checkout
                // The backend already sent ui_action: open_upload_prescription
                // which will be handled below in the ui_action block
            } else if (data.action_taken === 'checkout' && data.order) {
                // Stash order data and show summary modal for confirmation
                setPendingOrderData(data.order);
                setPendingAddress(data.order.delivery_address || '');
                setShowOrderSummary(true);
            }

            // NEW: Agent-controlled UI actions (runs alongside existing logic, never replaces it)
            if (data.ui_action) {
                // Close local-only overlays before opening context-driven panel
                setShowSearch(false);
                setShowAddressModal(false);
                setShowOrderSummary(false);
                setShowCartDetail(false);
                setShowVoiceSettings(false);
                setShowProfileModal(false);
                setShowVoiceIntroPopup(false);
                setShowLogin(false);
                setShowLoginForCheckout(false);
                if (data.ui_action === 'close_modal') setPendingCheckout(false);
                if (data.ui_action === 'open_my_orders' && !user) {
                    executeUIAction('close_modal');
                    setShowLogin(true);
                } else {
                    executeUIAction(data.ui_action);
                }
            }
        } catch (error) {
            console.error(error);
            const errorMsg = error?.name === 'AbortError'
                ? t('timeoutTryAgain')
                : t('sorry');
            setMessages(prev => [...prev, { id: Date.now() + 1, text: errorMsg, isUser: false }]);
            // CRITICAL: In voice mode, always restart listening after errors
            if (liveMode) {
                speak(errorMsg, {
                    rate: DEFAULT_TTS_RATE,
                    lang: bcp47 || detectedLanguage || scriptInfo?.lang || 'en-US',
                    onEnd: () => restartListeningIfLive(300),
                });
            }
        } finally {
            clearTimeout(timeoutId);
            setIsLoading(false);
        }
    }, [sessionId, isLoading, liveMode, speak, scriptInfo, detectedLanguage, bcp47, handleCheckoutFlow, user, user?.id, refreshRefills, executeUIAction, restartListeningIfLive, t]);

    // Flush any queued checkout chat message from handleCheckoutFlow
    useEffect(() => {
        if (pendingCheckoutChatRef.current && !isLoading) {
            const msg = pendingCheckoutChatRef.current;
            pendingCheckoutChatRef.current = null;
            handleSend(msg);
        }
    }, [isLoading, handleSend]);
    useEffect(() => {
        if (transcript && !isListening) {
            if (isLoading) {
                // Queue transcripts while processing so we don't drop rapid utterances.
                pendingTranscriptQueueRef.current.push(transcript);
                if (pendingTranscriptQueueRef.current.length > 6) {
                    pendingTranscriptQueueRef.current.shift();
                }
                setTranscript('');
            } else {
                handleSend(transcript);
                setTranscript('');
            }
        }
    }, [isListening, transcript, isLoading, handleSend, setTranscript]);

    // Process queued voice transcript when loading finishes
    useEffect(() => {
        if (!isLoading && pendingTranscriptQueueRef.current.length > 0) {
            const nextTranscript = pendingTranscriptQueueRef.current.shift();
            if (nextTranscript) handleSend(nextTranscript);
        }
    }, [isLoading, handleSend]);

    const handleFileUpload = useCallback(async (file) => {
        if (!file || isLoading) return;
        setMessages(prev => [...prev, { id: Date.now(), text: `${t('uploading')} ${file.name}...`, isUser: true }]);
        setIsLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const uploadController = new AbortController();
            const uploadTimeout = setTimeout(() => uploadController.abort(), 30000);
            const response = await fetch(`${API_BASE}/upload/prescription`, { method: 'POST', body: formData, signal: uploadController.signal });
            clearTimeout(uploadTimeout);
            const data = await response.json();
            handleSend(`Please analyze this prescription file: ${data.filepath}`);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { id: Date.now() + 1, text: t('uploadFailed'), isUser: false }]);
            setIsLoading(false);
        }
    }, [handleSend, isLoading]);

    const handleLogout = () => {
        if (sessionToken) {
            fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            }).catch(() => { });
        }
        localStorage.removeItem('session_token');
        setUser(null); setSessionToken(null); setOrderUpdates([]);
    };

    // Direct add-to-cart via API (bypasses LLM for reliability)
    const handleDirectAddToCart = useCallback(async (med) => {
        let sid = sessionId;
        if (!sid) {
            try {
                const initRes = await fetch(`${API_BASE}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: 'hello',
                        source: 'text',
                        language: bcp47 || 'en-US',
                        customer_id: user?.id,
                    }),
                });
                const initData = await initRes.json();
                if (initData.session_id) {
                    sid = initData.session_id;
                    setSessionId(sid);
                }
            } catch (err) {
                console.error('Failed to init session:', err);
                handleSend(`Add ${med.brand_name}`);
                return;
            }
        }
        try {
            const baseLang = (bcp47 || detectedLanguage || scriptInfo?.lang || 'en-US').toLowerCase();
            const isGerman = baseLang.startsWith('de');
            const isArabic = baseLang.startsWith('ar');
            const isHindi = baseLang.startsWith('hi');

            const res = await fetch(`${API_BASE}/cart/${sid}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ med_id: med.id, qty: 1 }),
            });
            if (res.ok) {
                const updatedCart = await res.json();
                setCart(updatedCart);
                const confirmMsg = isGerman
                    ? `${med.brand_name} wurde zu deinem Warenkorb hinzugefügt.${updatedCart.warning ? ` ${updatedCart.warning}` : ''}`
                    : isArabic
                        ? `تمت إضافة ${med.brand_name} إلى سلة التسوق.${updatedCart.warning ? ` ${updatedCart.warning}` : ''}`
                        : isHindi
                            ? `${med.brand_name} को आपके कार्ट में जोड़ दिया गया है।${updatedCart.warning ? ` ${updatedCart.warning}` : ''}`
                            : `Added ${med.brand_name} to your cart.${updatedCart.warning ? ' ' + updatedCart.warning : ''}`;
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: confirmMsg,
                    isUser: false,
                }]);
                // Speak confirmation in voice mode
                if (liveMode) {
                    const ttsMsg = isGerman
                        ? `${med.brand_name} wurde hinzugefügt. Jetzt sind ${updatedCart.item_count} Artikel im Warenkorb. Möchtest du mehr hinzufügen oder zur Kasse gehen?`
                        : isArabic
                            ? `تمت إضافة ${med.brand_name}. يوجد الآن ${updatedCart.item_count} منتج في السلة. هل تريد إضافة المزيد أم المتابعة للدفع؟`
                            : isHindi
                                ? `${med.brand_name} कार्ट में जोड़ दिया गया है। अब कार्ट में ${updatedCart.item_count} आइटम हैं। क्या आप और जोड़ना चाहेंगे या चेकआउट करेंगे?`
                                : `Added ${med.brand_name} to your cart. ${updatedCart.item_count} item${updatedCart.item_count !== 1 ? 's' : ''} total. Add more or say checkout.`;
                    const ttsLang = bcp47 || detectedLanguage || scriptInfo?.lang || 'en-US';
                    speak(ttsMsg, { rate: DEFAULT_TTS_RATE, lang: ttsLang, onEnd: () => restartListeningIfLive(300) });
                }
            } else {
                let failMsg = isGerman
                    ? 'Artikel konnte nicht hinzugefügt werden. Bitte versuche es erneut.'
                    : isArabic
                        ? 'تعذر إضافة المنتج. يرجى المحاولة مرة أخرى.'
                        : isHindi
                            ? 'आइटम जोड़ना संभव नहीं हुआ। कृपया फिर से प्रयास करें।'
                            : 'Failed to add item. Please try again.';
                try {
                    const err = await res.json();
                    if (err?.detail && typeof err.detail === 'string') {
                        failMsg = err.detail;
                    }
                } catch (_) { }
                setMessages(prev => [...prev, { id: Date.now(), text: failMsg, isUser: false }]);
                if (liveMode) {
                    const ttsLang = bcp47 || detectedLanguage || scriptInfo?.lang || 'en-US';
                    speak(failMsg, { rate: DEFAULT_TTS_RATE, lang: ttsLang, onEnd: () => restartListeningIfLive(300) });
                }
            }
        } catch (err) {
            console.error('Direct add-to-cart failed:', err);
            handleSend(`Add ${med.brand_name}`);
        }
    }, [sessionId, handleSend, liveMode, speak, bcp47, detectedLanguage, scriptInfo, restartListeningIfLive, user?.id]);

    const handleSearchAdd = useCallback((med) => { handleDirectAddToCart(med); setShowSearch(false); }, [handleDirectAddToCart]);

    const handleAddressConfirm = useCallback((address) => {
        setShowAddressModal(false);
        setPendingAddress(address);
        setShowOrderSummary(true);
    }, []);

    const handleOrderConfirm = useCallback(() => {
        setShowOrderSummary(false);
        if (pendingOrderData) {
            // Order already placed by backend (chat flow) — show animation and record update
            setCheckoutOrder(pendingOrderData);
            setShowCheckoutAnim(true);
            const etaDays = pendingOrderData.estimated_delivery ? Math.max(0, Math.round((new Date(pendingOrderData.estimated_delivery) - new Date()) / 86400000)) : null;
            setOrderUpdates(prev => [{
                id: `order-${pendingOrderData.order_id}`,
                order_id: pendingOrderData.order_id,
                estimated_delivery: pendingOrderData.estimated_delivery,
                days_left: etaDays,
                address: pendingOrderData.delivery_address,
                total: pendingOrderData.total,
                items: pendingOrderData.items || [],
                created_at: new Date().toISOString(),
                status: 'Order placed',
            }, ...prev]);
            refreshRefills?.();
            fetchOrderUpdates?.();
            setPendingOrderData(null);
        } else {
            // Address modal flow — send checkout message to backend
            handleSend(`Checkout. Deliver to: ${pendingAddress}`);
        }
    }, [handleSend, pendingAddress, pendingOrderData, refreshRefills, fetchOrderUpdates]);

    const handleOrderSummaryBack = useCallback(() => {
        setShowOrderSummary(false);
        if (pendingOrderData) {
            // Chat flow — order already placed, no going back to address
            // Just close the summary (order is already confirmed on backend)
            setPendingOrderData(null);
        } else {
            setShowAddressModal(true);
        }
    }, [pendingOrderData]);
    const handleCartUpdate = useCallback((updatedCart) => { setCart(updatedCart); }, []);
    const handleRemoveCartItem = useCallback(async (cartItemId) => {
        if (!sessionId || !cartItemId) return;
        try {
            const res = await fetch(`${API_BASE}/cart/${sessionId}/item/${cartItemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: 0 }),
            });
            if (!res.ok) throw new Error('Failed to remove cart item');
            const updatedCart = await res.json();
            setCart(updatedCart);
        } catch (err) {
            console.error('Failed to remove cart item:', err);
            setMessages(prev => [...prev, { id: Date.now(), text: t('sorry'), isUser: false }]);
        }
    }, [sessionId, t]);
    const handleClearCart = useCallback(async () => {
        if (!sessionId) {
            setCart({ items: [], item_count: 0 });
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/cart/${sessionId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to clear cart');
            const data = await res.json();
            setCart(data?.cart || { items: [], item_count: 0 });
        } catch (err) {
            console.error('Failed to clear cart:', err);
        }
    }, [sessionId]);

    // --- Render ---
    if (viewMode === 'admin') {
        return <AdminDashboard user={user} onSwitchToUser={() => setViewMode('user')} />;
    }

    const hasCartItems = cart?.items?.length > 0;
    const isAnyModalOpen = isCartOpen || showCartDetail || isOrdersOpen || showAddressModal || showOrderSummary || showSearch || isPrescriptionModalOpen || showProfileModal || showVoiceSettings || isTraceOpen;

    return (
        <div className="relative min-h-screen bg-surface-snow flex flex-col font-body selection:bg-mediloon-100 overflow-x-hidden">

            {/* ═══════════════════════════════════
                1. HEADER — Glassmorphic with red accent
               ═══════════════════════════════════ */}
            <header className={`sticky top-0 z-40 transition-all duration-300 ${liveMode ? 'opacity-0 -translate-y-full' : 'opacity-100'}`}>
                {/* Red accent line */}
                <div className="h-1 bg-gradient-to-r from-mediloon-500 via-mediloon-600 to-mediloon-500" />
                <div className="bg-white/90 backdrop-blur-xl border-b border-surface-fog/50">
                    <div className="max-w-[95rem] mx-auto px-3 md:px-5 h-14 md:h-16 flex items-center justify-between">
                        {/* Logo */}
                        <img
                            src="/mediloon-logo.webp"
                            alt="Mediloon Logo"
                            className="w-32 h-32 md:w-40 md:h-40 object-contain ml-1 md:ml-2 pointer-events-none"
                        />

                        {/* Nav Actions */}
                        <div className="flex items-center gap-1 md:gap-2">
                            {/* Language Selector */}
                            <LanguageSelector />

                            {/* Search */}
                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2.5 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-xl transition-all duration-200 active:scale-95"
                                title={t('searchMedicines')}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </button>

                            {/* Voice Settings */}
                            <button
                                onClick={() => setShowVoiceSettings(true)}
                                className="p-2.5 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-xl transition-all duration-200 active:scale-95"
                                title={t('voiceSettings')}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>

                            {/* Admin Toggle */}
                            <div className="hidden md:flex bg-surface-cloud rounded-full p-1 border border-surface-fog">
                                <button onClick={() => setViewMode('user')} className={`px-4 py-1.5 rounded-full text-xs font-brand font-semibold transition-all duration-200 ${viewMode === 'user' ? 'bg-white shadow-sm text-ink-primary' : 'text-ink-muted hover:text-ink-primary'}`}>{t('user')}</button>
                                <button onClick={() => setViewMode('admin')} className={`px-4 py-1.5 rounded-full text-xs font-brand font-semibold transition-all duration-200 ${viewMode === 'admin' ? 'bg-white shadow-sm text-ink-primary' : 'text-ink-muted hover:text-ink-primary'}`}>{t('admin')}</button>
                            </div>

                            {/* Auth Section */}
                            {user ? (
                                <div className="flex items-center gap-2 pl-3 ml-1 border-l border-surface-fog">
                                    <button onClick={() => setShowProfileModal(true)} className="p-2 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-xl transition-all duration-200" title={t('editProfile')}>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </button>
                                    <span className="text-sm font-brand font-semibold text-ink-secondary hidden sm:block">{user.name.split(' ')[0]}</span>
                                    <button onClick={handleLogout} className="text-xs font-brand font-semibold text-mediloon-500 hover:text-mediloon-700 hover:underline ml-1 transition-colors">{t('logout')}</button>
                                </div>
                            ) : (
                                <button onClick={() => setShowLogin(true)} className="btn-primary ml-1 md:ml-2 text-xs md:text-sm py-1.5 px-3 md:py-2 md:px-5">{t('signIn')}</button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* ═══════════════════════════════════
                2. MAIN LAYOUT — 3 Column Grid
               ═══════════════════════════════════ */}
            <main className={`max-w-[98rem] mx-auto w-full px-2 py-2 md:px-4 md:py-3 grid grid-cols-1 lg:grid-cols-[340px_1fr_380px] gap-3 md:gap-4 transition-all duration-500 h-[calc(100vh-[3.5rem])] md:h-[calc(100vh-[4rem])] lg:h-[calc(100vh-5.25rem)] overflow-y-auto lg:overflow-hidden ${liveMode && !isAnyModalOpen ? 'blur-md scale-95 opacity-50 pointer-events-none' : ''}`}>

                {/* ─── LEFT COLUMN: Trace ─── */}
                <aside className={`flex flex-col gap-3 order-2 lg:order-1 lg:h-full`}>
                    <div className="flex-1 flex flex-col gap-3 min-h-0">
                        <TracePanel
                            trace={trace}
                            latency={latency}
                            traceUrl={traceUrl}
                            traceId={traceId}
                            externalOpen={isTraceOpen}
                            onExternalClose={() => setTraceOpen(false)}
                            isVoiceMode={liveMode}
                            modalEpoch={modalEpoch}
                        />

                        {/* AI Timeline moved to PastOrdersModal */}
                    </div>
                </aside>


                {/* ─── CENTER COLUMN: Chat Interface ─── */}
                <section className="flex flex-col gap-3 order-1 lg:order-2 lg:h-full min-h-0 overflow-hidden">

                    {/* Feature Highlights (removed to favor the new inline boxes) */}



                    {/* Prescription Upload Button — Refined */}
                    <button
                        onClick={() => document.getElementById('prescription-upload-input').click()}
                        className="w-full p-3.5 bg-white border-2 border-dashed border-mediloon-200 rounded-2xl text-mediloon-600 font-brand font-bold flex items-center justify-center gap-3 transition-all duration-200 hover:border-mediloon-400 hover:bg-mediloon-50 hover:shadow-glow-red-sm active:scale-[0.98] group"
                    >
                        <div className="w-9 h-9 bg-mediloon-100 rounded-xl flex items-center justify-center group-hover:bg-mediloon-200 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <span className="text-sm">{t('uploadPrescription')}</span>
                        <span className="feature-badge-red text-[10px] ml-auto">{t('new')}</span>
                    </button>
                    <input
                        type="file"
                        id="prescription-upload-input"
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e.target.files[0])}
                        disabled={isLoading}
                    />

                    {/* Chat Container */}
                    <div className="flex-1 min-h-0 glass-card-solid flex flex-col overflow-hidden relative">
                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-5 scroll-smooth">
                            {messages.length <= 1 && (
                                <div className="flex flex-col gap-4 mb-6 w-full max-w-2xl mx-auto mt-4">
                                    <div className="text-center mb-2 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
                                        <h3 className="text-[28px] font-brand font-bold text-gray-800 mb-1 tracking-tight">How can I help you?</h3>
                                        <p className="text-[15px] font-body text-gray-500 font-medium">Type a message or tap the microphone to start</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="glass-card flex flex-col items-center text-center p-5 hover-lift hover:border-red-200 hover:shadow-lg transition-all duration-300 animate-fade-in-up group" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
                                            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center shadow-inner mb-3 group-hover:bg-red-500 group-hover:text-white transition-colors duration-300">
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                            </div>
                                            <h4 className="text-gray-800 font-brand font-bold text-lg mb-1.5 tracking-tight">Voice Ordering</h4>
                                            <p className="text-gray-500 text-[13px] font-body leading-snug">Just speak naturally — our AI understands medicines in any language</p>
                                        </div>

                                        <div className="glass-card flex flex-col items-center text-center p-5 hover-lift hover:border-blue-200 hover:shadow-lg transition-all duration-300 animate-fade-in-up group" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
                                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-inner mb-3 group-hover:bg-blue-500 group-hover:text-white transition-colors duration-300">
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            </div>
                                            <h4 className="text-gray-800 font-brand font-bold text-lg mb-1.5 tracking-tight">Smart Refills</h4>
                                            <p className="text-gray-500 text-[13px] font-body leading-snug">AI predicts when you'll run out and reminds you to reorder</p>
                                        </div>

                                        <div className="glass-card flex flex-col items-center text-center p-5 hover-lift hover:border-emerald-200 hover:shadow-lg transition-all duration-300 animate-fade-in-up group" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner mb-3 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </div>
                                            <h4 className="text-gray-800 font-brand font-bold text-lg mb-1.5 tracking-tight">Prescription OCR</h4>
                                            <p className="text-gray-500 text-[13px] font-body leading-snug">Snap a photo of your prescription and we'll handle the rest</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {messages.map((msg) => (
                                <ChatMessage key={msg.id} message={msg.text} isUser={msg.isUser} latency={msg.latency} />
                            ))}
                            {isLoading && <ChatMessage isLoading />}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-2 md:p-4 bg-white/80 backdrop-blur-sm border-t border-surface-fog/50">
                            {candidates.length > 0 && (
                                <div className="mb-4">
                                    <ResultsList
                                        candidates={candidates}
                                        onSelect={(med) => { setSelectedMedId(med.id); handleDirectAddToCart(med); }}
                                        selectedId={selectedMedId}
                                        onFlyToCart={handleFlyToCart}
                                    />
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                {/* ★ Unique Voice Mode Button — Mic with waveform bars */}
                                <button
                                    onClick={toggleLiveMode}
                                    disabled={isLoading}
                                    className={`relative flex-shrink-0 group p-2 -m-2 lg:p-3 lg:-m-3 rounded-[1.4rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mediloon-300 focus-visible:ring-offset-2 transition-all duration-300 ${liveMode ? 'scale-110' : 'hover:scale-105'}`}
                                    title={t('enterVoiceMode')}
                                >
                                    {/* Glow rings */}
                                    <div className={`absolute inset-0 rounded-2xl bg-mediloon-500/15 transition-all duration-500 ${liveMode ? 'scale-[1.8] animate-ping opacity-30' : 'scale-125 opacity-0 group-hover:opacity-40 group-hover:scale-[1.6]'}`} />

                                    {/* Button body — pill with mic + waveform */}
                                    <div className={`relative h-12 px-3 lg:h-14 lg:px-4 rounded-2xl flex items-center gap-2.5 shadow-lg transition-all duration-300 ${liveMode
                                        ? 'bg-gradient-to-r from-mediloon-600 to-mediloon-700 shadow-mediloon-300 shadow-xl'
                                        : 'bg-gradient-to-r from-mediloon-500 to-mediloon-600 shadow-mediloon-200 group-hover:shadow-xl group-hover:shadow-mediloon-300'}`}>
                                        {/* Mic icon */}
                                        <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        </svg>

                                        {/* Animated waveform bars */}
                                        <div className="flex items-center gap-[2px] h-6">
                                            {[0.6, 1, 0.4, 0.8, 0.5, 0.9, 0.3].map((h, i) => (
                                                <div key={i}
                                                    className={`w-[3px] rounded-full bg-white/80 transition-all duration-300 ${liveMode ? 'animate-bounce' : ''}`}
                                                    style={{
                                                        height: `${h * 100}%`,
                                                        animationDelay: `${i * 80}ms`,
                                                        animationDuration: liveMode ? '0.5s' : '1s',
                                                        ...(liveMode ? {} : { animation: `waveIdle ${0.8 + i * 0.15}s ease-in-out infinite alternate`, animationDelay: `${i * 0.1}s` })
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </button>
                                <div className="flex-1 min-w-0">
                                    <TextInput onSend={handleSend} onUpload={handleFileUpload} disabled={isLoading} placeholder={t('typeMessage')} />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>


                {/* ─── RIGHT COLUMN: Cart, Updates, Past Orders ─── */}
                <aside className={`flex flex-col gap-3 order-3 lg:h-full overflow-y-auto ${!user ? 'justify-start' : ''}  `}>

                    {/* Past Orders — Now prominent */}
                    {user && (
                        <div className="flex-shrink-0 animate-fade-in-up">
                            <PastOrdersModal
                                orders={recentOrders}
                                activeOrders={orderUpdates}
                                timeline={refillTimeline}
                                stats={refillStats}
                                consumption={refillConsumption}
                                loading={refillLoading}
                                onReorder={(item) => handleSend(`Reorder ${item.brand_name}`)}
                                externalOpen={isOrdersOpen}
                                onExternalClose={() => setOrdersOpen(false)}
                                isVoiceMode={liveMode}
                                modalEpoch={modalEpoch}
                            />
                        </div>
                    )}

                    {/* Past Orders for non-logged-in users — prompt to sign in */}
                    {!user && (
                        <button
                            onClick={() => setShowLogin(true)}
                            className="w-full flex items-center gap-3 p-3.5 bg-white border border-surface-fog rounded-2xl shadow-sm hover:shadow-md hover:border-mediloon-200 transition-all duration-200 group"
                        >
                            <div className="w-9 h-9 bg-mediloon-50 rounded-xl flex items-center justify-center group-hover:bg-mediloon-100 transition-colors">
                                <svg className="w-5 h-5 text-mediloon-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-brand font-bold text-ink-primary">{t('myOrders')}</p>
                                <p className="text-[10px] text-ink-faint">{t('signInToView')}</p>
                            </div>
                            <svg className="w-4 h-4 text-ink-faint ml-auto group-hover:text-mediloon-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    )}

                    {/* Cart */}
                    <div className="flex-shrink-0" ref={cartRef}>
                        <Cart
                            cart={cart}
                            sessionId={sessionId}
                            onRemove={handleRemoveCartItem}
                            onCheckout={handleCheckoutFlow}
                            onClear={handleClearCart}
                            onCartUpdate={handleCartUpdate}
                        />
                    </div>

                    {/* Updates & Insights */}
                    {user && (
                        <div className="mt-auto glass-card-solid p-4 border border-mediloon-100 animate-fade-in-up hover:shadow-lift transition-all duration-300">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-brand font-bold text-ink-primary flex items-center gap-2 text-sm">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mediloon-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-mediloon-500"></span>
                                    </span>
                                    {t('updatesInsights')}
                                </h3>
                            </div>
                            <div className="bg-surface-snow rounded-2xl p-1">
                                <UpdatesModal
                                    alerts={refillAlerts}
                                    timeline={refillTimeline}
                                    orders={orderUpdates}
                                    loading={refillLoading}
                                    onInitiateOrder={(text) => handleSend(text)}
                                    inline={true}
                                    modalEpoch={modalEpoch}
                                />
                            </div>
                            {refillStats && (
                                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                                    <div className="bg-mediloon-50 rounded-xl p-2.5 border border-mediloon-100">
                                        <p className="text-xl font-brand font-extrabold text-mediloon-600">{refillStats.upcoming_refills}</p>
                                        <p className="text-[10px] text-mediloon-700 font-brand font-semibold uppercase tracking-wider">{t('dueSoon')}</p>
                                    </div>
                                    <div className="bg-mediloon-50 rounded-xl p-2.5 border border-mediloon-100">
                                        <p className="text-xl font-brand font-extrabold text-mediloon-600">{refillStats.avg_adherence}%</p>
                                        <p className="text-[10px] text-mediloon-700 font-brand font-semibold uppercase tracking-wider">{t('adherence')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </aside>
            </main>

            {/* ═══════════════════════════════════
                3. OVERLAYS & MODALS
               ═══════════════════════════════════ */}

            {/* Live Voice Overlay */}
            <LiveOverlay
                isOpen={liveMode}
                onClose={toggleLiveMode}
                isListening={isListening}
                isSpeaking={isSpeaking}
                isLoading={isLoading}
                transcript={transcript}
                messages={messages}
                onUpload={handleFileUpload}
                audioLevel={audioLevel}
                cart={cart}
                scriptInfo={scriptInfo}
                candidates={candidates}
                languageOptions={LANGUAGE_OPTIONS}
                activeLanguage={manualLanguage || detectedLanguage}
                onSelectLanguage={handleLanguageSelect}
                isAnyModalOpen={isAnyModalOpen}
                onRetryListening={startListening}
                onSelectCandidate={(med) => {
                    setSelectedMedId(med.id);
                    handleDirectAddToCart(med);
                    setCandidates([]);
                }}
            />

            {/* Voice Settings Modal */}
            <VoiceSettingsModal
                isOpen={showVoiceSettings}
                onClose={() => setShowVoiceSettings(false)}
                voices={voices}
                currentVoice={selectedVoice}
                onVoiceChange={setVoice}
                isVoiceMode={liveMode}
            />

            {/* Login Modal */}
            {(showLogin || showLoginForCheckout) && <Login onLogin={(data) => {
                setUser(data.user);
                setSessionToken(data.session_token);
                localStorage.setItem('session_token', data.session_token);
                setShowLogin(false);
                setShowLoginForCheckout(false);
                if (!data.user.profile_completed) {
                    setShowProfileModal(true);
                } else if (pendingCheckout) {
                    setPendingCheckout(false);
                    setShowAddressModal(true);
                }
                checkFirstTimeLogin();
            }} onCancel={() => { setShowLogin(false); setShowLoginForCheckout(false); setPendingCheckout(false); }} />}

            {/* Profile Modal */}
            {showProfileModal && user && (
                <UserProfileModal
                    user={user}
                    sessionToken={sessionToken}
                    onUpdate={(updatedUser) => setUser(updatedUser)}
                    onSkip={() => console.log('User skipped profile completion')}
                    onClose={() => {
                        setShowProfileModal(false);
                        if (pendingCheckout) {
                            setPendingCheckout(false);
                            setShowAddressModal(true);
                        }
                    }}
                    isVoiceMode={liveMode}
                />
            )}

            {/* Voice Intro Popup — Unique Waveform Design */}
            {showVoiceIntroPopup && user && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-md text-center shadow-glass-lg m-4 relative overflow-hidden animate-scale-in">
                        {/* Top accent gradient */}
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-mediloon-400 via-mediloon-600 to-mediloon-400" />

                        {/* Animated waveform illustration */}
                        <div className="flex items-end justify-center gap-1 h-16 mb-4 mt-2">
                            {[0.3, 0.5, 0.8, 0.4, 1, 0.6, 0.9, 0.35, 0.7, 0.5, 0.85, 0.4, 0.65].map((h, i) => (
                                <div key={i}
                                    className="w-1.5 rounded-full bg-gradient-to-t from-mediloon-500 to-mediloon-300"
                                    style={{
                                        height: `${h * 100}%`,
                                        animation: `waveIdle ${0.6 + i * 0.12}s ease-in-out infinite alternate`,
                                        animationDelay: `${i * 0.08}s`
                                    }}
                                />
                            ))}
                        </div>

                        {/* Mic orb */}
                        <div className="w-16 h-16 bg-gradient-to-br from-mediloon-500 to-mediloon-700 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-mediloon-200 relative">
                            <div className="absolute inset-0 rounded-full animate-glow-pulse" />
                            <svg className="w-7 h-7 text-white relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        </div>

                        <h2 className="text-2xl font-brand font-extrabold text-ink-primary mb-2">{t('voiceMode')}</h2>
                        <p className="text-ink-muted font-body text-sm mb-6 leading-relaxed">
                            {t('voiceModeDesc')}
                        </p>

                        <button onClick={() => { setShowVoiceIntroPopup(false); toggleLiveMode(); }} className="btn-primary w-full mb-3 flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            {t('startSpeaking')}
                        </button>
                        <button onClick={() => setShowVoiceIntroPopup(false)} className="text-ink-faint hover:text-ink-secondary text-sm font-brand font-medium transition-colors">
                            {t('maybeLater')}
                        </button>
                    </div>
                </div>
            )}

            {user && <RefillNotification customerId={user.id} onReorder={(alert) => handleSend(`Reorder ${alert.brand_name}`)} />}
            <MedicineSearch isOpen={showSearch} onClose={() => setShowSearch(false)} onAddToCart={handleSearchAdd} sessionId={sessionId} />
            <CartDetailModal isOpen={showCartDetail || isCartOpen} onClose={() => { setShowCartDetail(false); setCartOpen(false); }} cart={cart} sessionId={sessionId} onCartUpdate={handleCartUpdate} onCheckout={() => { setShowCartDetail(false); setCartOpen(false); handleCheckoutFlow(); }} isVoiceMode={liveMode} />
            <AddressModal isOpen={showAddressModal} onClose={() => setShowAddressModal(false)} onConfirm={handleAddressConfirm} cart={cart} user={user} isVoiceMode={liveMode} />
            <OrderSummaryModal isOpen={showOrderSummary} onClose={() => setShowOrderSummary(false)} onConfirm={handleOrderConfirm} onBack={handleOrderSummaryBack} cart={cart} address={pendingAddress} isVoiceMode={liveMode} />
            <CheckoutAnimation isOpen={showCheckoutAnim} order={checkoutOrder} onClose={() => setShowCheckoutAnim(false)} />
            <FlyToCartLayer items={flyingItems} cartRef={cartRef} />

            {/* Prescription Upload Modal (agent-controlled) */}
            <PrescriptionModal
                isOpen={isPrescriptionModalOpen}
                mode={prescriptionMode}
                onClose={() => setPrescriptionModalOpen(false)}
                isVoiceMode={liveMode}
            />
        </div>
    );
}
