/**
 * TextInput - Text input with send button and file upload
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
                className={`px-3 py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors ${isUploading ? 'animate-pulse' : ''
                    }`}
            >
                {isUploading ? (
                    <svg className="w-5 h-5 animate-spin p-0.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                )}
            </button>

            <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || "Type a message or speak..."}
                disabled={disabled}
                className={`
                    flex-1 px-4 py-3 rounded-xl border-2 border-gray-200
                    focus:border-mediloon-red focus:outline-none focus:ring-2 focus:ring-red-100
                    transition-all duration-200
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-white'}
                `}
            />
            <button
                type="submit"
                disabled={disabled || !text.trim()}
                className={`
                    px-5 py-3 rounded-xl font-medium transition-all duration-200
                    ${text.trim() && !disabled
                        ? 'bg-mediloon-red text-white hover:bg-mediloon-red-dark shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
