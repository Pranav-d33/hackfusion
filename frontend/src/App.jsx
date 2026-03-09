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
    const { executeUIAction, isCartOpen, setCartOpen, isOrdersOpen, setOrdersOpen, isPrescriptionModalOpen, setPrescriptionModalOpen, prescriptionMode, setPrescriptionMode, isTraceOpen, setTraceOpen, modalEpoch } = useUI();

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
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.matchMedia('(min-width: 1024px)').matches;
    });

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
    const [dockHeight, setDockHeight] = useState(120);

    // Selection State
    const [selectedMedId, setSelectedMedId] = useState(null);

    // Animation State
    const [flyingItems, setFlyingItems] = useState([]);
    const cartRef = useRef(null);
    const dockRef = useRef(null);
    const liveModeRef = useRef(false);

    // --- Hooks ---
    const {
        isListening,
        isSpeaking,
        isTranscribing,
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
    const cameraInputRef = useRef(null);
    const pendingTranscriptQueueRef = useRef([]);
    const shortVoiceFinalizeTimerRef = useRef(null);
    const transcriptLiveRef = useRef('');

    // Refill predictions hook (used across UI + updates)
    const { timeline: refillTimeline, consumption: refillConsumption, recentOrders, stats: refillStats, alerts: refillAlerts, loading: refillLoading, refresh: refreshRefills } = useRefillPredictions(user?.id);

    // Effects
    useEffect(() => {
        const token = localStorage.getItem('session_token');
        if (!token || token === 'undefined' || token === 'null') { localStorage.removeItem('session_token'); return; }
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

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const mediaQuery = window.matchMedia('(min-width: 1024px)');
        const handleChange = (event) => {
            setIsDesktop(event.matches);
        };
        setIsDesktop(mediaQuery.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        if (!isDesktop && isTraceOpen) {
            setTraceOpen(false);
        }
    }, [isDesktop, isTraceOpen, setTraceOpen]);

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
    const scrollToBottom = useCallback((behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);
    useEffect(() => {
        if (messages.length > 1 || isLoading) {
            scrollToBottom();
        }
    }, [messages, isLoading, scrollToBottom]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const dockEl = dockRef.current;
        if (!dockEl) return undefined;

        const measureDock = () => {
            const nextHeight = Math.ceil(dockEl.getBoundingClientRect().height || 0);
            setDockHeight(prev => (prev === nextHeight ? prev : nextHeight));
        };

        measureDock();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measureDock);
            return () => window.removeEventListener('resize', measureDock);
        }

        const observer = new ResizeObserver(measureDock);
        observer.observe(dockEl);
        window.addEventListener('resize', measureDock);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measureDock);
        };
    }, []);

    useEffect(() => {
        if (dockHeight > 0 && (messages.length > 1 || isLoading || candidates.length > 0)) {
            scrollToBottom();
        }
    }, [dockHeight, messages.length, isLoading, candidates.length, scrollToBottom]);

    // Handle Transcript from Voice
    useEffect(() => {
        liveModeRef.current = liveMode;
    }, [liveMode]);

    const restartListeningIfLive = useCallback((delayMs = 500) => {
        setTimeout(() => {
            // Safety check: never restart while speaking (prevents echo)
            if (liveModeRef.current && !isSpeaking) startListening();
        }, delayMs);
    }, [startListening, isSpeaking]);

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

    // Voice mode stall recovery: auto-restart listening when idle
    // Quick restart (500ms) when no transcript (e.g. no-speech), slower (5s) safety net
    useEffect(() => {
        if (!liveMode || isListening || isSpeaking || isLoading) return;
        const delay = transcript ? 5000 : 500;
        const timer = setTimeout(() => {
            console.warn('[VoiceMode] Stall detected — auto-restarting listening');
            startListening();
        }, delay);
        return () => clearTimeout(timer);
    }, [liveMode, isListening, isSpeaking, isLoading, transcript, startListening]);

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
        // Strip base64 payload from display text (keep it only for the API call)
        const displayText = text.replace(/\s*\|BASE64:[^\s]*/, '');
        const userMsg = { id: Date.now(), text: displayText, isUser: true };
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
                setMessages(prev => {
                    // On first real response, replace the static welcome message
                    const filtered = prev.length > 0 && prev[0].id === 0 && !prev[0].isUser
                        ? prev.filter(m => m.isUser)  // keep only user messages, drop static welcome
                        : prev;
                    return [...filtered, {
                        id: Date.now() + 1,
                        text: data.message,
                        isUser: false,
                        latency: data.latency_ms,
                    }];
                });
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
                    speak(msgToSpeak, { rate: DEFAULT_TTS_RATE, lang: ttsLang, onEnd: () => restartListeningIfLive(700) });
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
                    onEnd: () => restartListeningIfLive(700),
                });
            }
        } finally {
            clearTimeout(timeoutId);
            setIsLoading(false);
        }
    }, [sessionId, isLoading, liveMode, speak, stopListening, scriptInfo, detectedLanguage, bcp47, handleCheckoutFlow, user, user?.id, refreshRefills, executeUIAction, restartListeningIfLive, t]);

    // Flush any queued checkout chat message from handleCheckoutFlow
    useEffect(() => {
        if (pendingCheckoutChatRef.current && !isLoading) {
            const msg = pendingCheckoutChatRef.current;
            pendingCheckoutChatRef.current = null;
            handleSend(msg);
        }
    }, [isLoading, handleSend]);
    useEffect(() => {
        if (transcript && !isListening && !isSpeaking) {
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
    }, [isListening, isSpeaking, transcript, isLoading, handleSend, setTranscript]);

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
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Upload failed');
            }
            const data = await response.json();
            // Reset isLoading before calling handleSend so it doesn't get blocked
            setIsLoading(false);
            // Send base64 image data inline so OCR works on Vercel (no ephemeral filesystem dependency)
            const msg = data.image_base64
                ? `Please analyze this prescription file: ${data.filepath} |BASE64:${data.mime_type}:${data.image_base64}`
                : `Please analyze this prescription file: ${data.filepath}`;
            handleSend(msg);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { id: Date.now() + 1, text: t('uploadFailed'), isUser: false }]);
            setIsLoading(false);
        }
    }, [handleSend, isLoading, t]);

    const openPrescriptionFilePicker = useCallback(() => {
        if (isLoading) return;
        document.getElementById('prescription-upload-input')?.click();
    }, [isLoading]);

    const openStartWithPrescription = useCallback(() => {
        if (isLoading) return;
        setPrescriptionMode('start');
        setPrescriptionModalOpen(true);
    }, [isLoading, setPrescriptionMode, setPrescriptionModalOpen]);

    const openAddPrescription = useCallback(() => {
        if (isLoading) return;
        setPrescriptionMode('add');
        setPrescriptionModalOpen(true);
    }, [isLoading, setPrescriptionMode, setPrescriptionModalOpen]);

    const openPrescriptionCamera = useCallback(() => {
        if (isLoading) return;
        cameraInputRef.current?.click();
    }, [isLoading]);

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
                    speak(ttsMsg, { rate: DEFAULT_TTS_RATE, lang: ttsLang, onEnd: () => restartListeningIfLive(700) });
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
                    speak(failMsg, { rate: DEFAULT_TTS_RATE, lang: ttsLang, onEnd: () => restartListeningIfLive(700) });
                }
            }
        } catch (err) {
            console.error('Direct add-to-cart failed:', err);
            handleSend(`Add ${med.brand_name}`);
        }
    }, [sessionId, handleSend, liveMode, speak, stopListening, bcp47, detectedLanguage, scriptInfo, restartListeningIfLive, user?.id]);

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
    const isAnyModalOpen = isCartOpen || showCartDetail || isOrdersOpen || showAddressModal || showOrderSummary || showSearch || isPrescriptionModalOpen || showProfileModal || showVoiceSettings || (isDesktop && isTraceOpen);

    return (
        <div className="ambient-canvas fixed inset-0 overflow-hidden flex flex-col font-body selection:bg-mediloon-200">
            {/* Ambient Animated Orbs */}
            <div className="ambient-orb bg-indigo-300 w-[600px] h-[600px] top-[-100px] left-[-100px] animate-orb-float-1" />
            <div className="ambient-orb bg-blue-300 w-[500px] h-[500px] bottom-[-50px] right-[-50px] animate-orb-float-2" />
            <div className="ambient-orb bg-violet-300 w-[700px] h-[700px] top-[20%] right-[30%] animate-orb-float-3" />

            {/* ═══════════════════════════════════
                 1. FLOATING HEADER — Apple Glass
                ═══════════════════════════════════ */}
            <header className={`fixed top-2 md:top-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] md:w-full max-w-4xl z-50 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${liveMode ? 'opacity-0 -translate-y-full' : 'opacity-100'}`}>
                <div className="bg-white/60 backdrop-blur-3xl border border-white/50 shadow-apple-lg rounded-full md:rounded-[2rem] px-2 md:px-6 h-14 md:h-16 flex items-center justify-between">
                    <div className="max-w-[95rem] mx-auto px-2 md:px-6 h-12 md:h-14 flex items-center justify-between w-full">
                        {/* Logo + Tagline */}
                        <div className="flex items-center gap-2.5 md:gap-3">
                            <div className="w-8 h-8 md:w-9 md:h-9 bg-mediloon-600 rounded-[10px] flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-base md:text-lg font-brand font-bold tracking-[-0.02em] leading-none">
                                    <span className="text-mediloon-600">Med</span><span className="text-ink-primary">Aura</span>
                                </h1>
                                <p className="text-[9px] md:text-[10px] font-brand font-medium text-ink-faint uppercase tracking-[0.12em] leading-none mt-0.5">AI Voice Pharmacy</p>
                            </div>
                        </div>

                        {/* Nav Actions */}
                        <div className="flex items-center gap-0.5 md:gap-1.5">
                            <LanguageSelector />

                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-lg transition-all duration-200 active:scale-95"
                                title={t('searchMedicines')}
                            >
                                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </button>

                            <button
                                onClick={() => setShowVoiceSettings(true)}
                                className="p-2 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-lg transition-all duration-200 active:scale-95"
                                title={t('voiceSettings')}
                            >
                                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>

                            {/* Voice Mode CTA — clean pill */}
                            <button
                                onClick={toggleLiveMode}
                                className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-full font-brand font-semibold text-xs transition-all duration-200 ${liveMode
                                    ? 'bg-mediloon-600 text-white shadow-glow-red'
                                    : 'bg-mediloon-600 text-white hover:bg-mediloon-700 active:scale-[0.97]'}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                {liveMode ? 'Voice On' : 'Voice Mode'}
                                {!liveMode && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/60 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span></span>}
                            </button>

                            {/* Admin Toggle */}
                            <div className="hidden md:flex bg-surface-cloud rounded-full p-0.5 ml-1">
                                <button onClick={() => setViewMode('user')} className={`px-3.5 py-1.5 rounded-full text-xs font-brand font-medium transition-all duration-200 ${viewMode === 'user' ? 'bg-white shadow-sm text-ink-primary' : 'text-ink-muted hover:text-ink-primary'}`}>{t('user')}</button>
                                <button onClick={() => setViewMode('admin')} className={`px-3.5 py-1.5 rounded-full text-xs font-brand font-medium transition-all duration-200 ${viewMode === 'admin' ? 'bg-white shadow-sm text-ink-primary' : 'text-ink-muted hover:text-ink-primary'}`}>{t('admin')}</button>
                            </div>

                            {/* Auth Section */}
                            {user ? (
                                <div className="flex items-center gap-2 pl-2.5 ml-1.5 border-l border-black/[0.06]">
                                    <button onClick={() => setShowProfileModal(true)} className="p-2 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-lg transition-all duration-200" title={t('editProfile')}>
                                        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </button>
                                    <span className="text-sm font-brand font-medium text-ink-secondary hidden sm:block">{user.name.split(' ')[0]}</span>
                                    <button onClick={handleLogout} className="text-xs font-brand font-medium text-ink-muted hover:text-mediloon-600 ml-1 transition-colors">{t('logout')}</button>
                                </div>
                            ) : (
                                <button onClick={() => setShowLogin(true)} className="btn-primary ml-1 md:ml-2 text-xs py-1.5 px-4">{t('signIn')}</button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* ═══════════════════════════════════
                2. AMBIENT LAYOUT — Floating Streams
               ═══════════════════════════════════ */}
            <main
                className={`relative w-full overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${liveMode && !isAnyModalOpen ? 'blur-xl scale-95 opacity-40 pointer-events-none' : ''}`}
                style={{ height: 'var(--app-height)' }}
            >

                {/* ─── LEFT FLOATING WIDGET (Desktop Only) ─── */}
                {isDesktop && (
                    <aside className="fixed left-6 top-24 bottom-28 w-[340px] z-30 flex flex-col gap-4 overflow-y-auto scrollbar-hide pointer-events-auto">
                        <div className="flex-shrink-0">
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
                        </div>

                        {/* Updates & Insights */}
                        {user && (
                            <div className="glass-card-solid p-4 border border-mediloon-100 animate-fade-in-up hover:shadow-lift transition-all duration-300">
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

                        {/* ─── Creator Contact Card ─── */}
                        <div className="creator-card group mt-auto flex-shrink-0">
                            {/* Animated gradient border */}
                            <div className="creator-card-border" />
                            <div className="relative bg-white rounded-[1.3rem] p-4 z-10">
                                {/* Header row */}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-mediloon-600 rounded-full flex items-center justify-center text-white font-brand font-bold text-sm group-hover:scale-110 transition-transform duration-500">
                                        PD
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-brand font-bold text-ink-primary text-sm leading-tight">Pranav Dhiran</p>
                                        <p className="text-[10px] text-ink-faint font-brand font-semibold uppercase tracking-wider">Creator & AI Engineer</p>
                                    </div>
                                    {/* Floating particles */}
                                    <div className="creator-particles">
                                        <span /><span /><span />
                                    </div>
                                </div>

                                {/* Contact links */}
                                <div className="grid grid-cols-2 gap-1.5">
                                    <a href="tel:+918999629839" className="creator-link group/link" title="Call">
                                        <svg className="w-3.5 h-3.5 text-mediloon-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                        <span className="text-[10px] font-brand font-semibold text-ink-secondary group-hover/link:text-mediloon-600">+91-8999629839</span>
                                    </a>
                                    <a href="mailto:2023bec105@sggs.ac.in" className="creator-link group/link" title="Email">
                                        <svg className="w-3.5 h-3.5 text-mediloon-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        <span className="text-[10px] font-brand font-semibold text-ink-secondary group-hover/link:text-mediloon-600 truncate">Email</span>
                                    </a>
                                    <a href="https://linkedin.com/in/prannav-dhiran" target="_blank" rel="noopener noreferrer" className="creator-link group/link" title="LinkedIn">
                                        <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z" /></svg>
                                        <span className="text-[10px] font-brand font-semibold text-ink-secondary group-hover/link:text-blue-600">LinkedIn</span>
                                    </a>
                                    <a href="https://github.com/Pranav-d33" target="_blank" rel="noopener noreferrer" className="creator-link group/link" title="GitHub">
                                        <svg className="w-3.5 h-3.5 text-ink-primary" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
                                        <span className="text-[10px] font-brand font-semibold text-ink-secondary group-hover/link:text-ink-primary">GitHub</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </aside>
                )}

                {/* ─── CENTER CHAT STREAM ─── */}
                <section className="absolute inset-0 z-20 flex flex-col lg:px-[400px] overflow-hidden">
                    <div
                        className="flex-1 w-full max-w-3xl mx-auto h-full overflow-y-auto pt-24 md:pt-28 px-3 sm:px-4 md:px-8 scroll-smooth scrollbar-hide mask-gradient-to-b flex flex-col"
                        style={{ paddingBottom: `calc(${dockHeight}px + var(--safe-area-bottom) + 1rem)` }}
                    >

                        {/* Feature Highlights (removed to favor the new inline boxes) */}



                        {/* System Active & Prescription Actions Combined */}
                        <div className="w-full bg-white border border-mediloon-100 rounded-2xl shadow-sm p-2 sm:p-3 mb-2 flex items-center justify-between gap-2 sm:gap-4 relative overflow-hidden group hover:border-mediloon-200 transition-colors">
                            {/* Ambient Glow */}
                            <div className="absolute -left-10 -top-10 w-32 h-32 bg-mediloon-100/30 rounded-full blur-3xl group-hover:bg-mediloon-100/50 transition-colors pointer-events-none" />

                            {/* Left Side: System Active Orb & Text */}
                            <div className="flex items-center gap-1.5 sm:gap-3 relative z-10 pl-1 sm:pl-2 shrink-0">
                                <div className="relative w-8 h-8 sm:w-10 sm:h-10 flex flex-shrink-0 items-center justify-center">
                                    {/* Outer rings */}
                                    <div className="absolute inset-0 rounded-full border border-mediloon-500/20 scale-100 group-hover:scale-110 transition-transform duration-700" />
                                    <div className="absolute inset-0 rounded-full border border-mediloon-500/10 scale-75 group-hover:scale-90 transition-transform duration-700 delay-75" />
                                    {/* Inner pulse */}
                                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-mediloon-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                                </div>
                                <div className="flex flex-col hidden sm:flex">
                                    <span className="text-[11px] font-brand tracking-[0.15em] text-mediloon-600 font-bold uppercase leading-tight">{t('systemActive')}</span>
                                    <span className="text-[10px] font-body text-ink-muted leading-tight">Ready to assist</span>
                                </div>
                            </div>

                            {/* Right Side: Prescription Options */}
                            <div className="flex items-center gap-1 sm:gap-2 relative z-10 shrink">
                                <button
                                    onClick={openStartWithPrescription}
                                    disabled={isLoading}
                                    className="px-2 py-1.5 sm:px-3 sm:py-2 bg-mediloon-50 hover:bg-mediloon-100 text-mediloon-700 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-brand font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap"
                                >
                                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span className="hidden sm:inline">{t('startWithPrescription')}</span>
                                    <span className="sm:hidden">Start flow</span>
                                    <span className="bg-red-500 text-white text-[8px] sm:text-[9px] px-1 rounded uppercase min-w-max ml-0.5">{t('new')}</span>
                                </button>
                                <button
                                    onClick={openAddPrescription}
                                    disabled={isLoading}
                                    className="px-2 py-1.5 sm:px-3 sm:py-2 bg-mediloon-50 hover:bg-mediloon-100 text-mediloon-700 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-brand font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap"
                                >
                                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 7a2 2 0 012-2h2l1.5-1.5A2 2 0 0110 3h4a2 2 0 011.5.5L17 5h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    <span className="hidden sm:inline">{t('addPrescription')}</span>
                                    <span className="sm:hidden">Add Rx</span>
                                </button>
                            </div>
                        </div>
                        <input
                            type="file"
                            id="prescription-upload-input"
                            className="hidden"
                            accept="image/*,.pdf"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file);
                                e.target.value = '';
                            }}
                            disabled={isLoading}
                        />
                        <input
                            type="file"
                            id="prescription-camera-input"
                            ref={cameraInputRef}
                            className="hidden"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file);
                                e.target.value = '';
                            }}
                            disabled={isLoading}
                        />

                        {/* Chat Messages */}
                        {messages.length <= 1 && (
                            <div className="flex flex-col gap-6 lg:gap-8 mb-8 w-full max-w-4xl mx-auto mt-8 lg:mt-16">
                                <div className="text-center mb-3 sm:mb-4 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
                                    <h3 className="text-3xl sm:text-4xl lg:text-[3.2rem] font-brand font-bold text-ink-primary mb-1.5 sm:mb-3 tracking-[-0.03em] leading-tight">
                                        Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}
                                        {user ? `, ${user.name.split(' ')[0]}` : ''}.
                                    </h3>
                                    <p className="text-[15px] sm:text-[17px] font-body text-ink-secondary">How can MedAura assist you today?</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-6 px-2">
                                    <div className="bg-white/60 backdrop-blur-2xl border border-white/50 rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-7 shadow-apple-lg hover:shadow-apple-xl transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] animate-fade-in-up group cursor-pointer hover:-translate-y-1 flex md:block items-center gap-4 md:gap-0" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
                                        <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl md:rounded-2xl bg-indigo-50/80 text-indigo-600 flex items-center justify-center md:mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-400 shadow-sm border border-indigo-100/50">
                                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-ink-primary font-brand font-bold text-[15px] md:text-[17px] mb-0.5 md:mb-1.5 tracking-[-0.01em]">Voice Ordering</h4>
                                            <p className="text-ink-muted text-[13px] md:text-[14px] font-body leading-tight md:leading-relaxed">Speak naturally — our AI understands medicines in any language.</p>
                                        </div>
                                    </div>

                                    <div className="bg-white/60 backdrop-blur-2xl border border-white/50 rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-7 shadow-apple-lg hover:shadow-apple-xl transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] animate-fade-in-up group cursor-pointer hover:-translate-y-1 flex md:block items-center gap-4 md:gap-0" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
                                        <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl md:rounded-2xl bg-blue-50/80 text-blue-600 flex items-center justify-center md:mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-400 shadow-sm border border-blue-100/50">
                                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-ink-primary font-brand font-bold text-[15px] md:text-[17px] mb-0.5 md:mb-1.5 tracking-[-0.01em]">Smart Refills</h4>
                                            <p className="text-ink-muted text-[13px] md:text-[14px] font-body leading-tight md:leading-relaxed">AI predicts when you'll run out and reminds you to reorder.</p>
                                        </div>
                                    </div>

                                    <div className="bg-white/60 backdrop-blur-2xl border border-white/50 rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-7 shadow-apple-lg hover:shadow-apple-xl transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] animate-fade-in-up group cursor-pointer hover:-translate-y-1 flex md:block items-center gap-4 md:gap-0" style={{ animationDelay: '0.4s', animationFillMode: 'both' }} onClick={openAddPrescription}>
                                        <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl md:rounded-2xl bg-violet-50/80 text-violet-600 flex items-center justify-center md:mb-4 group-hover:bg-violet-600 group-hover:text-white transition-colors duration-400 shadow-sm border border-violet-100/50">
                                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-ink-primary font-brand font-bold text-[15px] md:text-[17px] mb-0.5 md:mb-1.5 tracking-[-0.01em]">Prescription OCR</h4>
                                            <p className="text-ink-muted text-[13px] md:text-[14px] font-body leading-tight md:leading-relaxed">Snap a photo of your prescription and we'll extract the medicines.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <ChatMessage key={msg.id} message={msg.text} isUser={msg.isUser} latency={msg.latency} />
                        ))}
                        {isLoading && <ChatMessage isLoading />}
                        <div ref={messagesEndRef} className="h-4" />
                    </div>
                </section>

                {/* ─── DYNAMIC DOCK (Input Area) ─── */}
                <div
                    ref={dockRef}
                    className={`fixed left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] md:w-full max-w-2xl z-40 pointer-events-auto transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${liveMode ? 'opacity-0 translate-y-[150%]' : 'opacity-100 translate-y-0'}`}
                    style={{ bottom: 'calc(var(--safe-area-bottom) + 1rem)' }}
                >
                    <div className="dynamic-dock rounded-3xl md:rounded-[2.5rem] p-2 md:p-3 flex flex-col">
                        {candidates.length > 0 && (
                            <div className="mb-3 px-1 md:px-2 max-h-[34vh] overflow-y-auto overscroll-contain scrollbar-hide">
                                <ResultsList
                                    candidates={candidates}
                                    onSelect={(med) => { setSelectedMedId(med.id); handleDirectAddToCart(med); }}
                                    selectedId={selectedMedId}
                                    onFlyToCart={handleFlyToCart}
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-2 md:gap-3">
                            {/* Voice Mode Button — Dynamic Island orb */}
                            <button
                                onClick={toggleLiveMode}
                                disabled={isLoading}
                                className={`relative flex-shrink-0 group p-2 rounded-[2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition-all duration-300 ${liveMode ? 'scale-105' : 'hover:scale-105 active:scale-95'}`}
                                title={t('enterVoiceMode')}
                            >
                                <div className="relative h-11 w-11 md:h-12 md:w-12 lg:h-14 lg:w-14 rounded-full flex items-center justify-center bg-gradient-to-tr from-indigo-500 via-blue-500 to-cyan-400 shadow-apple-lg hover:shadow-apple-xl transition-all duration-300 overflow-hidden">
                                    <div className="absolute inset-0 bg-white/20 mix-blend-overlay group-hover:opacity-100 opacity-0 transition-opacity" />
                                    <svg className="w-5 h-5 text-white flex-shrink-0 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                </div>
                            </button>
                            <div className="flex-1 min-w-0 pr-2">
                                <TextInput onSend={handleSend} onUpload={handleFileUpload} disabled={isLoading} placeholder="Ask anything or search medicines..." />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── RIGHT FLOATING WIDGET (Desktop Only) ─── */}
                {isDesktop && (
                    <aside className="fixed right-6 top-24 bottom-28 w-[380px] z-30 flex flex-col gap-4 overflow-y-auto scrollbar-hide pointer-events-auto">

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
                                className="w-full flex items-center gap-3 p-3 bg-white border border-surface-fog rounded-xl shadow-sm hover:shadow-md hover:border-mediloon-200 transition-all duration-200 group"
                            >
                                <div className="w-8 h-8 bg-mediloon-50 rounded-lg flex items-center justify-center group-hover:bg-mediloon-100 transition-colors">
                                    <svg className="w-4 h-4 text-mediloon-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
                    </aside>
                )}
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
                isTranscribing={isTranscribing}
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
                onOpenStartWithPrescription={openStartWithPrescription}
                onOpenAddPrescription={openAddPrescription}
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
                if (!data?.user || !data?.session_token) { console.error('Login returned invalid data:', data); return; }
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
                    <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-apple-lg m-4 relative overflow-hidden animate-scale-in">
                        {/* Top accent */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-mediloon-600" />

                        {/* Animated waveform */}
                        <div className="flex items-end justify-center gap-1 h-16 mb-4 mt-2">
                            {[0.3, 0.5, 0.8, 0.4, 1, 0.6, 0.9, 0.35, 0.7, 0.5, 0.85, 0.4, 0.65].map((h, i) => (
                                <div key={i}
                                    className="w-1.5 rounded-full bg-mediloon-400"
                                    style={{
                                        height: `${h * 100}%`,
                                        animation: `waveIdle ${0.6 + i * 0.12}s ease-in-out infinite alternate`,
                                        animationDelay: `${i * 0.08}s`
                                    }}
                                />
                            ))}
                        </div>

                        {/* Mic orb */}
                        <div className="w-14 h-14 bg-mediloon-600 rounded-full flex items-center justify-center mx-auto mb-5 relative">
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
                onChooseFile={openPrescriptionFilePicker}
                onCapturePhoto={openPrescriptionCamera}
                isLoading={isLoading}
                isVoiceMode={liveMode}
            />
        </div>
    );
}
