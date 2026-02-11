import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';

export default function TracePanel({ trace, latency, traceId, traceUrl }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isZoomed, setIsZoomed] = useState(false);
    const scrollRef = useRef(null);

    // Auto-scroll to bottom when trace updates
    useEffect(() => {
        if (isExpanded && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [trace, isExpanded]);

    return (
        <>
            {/* Zoomed Modal View */}
            {isZoomed && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8">
                    <div className="w-full max-w-4xl h-[80vh] bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 bg-gray-950 border-b border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="font-semibold text-gray-200 tracking-wide">Agent Thought Process (Expanded)</span>
                            </div>
                            <button
                                onClick={() => setIsZoomed(false)}
                                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {renderTraceContent(trace, traceUrl)}
                        </div>
                    </div>
                </div>
            )}

            {/* Normal Panel */}
            <div className={`
                flex flex-col bg-gray-900 border border-gray-800 shadow-2xl rounded-2xl overflow-hidden transition-all duration-500 ease-in-out
                ${isExpanded ? 'h-[500px]' : 'h-14'}
            `}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-950 border-b border-gray-800">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                        <div className="relative">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-500 blur-sm opacity-50"></div>
                        </div>
                        <span className="font-semibold text-gray-200 tracking-wide text-sm">Agent Thought Process</span>
                        <svg
                            className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    <div className="flex items-center gap-3">
                        {latency && (
                            <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                                {latency}ms
                            </span>
                        )}
                        {isExpanded && (
                            <button
                                onClick={() => setIsZoomed(true)}
                                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
                                title="Expand trace view"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Trace Content */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900/50 scroll-smooth"
                >
                    {renderTraceContent(trace, traceUrl)}
                </div>
            </div>
        </>
    );
}

function renderTraceContent(trace, traceUrl) {
    if (!trace || trace.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-3 py-12">
                <div className="w-12 h-12 border-2 border-gray-700 border-t-red-500 rounded-full animate-spin"></div>
                <p className="text-sm font-medium">Waiting for activity...</p>
            </div>
        );
    }

    return (
        <>
            {trace.map((entry, index) => (
                <div
                    key={index}
                    className="group relative pl-4 border-l-2 border-gray-800 hover:border-gray-600 transition-colors new-log-entry"
                >
                    {/* Timestamp Dot */}
                    <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-gray-700 group-hover:bg-red-500 transition-colors ring-4 ring-gray-900"></div>

                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className={`
                            text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded
                            ${entry.step === 'error' ? 'bg-red-500/20 text-red-400' :
                                entry.step === 'tool_call' ? 'bg-blue-500/20 text-blue-400' :
                                    entry.step === 'thought' ? 'bg-purple-500/20 text-purple-400' :
                                        entry.step === 'final_answer' ? 'bg-green-500/20 text-green-400' :
                                            'bg-gray-500/20 text-gray-400'}
                        `}>
                            {entry.step}
                        </span>
                        <span className="text-xs text-gray-600 font-mono">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                        </span>
                    </div>

                    {/* Payload */}
                    <div className="text-sm text-gray-300 font-mono bg-black/30 rounded-lg p-3 overflow-x-auto border border-white/5">
                        {entry.data && entry.data.source && (
                            <div className="flex items-center gap-2 text-xs mb-2 border-b border-gray-800 pb-2">
                                <span className="text-yellow-500">{entry.data.source}</span>
                                <span className="text-gray-600"><ArrowRight size={12} /></span>
                                <span className="text-purple-400">{entry.data.target}</span>
                            </div>
                        )}

                        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                            {typeof entry.data === 'object'
                                ? JSON.stringify(entry.data.result || entry.data, null, 2)
                                : entry.data
                            }
                        </pre>
                    </div>
                </div>
            ))}

            {traceUrl && (
                <a
                    href={traceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center text-xs text-gray-500 hover:text-white mt-4 pb-2 transition-colors"
                >
                    View full trace in Langfuse <ExternalLink size={12} className="inline ml-1" />
                </a>
            )}
        </>
    );
}
