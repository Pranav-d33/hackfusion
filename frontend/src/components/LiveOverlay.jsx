import React, { useEffect, useState } from 'react';

export default function LiveOverlay({
    isOpen,
    onClose,
    isListening,
    isSpeaking,
    transcript,
    lastResponse
}) {
    if (!isOpen) return null;

    const [scale, setScale] = useState(1);

    useEffect(() => {
        let animationFrame;
        let time = 0;

        const animate = () => {
            time += 0.05;
            if (isListening) {
                const pulse = 1 + Math.sin(time * 3) * 0.12;
                setScale(pulse);
            } else if (isSpeaking) {
                const pulse = 1 + Math.sin(time * 2) * 0.06;
                setScale(pulse);
            } else {
                const pulse = 1 + Math.sin(time) * 0.02;
                setScale(pulse);
            }
            animationFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animationFrame);
    }, [isListening, isSpeaking]);

    return (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-40 animate-fade-in-up">
            <div className="glass rounded-3xl shadow-2xl p-5 w-72 border border-gray-200/50">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Central Circle Visualizer */}
                <div className="flex justify-center mb-4">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                        <div
                            className={`w-14 h-14 rounded-full transition-all duration-200 flex items-center justify-center ${isListening ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-300/50' :
                                    isSpeaking ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-300/50' :
                                        'bg-gradient-to-br from-gray-300 to-gray-400'
                                }`}
                            style={{ transform: `scale(${scale})` }}
                        >
                            {isListening ? (
                                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                                </svg>
                            ) : isSpeaking ? (
                                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                </svg>
                            ) : (
                                <div className="flex gap-0.5">
                                    <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
                                    <div className="w-1 h-1 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                                    <div className="w-1 h-1 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                                </div>
                            )}
                        </div>

                        {/* Ripple effects */}
                        {isListening && (
                            <>
                                <div className="absolute inset-0 rounded-full border-2 border-red-400/40 animate-ping" style={{ animationDuration: '1.5s' }} />
                            </>
                        )}
                    </div>
                </div>

                {/* Status */}
                <p className={`text-center text-xs font-semibold mb-2 ${isListening ? 'text-red-600' : isSpeaking ? 'text-emerald-600' : 'text-gray-500'
                    }`}>
                    {isListening ? "🎤 Listening..." : isSpeaking ? "🔊 Speaking..." : "⏳ Processing..."}
                </p>

                {/* Transcript / Response */}
                <div className="min-h-[50px] text-center bg-gray-50 rounded-xl p-3">
                    {isListening && transcript ? (
                        <p className="text-sm text-gray-800 font-medium">
                            "{transcript}"
                        </p>
                    ) : lastResponse ? (
                        <p className="text-xs text-gray-500 line-clamp-2">
                            {lastResponse.substring(0, 80)}{lastResponse.length > 80 ? '...' : ''}
                        </p>
                    ) : (
                        <p className="text-xs text-gray-400">Say something...</p>
                    )}
                </div>

                {/* Hint */}
                <p className="text-center text-[10px] text-gray-400 mt-3">
                    Hands-free • Auto-responds
                </p>
            </div>
        </div>
    );
}
