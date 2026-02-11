import React, { useRef } from 'react';

export default function VoiceModeOverlay({
    isOpen,
    onClose,
    isListening,
    isSpeaking,
    transcript,
    lastResponse,
    onUploadFile
}) {
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleFileClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            onUploadFile(e.target.files[0]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center glass-overlay transition-opacity duration-300">
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-6 right-6 p-4 rounded-full bg-white/80 shadow-lg hover:bg-gray-100 btn-bounce text-gray-600"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Main Visualizer */}
            <div className={`siri-container ${isListening || isSpeaking ? 'active' : ''} mb-12`}>
                <div className="orbit"></div>
                <div className="orbit"></div>
                <div className="orbit"></div>
                <div className={`siri-sphere ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}></div>
            </div>

            {/* Dynamic Status Text */}
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                {isListening ? "I'm listening..." : isSpeaking ? "Mediloon Agent" : "Thinking..."}
            </h2>

            {/* Transcript / Response Area */}
            <div className="w-full max-w-2xl px-6 text-center space-y-4">
                {transcript ? (
                    <p className="text-xl text-gray-600 font-medium animate-pulse">
                        "{transcript}"
                    </p>
                ) : (
                    <p className="text-lg text-gray-500 font-light leading-relaxed">
                        {lastResponse || "Go ahead, ask me to add medicines or analyze a prescription."}
                    </p>
                )}
            </div>

            {/* Contextual Actions (e.g. Upload Prescription while in voice mode) */}
            <div className="mt-12 flex gap-4">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                />
                <button
                    onClick={handleFileClick}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-full shadow-md text-gray-700 hover:bg-gray-50 btn-bounce"
                >
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Upload Prescription</span>
                </button>
            </div>

            <div className="absolute bottom-8 text-sm text-gray-400 font-medium">
                Powered by Mediloon Voice AI
            </div>
        </div>
    );
}
