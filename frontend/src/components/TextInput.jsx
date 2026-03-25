/**
 * TextInput — Sleek input bar with send and upload buttons
 */
import React, { useState, useRef } from 'react';

export default function TextInput({ onSend, onUpload, disabled, placeholder }) {
    const [text, setText] = useState('');
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim() && !disabled) {
            onSend(text.trim());
            setText('');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            handleSubmit(e);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploading(true);
        try {
            await onUpload(file);
        } catch (err) {
            console.error(err);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 w-full">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
            />

            {/* Upload Button */}
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isUploading}
                className={`p-2.5 md:p-3 flex items-center justify-center rounded-[1.1rem] md:rounded-2xl shadow-soft-sm hover:shadow-soft text-ink-faint 
                    hover:border-mediloon-200 hover:text-mediloon-500 hover:bg-mediloon-50/50 
                    transition-all duration-200 active:scale-95
                    ${isUploading ? 'animate-pulse' : ''}`}
            >
                {isUploading ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                )}
            </button>

            {/* Text Input */}
            <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || "Type a message..."}
                disabled={disabled}
                className={`
                    flex-1 px-3 md:px-4 py-2.5 md:py-3 rounded-[1.1rem] md:rounded-2xl border-2 border-surface-fog
                    font-body text-ink-primary placeholder:text-ink-ghost text-[14px] md:text-base
                    focus:border-mediloon-400 focus:outline-none focus:ring-2 focus:ring-mediloon-100
                    transition-all duration-200
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-cloud' : 'bg-white'}
                `}
            />

            {/* Send Button */}
            <button
                type="submit"
                disabled={disabled || !text.trim()}
                className={`
                    px-4 md:px-5 py-2.5 md:py-3 rounded-[1.1rem] md:rounded-2xl font-brand font-semibold transition-all duration-200 flex items-center justify-center
                    ${text.trim() && !disabled
                        ? 'bg-gradient-to-r from-mediloon-500 to-mediloon-600 text-white shadow-md shadow-mediloon-200 hover:shadow-lg hover:shadow-mediloon-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-95'
                        : 'bg-surface-cloud text-ink-ghost cursor-not-allowed'
                    }
                `}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
            </button>
        </form>
    );
}
