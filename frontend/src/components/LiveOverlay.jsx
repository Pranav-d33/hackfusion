import React, { useEffect, useRef, useState, useMemo } from 'react';

export default function LiveOverlay({
    isOpen,
    onClose,
    isListening,
    isSpeaking,
    transcript,
    messages,
    onUpload,
    audioLevel = 0,
    cart
}) {
    const scrollRef = useRef(null);
    const [showUploadPrompt, setShowUploadPrompt] = useState(false);
    const fileInputRef = useRef(null);
    const [cartNotif, setCartNotif] = useState(null);
    const prevCartCount = useRef(cart?.item_count || 0);

    // Auto-scroll chat in overlay
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, transcript]);

    // Detect if the agent asked for a prescription
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (isOpen && !lastMsg?.isUser &&
            (lastMsg?.text.toLowerCase().includes('upload') || lastMsg?.text.toLowerCase().includes('prescription'))) {
            setShowUploadPrompt(true);
        } else {
            setShowUploadPrompt(false);
        }
    }, [messages, isOpen]);

    // Cart add animation
    useEffect(() => {
        const currentCount = cart?.item_count || 0;
        if (isOpen && currentCount > prevCartCount.current) {
            const added = currentCount - prevCartCount.current;
            setCartNotif(`+${added}`);
            const timer = setTimeout(() => setCartNotif(null), 2000);
            prevCartCount.current = currentCount;
            return () => clearTimeout(timer);
        }
        prevCartCount.current = currentCount;
    }, [cart?.item_count, isOpen]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) onUpload(file);
    };

    // Voice-reactive shape calculations
    const sphereStyles = useMemo(() => {
        const scale = 1 + (audioLevel * 0.5);
        const bl1 = 60 - (audioLevel * 30);
        const bl2 = 40 + (audioLevel * 30);
        const bl3 = 30 + (audioLevel * 40);
        const bl4 = 70 - (audioLevel * 30);
        const borderRadius = `${bl1}% ${bl2}% ${bl3}% ${bl4}% / ${bl2}% ${bl3}% ${bl4}% ${bl1}%`;
        const glowSize = 20 + (audioLevel * 40);
        const glowOpacity = 0.4 + (audioLevel * 0.4);
        const animationDuration = Math.max(1.5, 6 - (audioLevel * 4));

        return { scale, borderRadius, glowSize, glowOpacity, animationDuration };
    }, [audioLevel]);

    if (!isOpen) return null;

    const cartCount = cart?.item_count || 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Blurred Backdrop */}
            <div
                className="absolute inset-0 bg-white/60 backdrop-blur-md transition-opacity duration-500"
                onClick={onClose}
            ></div>

            {/* Cart Badge - Bottom Right */}
            {cartCount > 0 && (
                <div className="absolute bottom-8 right-8 z-20 pointer-events-none">
                    <div className="relative flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2.5 rounded-2xl shadow-xl border border-gray-200 animate-fade-in-up">
                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
                        {cart?.total > 0 && (
                            <span className="text-xs text-gray-500 font-medium">&#8377;{cart.total.toFixed(0)}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Add-to-cart notification */}
            {cartNotif && (
                <div className="absolute bottom-24 right-8 z-30 pointer-events-none">
                    <div className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-xl shadow-lg voice-cart-notif">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-bold text-sm">{cartNotif} Added</span>
                    </div>
                </div>
            )}

            {/* Main Voice Interface */}
            <div className="relative w-full max-w-2xl h-[85vh] flex flex-col justify-end items-center pointer-events-none voice-mode-enter">

                {/* Floating Chat History */}
                <div className="w-full flex-1 overflow-y-auto px-6 mb-10 pointer-events-auto mask-gradient" ref={scrollRef}>
                    <div className="space-y-6 pb-4">
                        {messages.slice(-5).map((msg) => (
                            <div key={msg.id} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                                <div className={`
                                    max-w-[80%] rounded-2xl px-6 py-4 text-lg shadow-sm backdrop-blur-sm
                                    ${msg.isUser
                                        ? 'bg-red-500/90 text-white rounded-br-none'
                                        : 'bg-white/90 text-gray-800 border border-gray-200 rounded-bl-none'
                                    }
                                `}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isListening && transcript && (
                            <div className="flex justify-end">
                                <div className="max-w-[80%] rounded-2xl px-6 py-4 text-lg text-gray-500 bg-gray-100/50 italic border border-dashed border-gray-300">
                                    {transcript}...
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upload Prompt */}
                {showUploadPrompt && (
                    <div className="mb-8 pointer-events-auto animate-fade-in-up">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                            accept="image/*,.pdf"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-6 py-3 bg-white text-red-500 font-semibold rounded-full shadow-xl border border-red-100 hover:bg-red-50 transition-all transform hover:scale-105"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Tap to Upload Prescription
                        </button>
                    </div>
                )}

                {/* VOICE-REACTIVE SIRI SPHERE */}
                <div className="pointer-events-auto mb-16 relative">
                    {/* Exit Button */}
                    <button
                        onClick={onClose}
                        className="absolute -right-20 top-1/2 -translate-y-1/2 p-3 rounded-full bg-gray-100 text-gray-500 hover:bg-white hover:text-red-500 hover:shadow-lg transition-all"
                        title="Exit Voice Mode"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* The Voice-Reactive Sphere Container */}
                    <div
                        className="relative w-36 h-36 flex items-center justify-center"
                        style={{
                            transform: `scale(${sphereStyles.scale})`,
                            transition: 'transform 0.08s ease-out'
                        }}
                    >
                        {/* Outer Glow Ring */}
                        <div
                            className="absolute inset-0 rounded-full bg-gradient-to-br from-red-400/30 to-rose-500/30 blur-xl"
                            style={{
                                transform: `scale(${1.2 + audioLevel * 0.3})`,
                                opacity: sphereStyles.glowOpacity,
                                transition: 'all 0.1s ease-out'
                            }}
                        ></div>

                        {/* Main Morphing Sphere */}
                        <div
                            className="absolute inset-2 bg-gradient-to-br from-red-500 via-rose-500 to-orange-400"
                            style={{
                                borderRadius: sphereStyles.borderRadius,
                                filter: `blur(8px) drop-shadow(0 0 ${sphereStyles.glowSize}px rgba(220, 38, 38, ${sphereStyles.glowOpacity}))`,
                                animation: `liquid-morph ${sphereStyles.animationDuration}s ease-in-out infinite`,
                                transition: 'border-radius 0.1s ease-out, filter 0.1s ease-out'
                            }}
                        ></div>

                        {/* Inner Bright Core */}
                        <div
                            className="absolute inset-6 bg-gradient-to-tr from-rose-400 via-orange-300 to-yellow-300"
                            style={{
                                borderRadius: sphereStyles.borderRadius,
                                opacity: 0.7 + (audioLevel * 0.3),
                                filter: 'blur(4px)',
                                animation: `liquid-morph ${sphereStyles.animationDuration}s ease-in-out infinite reverse`,
                                transition: 'all 0.1s ease-out'
                            }}
                        ></div>

                        {/* Center Highlight */}
                        <div
                            className="absolute w-8 h-8 bg-white/80 rounded-full blur-md"
                            style={{
                                transform: `scale(${0.8 + audioLevel * 0.4})`,
                                opacity: 0.6 + (audioLevel * 0.4),
                                transition: 'all 0.1s ease-out'
                            }}
                        ></div>

                        {/* Status Icon Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center z-10 text-white drop-shadow-lg">
                            {isListening ? (
                                <svg
                                    className="w-10 h-10"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    style={{
                                        transform: `scale(${1 + audioLevel * 0.3})`,
                                        transition: 'transform 0.1s ease-out'
                                    }}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                            ) : isSpeaking ? (
                                <svg className="w-10 h-10 animate-bounce-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                </svg>
                            ) : (
                                <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
                            )}
                        </div>
                    </div>

                    {/* Audio Level Bar */}
                    {isListening && (
                        <div className="mt-6 w-32 h-2 bg-gray-200/50 rounded-full overflow-hidden mx-auto">
                            <div
                                className="h-full bg-gradient-to-r from-red-400 via-rose-500 to-orange-400 rounded-full"
                                style={{
                                    width: `${Math.max(5, audioLevel * 100)}%`,
                                    transition: 'width 0.05s ease-out'
                                }}
                            ></div>
                        </div>
                    )}

                    <p className="text-center mt-4 font-medium text-gray-500">
                        {isListening ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                Listening...
                            </span>
                        ) : isSpeaking ? "Speaking..." : "Processing..."}
                    </p>
                </div>
            </div>

            <style>{`
                .mask-gradient {
                    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 100%);
                }
                @keyframes liquid-morph {
                    0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
                    25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
                    50% { border-radius: 50% 50% 40% 60% / 40% 50% 60% 50%; }
                    75% { border-radius: 40% 60% 50% 50% / 60% 40% 50% 60%; }
                }
                .voice-cart-notif {
                    animation: voice-notif-anim 2s ease-out forwards;
                }
                @keyframes voice-notif-anim {
                    0% { opacity: 0; transform: translateY(20px) scale(0.8); }
                    15% { opacity: 1; transform: translateY(0) scale(1); }
                    75% { opacity: 1; transform: translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateY(-20px) scale(0.8); }
                }
            `}</style>
        </div>
    );
}
