import React, { useState, useEffect, useRef, useCallback } from 'react';
import MicButton from './components/MicButton';
import TextInput from './components/TextInput';
import ChatMessage from './components/ChatMessage';
import ResultsList from './components/ResultsList';
import Cart from './components/Cart';
import TracePanel from './components/TracePanel';
import Login from './components/Login';
import RefillNotification from './components/RefillNotification';
import AdminDashboard from './pages/AdminDashboard';
import LiveOverlay from './components/LiveOverlay';
import FlyToCartLayer from './components/FlyToCartLayer';
import MedicineSearch from './components/MedicineSearch';
import AddressModal from './components/AddressModal';
import CheckoutAnimation from './components/CheckoutAnimation';
import CartDetailModal from './components/CartDetailModal';
import { useSpeech } from './hooks/useSpeech';

const API_BASE = '/api';

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
    const [showLogin, setShowLogin] = useState(false);
    const [viewMode, setViewMode] = useState('user');
    const [liveMode, setLiveMode] = useState(false);
    const [showMobileCart, setShowMobileCart] = useState(false);

    // New UI State
    const [showSearch, setShowSearch] = useState(false);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [showCartDetail, setShowCartDetail] = useState(false);
    const [checkoutOrder, setCheckoutOrder] = useState(null);
    const [showCheckoutAnim, setShowCheckoutAnim] = useState(false);

    // Animation State
    const [flyingItems, setFlyingItems] = useState([]);
    const cartRef = useRef(null);

    // --- Hooks ---
    const { isListening, isSpeaking, transcript, audioLevel, startListening, stopListening, speak, stopSpeaking, setTranscript } = useSpeech();
    const messagesEndRef = useRef(null);

    // --- Effects ---

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
            setLiveMode(false);
            stopListening();
            stopSpeaking();
        } else {
            setLiveMode(true);
            startListening();
        }
    };

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
                }),
            });

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();

            if (data.session_id) setSessionId(data.session_id);
            if (data.message) {
                setMessages(prev => [...prev, { id: Date.now() + 1, text: data.message, isUser: false }]);

                // Voice Response Logic
                const msgToSpeak = data.tts_message || data.message;
                if (liveMode && msgToSpeak) {
                    speak(msgToSpeak, {
                        rate: 1.2,
                        onEnd: () => setTimeout(() => startListening(), 300)
                    });
                }
            }
            if (data.candidates) setCandidates(data.candidates);
            if (data.cart) setCart(data.cart);
            if (data.trace) setTrace(data.trace);
            if (data.latency_ms) setLatency(data.latency_ms);
            if (data.trace_url) setTraceUrl(data.trace_url);
            if (data.trace_id) setTraceId(data.trace_id);

            // Handle checkout response
            if (data.action_taken === 'checkout' && data.order) {
                setCheckoutOrder(data.order);
                setShowCheckoutAnim(true);
            }

        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { id: Date.now() + 1, text: "Sorry, I encountered an issue.", isUser: false }]);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, isLoading, liveMode, speak, startListening]);

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
        localStorage.removeItem('session_token');
        setUser(null);
    };

    const handleSearchAdd = useCallback((med) => {
        handleSend(`Add ${med.brand_name}`);
        setShowSearch(false);
    }, [handleSend]);

    const handleCheckoutFlow = useCallback(() => {
        setShowAddressModal(true);
    }, []);

    const handleAddressConfirm = useCallback((address) => {
        setShowAddressModal(false);
        // Send checkout with address info
        handleSend(`Checkout. Deliver to: ${address}`);
    }, [handleSend]);

    const handleCartUpdate = useCallback((updatedCart) => {
        setCart(updatedCart);
    }, []);

    // --- Render ---

    if (viewMode === 'admin') {
        return <AdminDashboard user={user} onSwitchToUser={() => setViewMode('user')} />;
    }

    const hasCartItems = cart?.items?.length > 0;

    return (
        <div className="relative min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-red-100">

            {/* 1. Header */}
            <header className={`sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 transition-all duration-300 ${liveMode ? 'opacity-0 -translate-y-full' : 'opacity-100'}`}>
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
                            <span className="text-white font-bold text-lg">M</span>
                        </div>
                        <span className="font-bold text-xl text-gray-900 tracking-tight">Mediloon</span>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search Button */}
                        <button
                            onClick={() => setShowSearch(true)}
                            className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200"
                            title="Search Medicines"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </button>

                        {/* Mobile Cart Toggle */}
                        <button
                            onClick={() => setShowMobileCart(!showMobileCart)}
                            className="lg:hidden relative p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            {cart.item_count > 0 && (
                                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border border-white">
                                    {cart.item_count}
                                </span>
                            )}
                        </button>
                        <div className="hidden md:flex bg-gray-100 rounded-full p-1">
                            <button onClick={() => setViewMode('user')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${viewMode === 'user' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-900'}`}>User</button>
                            <button onClick={() => setViewMode('admin')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${viewMode === 'admin' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-900'}`}>Admin</button>
                        </div>
                        {user ? (
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">{user.name}</span>
                                <button onClick={handleLogout} className="text-xs text-red-500 hover:underline">Logout</button>
                            </div>
                        ) : (
                            <button onClick={() => setShowLogin(true)} className="text-sm font-bold text-red-500 hover:text-red-700">Sign In</button>
                        )}
                    </div>
                </div>
            </header>

            {/* 2. Main Layout (Blurrable) */}
            <main className={`flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 transition-all duration-500 ${liveMode ? 'blur-md scale-95 opacity-50 pointer-events-none' : ''}`}>

                {/* Left Column: Chat & Interaction (8 cols) */}
                <div className="lg:col-span-8 flex flex-col gap-4 h-[calc(100vh-8rem)]">

                    {/* Chat Area */}
                    <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden relative">
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {messages.map((msg) => (
                                <ChatMessage key={msg.id} message={msg.text} isUser={msg.isUser} />
                            ))}
                            {isLoading && <ChatMessage isLoading />}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-gray-50">
                            {candidates.length > 0 && (
                                <div className="mb-4">
                                    <ResultsList
                                        candidates={candidates}
                                        onSelect={(med) => { setSelectedMedId(med.id); handleSend(`Add ${med.brand_name}`); }}
                                        selectedId={selectedMedId}
                                        onFlyToCart={handleFlyToCart}
                                    />
                                </div>
                            )}
                            <div className="flex items-end gap-3">
                                <div className="flex-shrink-0">
                                    <MicButton isListening={liveMode} onClick={toggleLiveMode} disabled={isLoading} />
                                </div>
                                <div className="flex-1">
                                    <TextInput onSend={handleSend} onUpload={handleFileUpload} disabled={isLoading} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cart Summary Strip (below chat) */}
                    {hasCartItems && (
                        <div
                            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex items-center justify-between animate-fade-in-up cursor-pointer hover:border-red-200 hover:shadow-md transition-all duration-200"
                            onClick={() => setShowCartDetail(true)}
                        >
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="p-2 bg-red-50 text-red-500 rounded-lg">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                        </svg>
                                    </div>
                                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                                        {cart.item_count}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">
                                        {cart.item_count} item{cart.item_count !== 1 ? 's' : ''} in cart
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {cart.items?.slice(0, 2).map((item, i) => (
                                            <span key={i} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                                                {item.brand_name}
                                            </span>
                                        ))}
                                        {cart.items?.length > 2 && (
                                            <span className="text-[10px] text-gray-400">+{cart.items.length - 2} more</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-bold text-gray-900">&#8377;{cart.total?.toFixed(2)}</span>
                                <span className="text-xs text-red-500 font-semibold">View Cart &rarr;</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Cart & Trace (4 cols) */}
                <div className={`
                    flex flex-col gap-6 h-[calc(100vh-8rem)] transition-all duration-300
                    ${showMobileCart ? 'fixed inset-0 z-50 bg-gray-50 p-4 pt-24' : 'hidden lg:flex lg:col-span-4'}
                `}>
                    {/* Mobile Close Button */}
                    <div className="lg:hidden flex justify-between items-center mb-2">
                        <h2 className="font-bold text-lg text-gray-800">Your Cart</h2>
                        <button onClick={() => setShowMobileCart(false)} className="p-2 bg-white rounded-full shadow-sm text-gray-500 hover:text-gray-800">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 min-h-0" ref={cartRef}>
                        <Cart
                            cart={cart}
                            sessionId={sessionId}
                            onRemove={(id) => handleSend("Remove item")}
                            onCheckout={handleCheckoutFlow}
                            onClear={() => setCart({ items: [], item_count: 0 })}
                            onCartUpdate={handleCartUpdate}
                        />
                    </div>
                    <div className="flex-shrink-0">
                        <TracePanel trace={trace} latency={latency} traceUrl={traceUrl} traceId={traceId} />
                    </div>
                </div>
            </main>

            {/* 3. Live Overlay (Voice Mode) */}
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
            />

            {/* 4. Modals */}
            {showLogin && <Login onLogin={(data) => { setUser(data.user); setShowLogin(false); }} onCancel={() => setShowLogin(false)} />}
            {user && <RefillNotification customerId={user.id} onReorder={(alert) => handleSend(`Reorder ${alert.brand_name}`)} />}

            {/* Search Modal */}
            <MedicineSearch
                isOpen={showSearch}
                onClose={() => setShowSearch(false)}
                onAddToCart={handleSearchAdd}
                sessionId={sessionId}
            />

            {/* Cart Detail Modal */}
            <CartDetailModal
                isOpen={showCartDetail}
                onClose={() => setShowCartDetail(false)}
                cart={cart}
                sessionId={sessionId}
                onCartUpdate={handleCartUpdate}
                onCheckout={() => { setShowCartDetail(false); handleCheckoutFlow(); }}
            />

            {/* Address Modal */}
            <AddressModal
                isOpen={showAddressModal}
                onClose={() => setShowAddressModal(false)}
                onConfirm={handleAddressConfirm}
                cart={cart}
            />

            {/* Checkout Animation */}
            <CheckoutAnimation
                isOpen={showCheckoutAnim}
                order={checkoutOrder}
                onClose={() => setShowCheckoutAnim(false)}
            />

            <FlyToCartLayer items={flyingItems} cartRef={cartRef} />
        </div>
    );
}
