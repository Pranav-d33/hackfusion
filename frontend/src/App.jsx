/**
 * Mediloon - Main Application
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import MicButton from './components/MicButton';
import TextInput from './components/TextInput';
import ChatMessage from './components/ChatMessage';
import ResultsList from './components/ResultsList';
import Cart from './components/Cart';
import TracePanel from './components/TracePanel';
import Login from './components/Login';
import RefillNotification from './components/RefillNotification';
import PredictionTimeline from './components/PredictionTimeline';
import AdminDashboard from './pages/AdminDashboard';
import { useSpeech } from './hooks/useSpeech';

const API_BASE = '/api';

import LiveOverlay from './components/LiveOverlay';

// ... other imports

export default function App() {
    // State
    const [messages, setMessages] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [cart, setCart] = useState({ items: [], item_count: 0 });
    const [trace, setTrace] = useState([]);
    const [latency, setLatency] = useState(null);
    const [traceId, setTraceId] = useState(null);
    const [traceUrl, setTraceUrl] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedMedId, setSelectedMedId] = useState(null);
    const [showAdmin, setShowAdmin] = useState(false);
    const [user, setUser] = useState(null);
    const [showLogin, setShowLogin] = useState(false);
    const [viewMode, setViewMode] = useState('user');
    const [showTimeline, setShowTimeline] = useState(false);
    const [liveMode, setLiveMode] = useState(false); // Live Mode State

    // Speech hook
    const {
        isListening,
        isSpeaking,
        transcript,
        isSupported,
        startListening, // Exposed from hook
        stopListening,
        toggleListening,
        speak,
        stopSpeaking,
        setTranscript,
    } = useSpeech();

    // Refs
    const messagesEndRef = useRef(null);


    // ... useEffects for scroll, auth ...

    // Handle voice transcript
    useEffect(() => {
        if (transcript && !isListening) {
            handleSend(transcript);
            setTranscript('');
        }
    }, [isListening, transcript]);

    // Live Mode Loop: If live mode is active and we are not listening/speaking/loading, check if we need to restart listening
    // Note: The loop is mainly driven by the 'speak' onEnd callback now, but safety check here?
    // Actually, relying on speak({ onEnd: startListening }) is cleaner.

    // Toggle Live Mode
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

    // Send message to API
    const handleSend = useCallback(async (text) => {
        if (!text.trim() || isLoading) return;

        // Add user message
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
                    source: liveMode ? 'voice' : 'text', // Trace source
                }),
            });

            if (!response.ok) {
                throw new Error('API request failed');
            }

            const data = await response.json();

            // Update session ID if returned
            if (data.session_id) {
                setSessionId(data.session_id);
            }

            // Update state from response
            if (data.message) {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    text: data.message,
                    isUser: false,
                }]);

                // Speak response
                const msgToSpeak = data.tts_message || data.message;
                if (msgToSpeak) {
                    speak(msgToSpeak, {
                        // CRITICAL: If Live Mode, restart listening after speaking
                        onEnd: () => {
                            if (liveMode) {
                                // Small delay for natural turn-taking
                                setTimeout(() => startListening(), 500);
                            }
                        }
                    });
                } else if (liveMode) {
                    // If no speech response but in live mode, restart listening (e.g. after silent action)
                    setTimeout(() => startListening(), 500);
                }
            }

            if (data.candidates) setCandidates(data.candidates);
            if (data.cart) setCart(data.cart);
            if (data.trace) setTrace(data.trace);
            if (data.latency_ms) setLatency(data.latency_ms);
            if (data.trace_id) setTraceId(data.trace_id);
            if (data.trace_url) setTraceUrl(data.trace_url);

        } catch (error) {
            console.error('Chat error:', error);
            const errText = "Sorry, something went wrong.";
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                text: errText,
                isUser: false,
            }]);
            if (liveMode) {
                speak(errText, { onEnd: () => setTimeout(() => startListening(), 500) });
            }
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, isLoading, speak, liveMode, startListening]);

    // Handle file upload
    const handleFileUpload = useCallback(async (file) => {
        if (!file || isLoading) return;

        const formData = new FormData();
        formData.append('file', file);

        // Optimistic update
        setMessages(prev => [...prev, {
            id: Date.now(),
            text: `📄 Uploading ${file.name}...`,
            isUser: true
        }]);
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE}/upload/prescription`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();

            // Send hidden prompt to agent with file path
            // The agent will then call the 'upload_prescription' tool
            handleSend(`Please analyze this prescription file: ${data.filepath}`); // This triggers the agent loop

        } catch (error) {
            console.error('Upload error:', error);
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                text: "❌ Failed to upload prescription.",
                isUser: false
            }]);
            setIsLoading(false);
        }
    }, [handleSend, isLoading]);

    // Handle medication selection
    const handleSelectMed = useCallback((med, index) => {
        setSelectedMedId(med.id);
        handleSend(`Add ${med.brand_name}`);
    }, [handleSend]);

    // Handle cart actions
    const handleRemoveFromCart = useCallback(async (cartItemId) => {
        try {
            handleSend("Remove that item");
        } catch (error) {
            console.error('Remove error:', error);
        }
    }, [handleSend]);

    const handleCheckout = useCallback(() => {
        handleSend("Checkout");
    }, [handleSend]);

    const handleClearCart = useCallback(async () => {
        try {
            await fetch(`${API_BASE}/cart/${sessionId}`, { method: 'DELETE' });
            setCart({ items: [], item_count: 0 });
        } catch (error) {
            console.error('Clear cart error:', error);
        }
    }, [sessionId]);

    // Auth handlers
    const handleLogin = (userData) => {
        setUser(userData.user);
        localStorage.setItem('session_token', userData.session_token);
        setShowLogin(false);
    };

    const handleLogout = async () => {
        const token = localStorage.getItem('session_token');
        if (token) {
            try {
                await fetch(`${API_BASE}/auth/logout?session_token=${token}`, { method: 'POST' });
            } catch (e) {
                console.error('Logout failed:', e);
            }
        }
        localStorage.removeItem('session_token');
        setUser(null);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Brand Logo */}
                        <div className="w-10 h-10 bg-mediloon-red rounded-xl flex items-center justify-center">
                            <span className="text-white font-bold text-lg">M</span>
                        </div>
                        <div>
                            <h1 className="font-bold text-xl text-gray-900">Mediloon</h1>
                            <p className="text-xs text-gray-500">Voice-powered medicine ordering</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Demo Mode Switcher for Judges */}
                        <div className="flex items-center gap-2 px-3 py-1 bg-purple-100 rounded-full">
                            <span className="text-xs font-medium text-purple-700">Demo:</span>
                            {/* ... Demo buttons ... */}
                            <button onClick={() => setViewMode('user')} className={`px-2 py-0.5 text-xs rounded-full ${viewMode === 'user' ? 'bg-purple-600 text-white' : 'text-purple-600'}`}>User</button>
                            <button onClick={() => setViewMode('admin')} className={`px-2 py-0.5 text-xs rounded-full ${viewMode === 'admin' ? 'bg-purple-600 text-white' : 'text-purple-600'}`}>Admin</button>
                        </div>

                        {/* ... User Auth / Latency ... */}
                        {user ? (
                            <button onClick={handleLogout} className="text-sm text-gray-500">Logout</button>
                        ) : (
                            <button onClick={() => setShowLogin(true)} className="text-sm font-medium text-mediloon-red">Sign In</button>
                        )}
                    </div>
                </div>
            </header>

            {/* Live Overlay */}
            <LiveOverlay
                isOpen={liveMode}
                onClose={toggleLiveMode}
                isListening={isListening}
                isSpeaking={isSpeaking}
                transcript={transcript}
                lastResponse={messages.filter(m => !m.isUser).slice(-1)[0]?.text}
            />

            {/* Admin Dashboard View */}
            {viewMode === 'admin' ? (
                // ... Admin content ...
                <AdminDashboard user={user} onSwitchToUser={() => setViewMode('user')} />
            ) : (
                <>
                    {/* Main content */}
                    {/* ... Existing chat UI ... */}
                    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
                        {/* ... existing layout ... */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 flex flex-col">
                                <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-4 mb-4 min-h-[400px] max-h-[500px] overflow-y-auto">
                                    <div className="space-y-4">
                                        {messages.map((msg) => (
                                            <ChatMessage key={msg.id} message={msg.text} isUser={msg.isUser} />
                                        ))}
                                        {isLoading && <ChatMessage isLoading />}
                                        <div ref={messagesEndRef} />
                                    </div>
                                </div>
                                {candidates.length > 0 && (
                                    <ResultsList candidates={candidates} onSelect={handleSelectMed} selectedId={selectedMedId} />
                                )}
                                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                                    <div className="flex items-center gap-4">
                                        <MicButton isListening={liveMode} onClick={toggleLiveMode} disabled={isLoading} />
                                        <div className="flex-1">
                                            <TextInput onSend={handleSend} onUpload={handleFileUpload} disabled={isLoading} placeholder={liveMode ? "🔴 Live Mode Active" : "Type or speak..."} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <Cart cart={cart} onRemove={handleRemoveFromCart} onCheckout={handleCheckout} onClear={handleClearCart} />
                                <TracePanel trace={trace} latency={latency} />
                            </div>
                        </div>
                    </main>

                    {/* ... Login / Footer ... */}
                    {showLogin && <Login onLogin={handleLogin} onCancel={() => setShowLogin(false)} />}
                    {user && <RefillNotification customerId={user.id} onReorder={(alert) => handleSend(`Reorder ${alert.brand_name}`)} />}
                </>
            )}
        </div>
    );
}

