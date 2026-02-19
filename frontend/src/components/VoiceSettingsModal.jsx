import React, { useState, useEffect } from 'react';

export default function VoiceSettingsModal({ isOpen, onClose, voices, currentVoice, onVoiceChange }) {
    if (!isOpen) return null;

    const [previewText, setPreviewText] = useState("Hello, I am your Mediloon AI assistant.");
    const [isPlaying, setIsPlaying] = useState(false);

    const handlePreview = (voice) => {
        if (!voice) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(previewText);
        utterance.voice = voice;
        utterance.rate = 0.9;
        utterance.pitch = 1.1;

        utterance.onstart = () => setIsPlaying(true);
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);

        window.speechSynthesis.speak(utterance);
    };

    // Group voices by language for better UX
    const groupedVoices = voices.reduce((acc, voice) => {
        const lang = voice.lang.split('-')[0].toUpperCase(); // EN, HI, etc.
        if (!acc[lang]) acc[lang] = [];
        acc[lang].push(voice);
        return acc;
    }, {});

    // Prioritize EN, HI, then others
    const sortedKeys = Object.keys(groupedVoices).sort((a, b) => {
        if (a === 'EN') return -1;
        if (b === 'EN') return 1;
        if (a === 'HI') return -1;
        if (b === 'HI') return 1;
        return a.localeCompare(b);
    });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h2 className="text-lg font-brand font-bold text-gray-800">Voice Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200/50 rounded-full transition-colors text-gray-500"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Preview Text</label>
                        <input
                            type="text"
                            value={previewText}
                            onChange={(e) => setPreviewText(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-semibold text-gray-700">Select Voice</label>

                        {voices.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                No voices found. Please check your browser settings.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {sortedKeys.map(lang => (
                                    <div key={lang}>
                                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 ml-1">{lang} choices</h3>
                                        <div className="space-y-2">
                                            {groupedVoices[lang].map((voice, idx) => {
                                                const isSelected = currentVoice?.name === voice.name;
                                                return (
                                                    <div
                                                        key={`${voice.name}-${idx}`}
                                                        onClick={() => {
                                                            onVoiceChange(voice);
                                                            handlePreview(voice);
                                                        }}
                                                        className={`
                                                            group flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all
                                                            ${isSelected
                                                                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                                                                : 'border-gray-100 hover:border-blue-300 hover:bg-gray-50'
                                                            }
                                                        `}
                                                    >
                                                        <div className="flex-1 min-w-0 pr-3">
                                                            <div className={`font-medium text-sm truncate ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                                                                {voice.name}
                                                            </div>
                                                            <div className="text-xs text-gray-400 truncate">
                                                                {voice.lang} {voice.localService ? '(Local)' : '(Online)'}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {isSelected && (
                                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                            )}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handlePreview(voice);
                                                                }}
                                                                className={`p-2 rounded-full hover:bg-white hover:shadow-sm transition-all ${isPlaying && isSelected ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`}
                                                                title="Preview"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-gray-800 text-white text-sm font-semibold rounded-xl hover:bg-gray-900 transition-colors shadow-lg shadow-gray-200"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
