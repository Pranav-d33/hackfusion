/**
 * ChatMessage — Individual chat message bubble
 * Red gradient for user, white with avatar for bot
 */
import React from 'react';

export default function ChatMessage({ message, isUser, isLoading, latency }) {
    if (isLoading) {
        return (
            <div className="flex justify-start message-enter">
                <div className="flex items-start gap-2.5">
                    {/* Bot avatar */}
                    <div className="w-7 h-7 rounded-xl bg-mediloon-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-mediloon-500 font-brand font-bold text-xs">M</span>
                    </div>
                    <div className="bg-surface-cloud rounded-2xl rounded-tl-md px-4 py-3 max-w-[80%]">
                        <div className="flex gap-1.5">
                            <span className="loading-dot"></span>
                            <span className="loading-dot"></span>
                            <span className="loading-dot"></span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} message-enter`}>
            {isUser ? (
                /* User message — Red gradient bubble */
                <div className="bg-gradient-to-br from-mediloon-500 to-mediloon-700 text-white rounded-2xl rounded-br-md px-4 py-3 max-w-[80%] shadow-md shadow-mediloon-100">
                    <p className="whitespace-pre-wrap text-[14.5px] font-body leading-relaxed">{message}</p>
                </div>
            ) : (
                /* Bot message — White bubble with avatar */
                <div className="flex items-start gap-2.5 max-w-[85%]">
                    <div className="w-7 h-7 rounded-xl bg-mediloon-50 flex items-center justify-center flex-shrink-0 mt-0.5 border border-mediloon-100">
                        <span className="text-mediloon-500 font-brand font-bold text-xs">M</span>
                    </div>
                    <div className="bg-white border border-surface-fog rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                        <p className="whitespace-pre-wrap text-[14.5px] font-body text-ink-primary leading-relaxed">{message}</p>
                        {latency != null && (
                            <span className="text-[10px] text-ink-faint mt-1.5 block text-right font-mono">
                                {latency}ms
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