// Admin Panel Component with Refill Alerts
function AdminPanel({ onClose, onRefillMessage }) {
    const [activeTab, setActiveTab] = useState('medications');
    const [medications, setMedications] = useState([]);
    const [refillAlerts, setRefillAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchMedications();
        fetchRefillAlerts();
    }, []);

    const fetchMedications = async () => {
        try {
            const res = await fetch('/api/admin/medications');
            const data = await res.json();
            setMedications(data.medications || []);
        } catch (error) {
            console.error('Failed to fetch medications:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRefillAlerts = async () => {
        try {
            const res = await fetch('/api/refill/alerts?days_ahead=14');
            const data = await res.json();
            setRefillAlerts(data.alerts || []);
        } catch (error) {
            console.error('Failed to fetch refill alerts:', error);
        }
    };

    const handleUpdateStock = async (medId, newStock) => {
        try {
            await fetch(`/api/admin/inventory/${medId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stock_quantity: parseInt(newStock) }),
            });
            fetchMedications();
        } catch (error) {
            console.error('Failed to update stock:', error);
        }
    };

    const handleReindex = async () => {
        try {
            await fetch('/api/admin/reindex', { method: 'POST' });
            alert('Vector store reindexed!');
        } catch (error) {
            console.error('Failed to reindex:', error);
        }
    };

    const handleInitiateRefill = async (customerId, medicationId, alert) => {
        try {
            const res = await fetch(`/api/refill/initiate/${customerId}?medication_id=${medicationId}`, {
                method: 'POST',
            });
            const data = await res.json();

            // Trigger proactive agent message in main chat
            if (onRefillMessage && data.message) {
                onRefillMessage(data.message);
            } else {
                alert(`Refill initiated!\n\nMessage: ${data.message}`);
            }
        } catch (error) {
            console.error('Failed to initiate refill:', error);
        }
    };

    const getUrgencyColor = (urgency) => {
        switch (urgency) {
            case 'critical': return 'bg-red-100 text-red-800 border-red-300';
            case 'soon': return 'bg-orange-100 text-orange-800 border-orange-300';
            default: return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Admin Panel</h2>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleReindex}
                            className="text-sm text-mediloon-red hover:underline"
                        >
                            Reindex Vector Store
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-6 border-b border-gray-200 flex gap-4">
                    <button
                        onClick={() => setActiveTab('medications')}
                        className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'medications'
                            ? 'border-mediloon-red text-mediloon-red'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Medications
                    </button>
                    <button
                        onClick={() => setActiveTab('refills')}
                        className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'refills'
                            ? 'border-mediloon-red text-mediloon-red'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Refill Alerts
                        {refillAlerts.length > 0 && (
                            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                                {refillAlerts.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : activeTab === 'medications' ? (
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-sm font-medium text-gray-500 border-b">
                                    <th className="pb-3">Brand</th>
                                    <th className="pb-3">Generic</th>
                                    <th className="pb-3">Dosage</th>
                                    <th className="pb-3">RX</th>
                                    <th className="pb-3">Stock</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {medications.map((med) => (
                                    <tr key={med.id} className="text-sm">
                                        <td className="py-3 font-medium">{med.brand_name}</td>
                                        <td className="py-3 text-gray-600">{med.generic_name}</td>
                                        <td className="py-3 text-gray-600">{med.dosage}</td>
                                        <td className="py-3">
                                            {med.rx_required ? (
                                                <span className="rx-badge rx-required">RX</span>
                                            ) : (
                                                <span className="rx-badge rx-otc">OTC</span>
                                            )}
                                        </td>
                                        <td className="py-3">
                                            <input
                                                type="number"
                                                defaultValue={med.stock_quantity || 0}
                                                className="w-20 px-2 py-1 border rounded text-center"
                                                onBlur={(e) => handleUpdateStock(med.id, e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="space-y-4">
                            {refillAlerts.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No refill alerts. All customers are well-stocked!
                                </div>
                            ) : (
                                refillAlerts.map((alert, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-lg border ${getUrgencyColor(alert.urgency)}`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold">{alert.customer_name}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alert.urgency === 'critical' ? 'bg-red-500 text-white' :
                                                        alert.urgency === 'soon' ? 'bg-orange-500 text-white' :
                                                            'bg-yellow-500 text-white'
                                                        }`}>
                                                        {alert.urgency === 'critical' ? '🚨 Critical' :
                                                            alert.urgency === 'soon' ? '⚠️ Soon' : '📅 Upcoming'}
                                                    </span>
                                                </div>
                                                <p className="text-sm">
                                                    <strong>{alert.brand_name}</strong> ({alert.generic_name} {alert.dosage})
                                                </p>
                                                <p className="text-sm mt-1">
                                                    {alert.days_until_depletion <= 0
                                                        ? 'Medicine has run out!'
                                                        : `Runs out in ${alert.days_until_depletion} day${alert.days_until_depletion !== 1 ? 's' : ''}`}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Last order: {alert.last_quantity} units @ {alert.daily_dose}/day
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleInitiateRefill(alert.customer_id, alert.medication_id)}
                                                className="px-4 py-2 bg-mediloon-red text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                                            >
                                                Initiate Refill
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
