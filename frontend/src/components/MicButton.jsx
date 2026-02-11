/**
 * MicButton - Premium Voice Mode activation button with Siri-like design
 */
import React from 'react';

export default function MicButton({ isListening, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                group relative flex items-center gap-3 px-5 py-3.5 rounded-2xl
                transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:ring-offset-2
                ${isListening
                    ? 'bg-gradient-to-r from-red-500 via-rose-500 to-red-600 text-white shadow-xl shadow-red-400/40 scale-[1.02]'
                    : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-red-300 hover:shadow-lg hover:shadow-red-100/50 hover:bg-red-50/30'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}
            `}
            aria-label={isListening ? 'Exit Voice Mode' : 'Enter Voice Mode'}
        >
            {/* Animated Sphere Icon */}
            <div className={`
                relative w-10 h-10 rounded-full flex items-center justify-center
                transition-all duration-300
                ${isListening
                    ? 'bg-white/20'
                    : 'bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-300/50'
                }
            `}>
                {/* Pulsing ring when listening */}
                {isListening && (
                    <>
                        <span className="absolute inset-0 rounded-full animate-ping bg-white/30" style={{ animationDuration: '1.5s' }}></span>
                        <span className="absolute inset-0 rounded-full animate-pulse bg-white/10"></span>
                    </>
                )}

                {/* Microphone Icon */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-5 h-5 relative z-10 transition-all duration-300 ${isListening ? 'text-white' : 'text-white'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
            </div>

            {/* Label Text */}
            <div className="flex flex-col items-start">
                <span className={`
                    font-semibold text-sm tracking-tight
                    ${isListening ? 'text-white' : 'text-gray-800 group-hover:text-red-600'}
                    transition-colors duration-200
                `}>
                    {isListening ? 'Voice Mode Active' : 'Enter Voice Mode'}
                </span>
                <span className={`
                    text-[11px] font-medium
                    ${isListening ? 'text-white/70' : 'text-gray-400 group-hover:text-red-400/70'}
                    transition-colors duration-200
                `}>
                    {isListening ? 'Click to exit' : 'Talk to Mediloon AI'}
                </span>
            </div>

            {/* Live indicator dot */}
            {isListening && (
                <div className="absolute -top-1 -right-1 flex items-center justify-center">
                    <span className="w-3 h-3 bg-white rounded-full animate-pulse shadow-lg"></span>
                    <span className="absolute w-3 h-3 bg-white rounded-full animate-ping opacity-50"></span>
                </div>
            )}

            {/* Hover glow effect (when not listening) */}
            {!isListening && !disabled && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-red-400/0 via-rose-400/0 to-red-400/0 group-hover:from-red-400/5 group-hover:via-rose-400/10 group-hover:to-red-400/5 transition-all duration-300 pointer-events-none"></div>
            )}
        </button>
    );
}
