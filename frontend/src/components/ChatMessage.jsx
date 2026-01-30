/**
 * ChatMessage - Individual chat message bubble
 */
import React from 'react';

export default function ChatMessage({ message, isUser, isLoading }) {
    if (isLoading) {
        return (
            <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]">
                    <div className="flex gap-1">
                        <span className="loading-dot w-2 h-2 bg-gray-400 rounded-full"></span>
                        <span className="loading-dot w-2 h-2 bg-gray-400 rounded-full"></span>
                        <span className="loading-dot w-2 h-2 bg-gray-400 rounded-full"></span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} message-enter`}>
            <div
                className={`
          rounded-2xl px-4 py-3 max-w-[80%]
          ${isUser
                        ? 'bg-mediloon-red text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                    }
        `}
            >
                <p className="whitespace-pre-wrap">{message}</p>
            </div>
        </div>
    );
}
