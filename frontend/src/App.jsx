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
import CheckoutAnimation from './components/CheckoutAnimation';
import CartDetailModal from './components/CartDetailModal';
import PredictionTimeline from './components/PredictionTimeline';
import PastOrdersModal from './components/PastOrdersModal';
import UpdatesModal from './components/UpdatesModal';
import { useSpeech } from './hooks/useSpeech';
import { useRefillPredictions } from './hooks/useRefillPredictions';

const API_BASE = '/api';

/* ──────────────────────────────────────────
   Feature Highlight Cards (shown above chat)
   ────────────────────────────────────────── */
function FeatureCards() {
    const features = [
        {
            icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
            ),
            title: 'Voice Ordering',
            desc: 'Just speak naturally — our AI understands medicines in any language',
            color: 'mediloon',
        },
        {
            icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            ),
            title: 'Smart Refills',
            desc: 'AI predicts when you\'ll run out and reminds you to reorder',
            color: 'violet',
        },
        {
            icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            title: 'Prescription OCR',
            desc: 'Snap a photo of your prescription and we\'ll handle the rest',
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
    // --- State ---
    const [messages, setMessages] = useState([{
        id: 0,
        text: "Hi! I'm Mediloon AI. Need a medicine or have a prescription? Just ask!",
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
    const [selectedMedId, setSelectedMedId] = useState(null);
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

    // Animation State
    const [flyingItems, setFlyingItems] = useState([]);
    const cartRef = useRef(null);

    // --- Hooks ---
    const {
        isListening,
        isSpeaking,
        transcript,
        audioLevel,
        startListening,
        stopListening,
        speak,
        stopSpeaking,
        setTranscript,
        scriptInfo,
        voices,
        selectedVoice,
        setVoice
    } = useSpeech();
    const messagesEndRef = useRef(null);

    // --- Effects ---
    useEffect(() => {
        const token = localStorage.getItem('session_token');
        if (!token) return;
        let active = true;
        const restoreSession = async () => {
            try {
                const response = await fetch(`${API_BASE}/auth/me?session_token=${encodeURIComponent(token)}`);
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
        if (transcript && !isListening) {
            handleSend(transcript);
            setTranscript('');
        }
    }, [isListening, transcript]);

    const handleFlyToCart = useCallback((startRect) => {
        const id = Date.now();
        setFlyingItems(prev => [...prev, { id, startRect, onComplete: () => setFlyingItems(p => p.filter(i => i.id !== id)) }]);
    }, []);

    // --- Handlers ---
    const toggleLiveMode = () => {
        if (liveMode) {
            setLiveMode(false); stopListening(); stopSpeaking();
        } else {
            setLiveMode(true); startListening();
        }
    };

    // Checkout flow: enforce login first (defined before handleSend so it can be referenced)
    const handleCheckoutFlow = useCallback(() => {
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
        setShowAddressModal(true);
    }, [user]);

    const handleSend = useCallback(async (text) => {
        if (!text.trim() || isLoading) return;
        const userMsg = { id: Date.now(), text, isUser: true };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: text,
                    source: liveMode ? 'voice' : 'text',
                    language: scriptInfo?.lang || 'en-US',
                }),
            });
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            if (data.session_id) setSessionId(data.session_id);
            if (data.message) {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    text: data.message,
                    isUser: false,
                    latency: data.latency_ms,
                }]);
                const msgToSpeak = data.tts_message || data.message;
                if (liveMode && msgToSpeak) {
                    const ttsLang = scriptInfo?.lang || 'en-US';
                    speak(msgToSpeak, { rate: 0.92, lang: ttsLang, onEnd: () => setTimeout(() => startListening(), 300) });
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
            } else if (data.action_taken === 'checkout' && data.order) {
                setCheckoutOrder(data.order); setShowCheckoutAnim(true);
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { id: Date.now() + 1, text: "Sorry, I encountered an issue.", isUser: false }]);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, isLoading, liveMode, speak, startListening, scriptInfo, handleCheckoutFlow]);

    const handleFileUpload = useCallback(async (file) => {
        if (!file || isLoading) return;
        setMessages(prev => [...prev, { id: Date.now(), text: `Uploading ${file.name}...`, isUser: true }]);
        setIsLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`${API_BASE}/upload/prescription`, { method: 'POST', body: formData });
            const data = await response.json();
            handleSend(`Please analyze this prescription file: ${data.filepath}`);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { id: Date.now() + 1, text: "Upload failed.", isUser: false }]);
            setIsLoading(false);
        }
    }, [handleSend, isLoading]);

    const handleLogout = () => {
        if (sessionToken) fetch(`${API_BASE}/auth/logout?session_token=${encodeURIComponent(sessionToken)}`, { method: 'POST' }).catch(() => { });
        localStorage.removeItem('session_token');
        setUser(null); setSessionToken(null);
    };

    // Direct add-to-cart via API (bypasses LLM for reliability)
    const handleDirectAddToCart = useCallback(async (med) => {
        let sid = sessionId;
        if (!sid) {
            try {
                const initRes = await fetch(`${API_BASE}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'hello', source: 'text' }),
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
            const res = await fetch(`${API_BASE}/cart/${sid}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ med_id: med.id, qty: 1 }),
            });
            if (res.ok) {
                const updatedCart = await res.json();
                setCart(updatedCart);
                const confirmMsg = `Added ${med.brand_name} to your cart.${updatedCart.warning ? ' ' + updatedCart.warning : ''}`;
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: confirmMsg,
                    isUser: false,
                }]);
                // Speak confirmation in voice mode
                if (liveMode) {
                    const ttsMsg = `Added ${med.brand_name} to your cart. ${updatedCart.item_count} item${updatedCart.item_count !== 1 ? 's' : ''} total. Add more or say checkout.`;
                    speak(ttsMsg, { rate: 0.92, onEnd: () => setTimeout(() => startListening(), 300) });
                }
            } else {
                const failMsg = 'Failed to add item. Please try again.';
                setMessages(prev => [...prev, { id: Date.now(), text: failMsg, isUser: false }]);
                if (liveMode) speak(failMsg, { rate: 0.92, onEnd: () => setTimeout(() => startListening(), 300) });
            }
        } catch (err) {
            console.error('Direct add-to-cart failed:', err);
            handleSend(`Add ${med.brand_name}`);
        }
    }, [sessionId, handleSend, liveMode, speak, startListening]);

    const handleSearchAdd = useCallback((med) => { handleDirectAddToCart(med); setShowSearch(false); }, [handleDirectAddToCart]);

    const handleAddressConfirm = useCallback((address) => { setShowAddressModal(false); handleSend(`Checkout. Deliver to: ${address}`); }, [handleSend]);
    const handleCartUpdate = useCallback((updatedCart) => { setCart(updatedCart); }, []);

    // Refill predictions hook
    const { timeline: refillTimeline, consumption: refillConsumption, recentOrders, stats: refillStats, alerts: refillAlerts, loading: refillLoading, refresh: refreshRefills } = useRefillPredictions(user?.id);

    // --- Render ---
    if (viewMode === 'admin') {
        return <AdminDashboard user={user} onSwitchToUser={() => setViewMode('user')} />;
    }

    const hasCartItems = cart?.items?.length > 0;

    return (
        <div className="relative min-h-screen bg-surface-snow flex flex-col font-body selection:bg-mediloon-100 overflow-x-hidden">

            {/* ═══════════════════════════════════
                1. HEADER — Glassmorphic with red accent
               ═══════════════════════════════════ */}
            <header className={`sticky top-0 z-40 transition-all duration-300 ${liveMode ? 'opacity-0 -translate-y-full' : 'opacity-100'}`}>
                {/* Red accent line */}
                <div className="h-1 bg-gradient-to-r from-mediloon-500 via-mediloon-600 to-mediloon-500" />
                <div className="bg-white/90 backdrop-blur-xl border-b border-surface-fog/50">
                    <div className="max-w-[95rem] mx-auto px-5 h-16 flex items-center justify-between">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-mediloon-500 to-mediloon-700 rounded-2xl flex items-center justify-center shadow-lg shadow-mediloon-200 hover:shadow-glow-red transition-shadow duration-300">
                                <span className="text-white font-brand font-black text-xl">M</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-brand font-extrabold text-xl text-ink-primary tracking-tight leading-none">Mediloon</span>
                                <span className="text-[9px] font-brand font-semibold text-mediloon-500 uppercase tracking-[0.2em] leading-none mt-0.5">AI Pharmacy</span>
                            </div>
                        </div>

                        {/* Nav Actions */}
                        <div className="flex items-center gap-2">
                            {/* Search */}
                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2.5 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-xl transition-all duration-200 active:scale-95"
                                title="Search Medicines"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </button>

                            {/* Voice Settings */}
                            <button
                                onClick={() => setShowVoiceSettings(true)}
                                className="p-2.5 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-xl transition-all duration-200 active:scale-95"
                                title="Voice Settings"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>

                            {/* Admin Toggle */}
                            <div className="hidden md:flex bg-surface-cloud rounded-full p-1 border border-surface-fog">
                                <button onClick={() => setViewMode('user')} className={`px-4 py-1.5 rounded-full text-xs font-brand font-semibold transition-all duration-200 ${viewMode === 'user' ? 'bg-white shadow-sm text-ink-primary' : 'text-ink-muted hover:text-ink-primary'}`}>User</button>
                                <button onClick={() => setViewMode('admin')} className={`px-4 py-1.5 rounded-full text-xs font-brand font-semibold transition-all duration-200 ${viewMode === 'admin' ? 'bg-white shadow-sm text-ink-primary' : 'text-ink-muted hover:text-ink-primary'}`}>Admin</button>
                            </div>

                            {/* Auth Section */}
                            {user ? (
                                <div className="flex items-center gap-2 pl-3 ml-1 border-l border-surface-fog">
                                    <button onClick={() => setShowProfileModal(true)} className="p-2 text-ink-muted hover:text-mediloon-600 hover:bg-mediloon-50 rounded-xl transition-all duration-200" title="Edit Profile">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </button>
                                    <span className="text-sm font-brand font-semibold text-ink-secondary hidden sm:block">{user.name.split(' ')[0]}</span>
                                    <button onClick={handleLogout} className="text-xs font-brand font-semibold text-mediloon-500 hover:text-mediloon-700 hover:underline ml-1 transition-colors">Logout</button>
                                </div>
                            ) : (
                                <button onClick={() => setShowLogin(true)} className="btn-primary ml-2 text-sm py-2 px-5">Sign In</button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* ═══════════════════════════════════
                2. MAIN LAYOUT — 3 Column Grid
               ═══════════════════════════════════ */}
            <main className={`max-w-[98rem] mx-auto w-full px-4 py-3 grid grid-cols-1 lg:grid-cols-[340px_1fr_380px] gap-4 transition-all duration-500 lg:h-[calc(100vh-5.25rem)] lg:overflow-hidden overflow-y-auto ${liveMode ? 'blur-md scale-95 opacity-50 pointer-events-none' : ''}`}>

                {/* ─── LEFT COLUMN: Trace ─── */}
                <aside className={`flex flex-col gap-3 order-2 lg:order-1 lg:h-full`}>
                    <div className="flex-1 flex flex-col gap-3 min-h-0">
                        <TracePanel trace={trace} latency={latency} traceUrl={traceUrl} traceId={traceId} />

                        {/* AI Timeline (Moved to Sidebar) */}
                        <div className="flex-1 min-h-0 animate-fade-in-up delay-100">
                            <PredictionTimeline
                                timeline={refillTimeline}
                                consumption={refillConsumption}
                                recentOrders={recentOrders}
                                loading={refillLoading}
                                onReorder={(pred) => handleSend(`Reorder ${pred.brand_name}`)}
                            // showcase={true}  <-- Removing this to use default vertical mode
                            />
                        </div>
                    </div>
                </aside>


                {/* ─── CENTER COLUMN: Chat Interface ─── */}
                <section className="flex flex-col gap-3 order-1 lg:order-2 lg:h-full min-h-0 overflow-hidden">

                    {/* Feature Highlights (shown to everyone) */}
                    <FeatureCards />



                    {/* Prescription Upload Button — Refined */}
                    <button
                        onClick={() => document.getElementById('prescription-upload-input').click()}
                        className="w-full p-3.5 bg-white border-2 border-dashed border-mediloon-200 rounded-2xl text-mediloon-600 font-brand font-bold flex items-center justify-center gap-3 transition-all duration-200 hover:border-mediloon-400 hover:bg-mediloon-50 hover:shadow-glow-red-sm active:scale-[0.98] group"
                    >
                        <div className="w-9 h-9 bg-mediloon-100 rounded-xl flex items-center justify-center group-hover:bg-mediloon-200 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <span className="text-sm">Upload Prescription (OCR)</span>
                        <span className="feature-badge-red text-[10px] ml-auto">NEW</span>
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
                        <div className="flex-1 overflow-y-auto p-6 space-y-5 scroll-smooth">
                            {messages.map((msg) => (
                                <ChatMessage key={msg.id} message={msg.text} isUser={msg.isUser} latency={msg.latency} />
                            ))}
                            {isLoading && <ChatMessage isLoading />}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white/80 backdrop-blur-sm border-t border-surface-fog/50">
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
                                    className={`relative flex-shrink-0 group transition-all duration-300 ${liveMode ? 'scale-110' : 'hover:scale-105'}`}
                                    title="Enter Voice Mode"
                                >
                                    {/* Glow rings */}
                                    <div className={`absolute inset-0 rounded-2xl bg-mediloon-500/15 transition-all duration-500 ${liveMode ? 'scale-[1.8] animate-ping opacity-30' : 'scale-125 opacity-0 group-hover:opacity-40 group-hover:scale-[1.6]'}`} />

                                    {/* Button body — pill with mic + waveform */}
                                    <div className={`relative h-12 px-3 rounded-2xl flex items-center gap-2 shadow-lg transition-all duration-300 ${liveMode
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
                                    <TextInput onSend={handleSend} onUpload={handleFileUpload} disabled={isLoading} />
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
                                loading={refillLoading}
                                onReorder={(item) => handleSend(`Reorder ${item.brand_name}`)}
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
                                <p className="text-sm font-brand font-bold text-ink-primary">Past Orders</p>
                                <p className="text-[10px] text-ink-faint">Sign in to view order history</p>
                            </div>
                            <svg className="w-4 h-4 text-ink-faint ml-auto group-hover:text-mediloon-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    )}

                    {/* Cart */}
                    <div className="flex-shrink-0" ref={cartRef}>
                        <Cart
                            cart={cart}
                            sessionId={sessionId}
                            onRemove={(id) => handleSend("Remove item")}
                            onCheckout={handleCheckoutFlow}
                            onClear={() => setCart({ items: [], item_count: 0 })}
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
                                    Updates & Insights
                                </h3>
                            </div>
                            <div className="bg-surface-snow rounded-2xl p-1">
                                <UpdatesModal
                                    alerts={refillAlerts}
                                    timeline={refillTimeline}
                                    loading={refillLoading}
                                    onInitiateOrder={(text) => handleSend(text)}
                                    inline={true}
                                />
                            </div>
                            {refillStats && (
                                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                                    <div className="bg-mediloon-50 rounded-xl p-2.5 border border-mediloon-100">
                                        <p className="text-xl font-brand font-extrabold text-mediloon-600">{refillStats.upcoming_refills}</p>
                                        <p className="text-[10px] text-mediloon-700 font-brand font-semibold uppercase tracking-wider">Due Soon</p>
                                    </div>
                                    <div className="bg-mediloon-50 rounded-xl p-2.5 border border-mediloon-100">
                                        <p className="text-xl font-brand font-extrabold text-mediloon-600">{refillStats.avg_adherence}%</p>
                                        <p className="text-[10px] text-mediloon-700 font-brand font-semibold uppercase tracking-wider">Adherence</p>
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
                transcript={transcript}
                messages={messages}
                onUpload={handleFileUpload}
                audioLevel={audioLevel}
                cart={cart}
                scriptInfo={scriptInfo}
                candidates={candidates}
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

                        <h2 className="text-2xl font-brand font-extrabold text-ink-primary mb-2">Voice Mode</h2>
                        <p className="text-ink-muted font-body text-sm mb-6 leading-relaxed">
                            Order medicines just by speaking. Tap the mic and talk naturally — like you're at the pharmacy counter.
                        </p>

                        <button onClick={() => { setShowVoiceIntroPopup(false); toggleLiveMode(); }} className="btn-primary w-full mb-3 flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            Start Speaking
                        </button>
                        <button onClick={() => setShowVoiceIntroPopup(false)} className="text-ink-faint hover:text-ink-secondary text-sm font-brand font-medium transition-colors">
                            Maybe later
                        </button>
                    </div>
                </div>
            )}

            {user && <RefillNotification customerId={user.id} onReorder={(alert) => handleSend(`Reorder ${alert.brand_name}`)} />}
            <MedicineSearch isOpen={showSearch} onClose={() => setShowSearch(false)} onAddToCart={handleSearchAdd} sessionId={sessionId} />
            <CartDetailModal isOpen={showCartDetail} onClose={() => setShowCartDetail(false)} cart={cart} sessionId={sessionId} onCartUpdate={handleCartUpdate} onCheckout={() => { setShowCartDetail(false); handleCheckoutFlow(); }} />
            <AddressModal isOpen={showAddressModal} onClose={() => setShowAddressModal(false)} onConfirm={handleAddressConfirm} cart={cart} user={user} />
            <CheckoutAnimation isOpen={showCheckoutAnim} order={checkoutOrder} onClose={() => setShowCheckoutAnim(false)} />
            <FlyToCartLayer items={flyingItems} cartRef={cartRef} />
        </div>
    );
}
