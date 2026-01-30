/**
 * MicButton - Voice input button with enhanced animations
 */
import React from 'react';

export default function MicButton({ isListening, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                relative w-14 h-14 rounded-2xl flex items-center justify-center
                transition-all duration-300 focus:outline-none
                ${isListening
                    ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-300/50 scale-105'
                    : 'bg-gradient-to-br from-gray-100 to-gray-50 text-mediloon-red border border-gray-200 hover:border-red-200 hover:shadow-md hover:shadow-red-100/50'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
            `}
            aria-label={isListening ? 'Stop listening' : 'Start voice input'}
        >
            {/* Microphone icon */}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-6 h-6 transition-transform ${isListening ? 'scale-110' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
            </svg>

            {/* Listening indicator */}
            {isListening && (
                <>
                    <span className="absolute inset-0 rounded-2xl animate-ping bg-red-400 opacity-20" style={{ animationDuration: '1.5s' }}></span>
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white live-indicator"></span>
                </>
            )}
        </button>
    );
}
