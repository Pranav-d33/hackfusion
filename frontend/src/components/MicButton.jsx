/**
 * MicButton — Premium voice activation button with glow animations
 */
import React from 'react';

export default function MicButton({ isListening, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                group relative flex items-center justify-center w-12 h-12 rounded-2xl
                transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-mediloon-300 focus:ring-offset-2
                ${isListening
                    ? 'bg-gradient-to-br from-mediloon-500 to-mediloon-700 text-white shadow-glow-red scale-[1.02]'
                    : 'bg-white text-mediloon-500 border-2 border-surface-fog hover:border-mediloon-300 hover:shadow-glow-red-sm hover:bg-mediloon-50/50'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.95]'}
            `}
            aria-label={isListening ? 'Exit Voice Mode' : 'Enter Voice Mode'}
            title={isListening ? 'Voice Mode Active — click to exit' : 'Enter Voice Mode'}
        >
            {/* Pulse rings when listening */}
            {isListening && (
                <>
                    <span className="absolute inset-0 rounded-2xl animate-ping bg-mediloon-400/20" style={{ animationDuration: '1.8s' }} />
                    <span className="absolute -inset-1 rounded-2xl animate-ping bg-mediloon-400/10" style={{ animationDuration: '2.2s', animationDelay: '0.3s' }} />
                </>
            )}

            {/* Mic Icon */}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-5 h-5 relative z-10 transition-all duration-300 ${isListening ? 'text-white scale-110' : 'group-hover:text-mediloon-600 group-hover:scale-110'}`}
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

            {/* Live indicator */}
            {isListening && (
                <div className="absolute -top-1 -right-1 flex items-center justify-center z-20">
                    <span className="w-3 h-3 bg-white rounded-full shadow-lg border-2 border-mediloon-500 animate-pulse" />
                </div>
            )}
        </button>
    );
}
