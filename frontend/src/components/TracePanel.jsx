import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';

export default function TracePanel({ trace, latency, traceId, traceUrl }) {
    const [isZoomed, setIsZoomed] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [trace]);

    const zoomedScrollRef = useRef(null);

    useEffect(() => {
        if (isZoomed && zoomedScrollRef.current) {
            zoomedScrollRef.current.scrollTop = zoomedScrollRef.current.scrollHeight;
        }
    }, [trace, isZoomed]);

    return (
        <>
            {/* Zoomed Modal View */}
            {isZoomed && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in">
                    <div className="w-full max-w-4xl h-[80vh] bg-[#0D0D1A] rounded-2xl shadow-2xl border border-gray-800/50 flex flex-col overflow-hidden animate-scale-in">
                        <div className="flex items-center justify-between px-5 py-3 bg-[#08081A] border-b border-gray-800/50">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-mediloon-500 animate-pulse" />
                                <span className="font-brand font-semibold text-gray-200 tracking-wide">Agent Thought Process</span>
                            </div>
                            <button
                                onClick={() => setIsZoomed(false)}
                                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-all duration-200 active:scale-95"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div ref={zoomedScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth">
                            {renderTraceContent(trace, traceUrl)}
                        </div>
                    </div>
                </div>
            )}

            {/* Normal Panel */}
            <div className="flex flex-col bg-[#0D0D1A] border border-gray-800/40 shadow-2xl rounded-2xl overflow-hidden h-[220px]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#08081A] border-b border-gray-800/40 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <div className="w-2 h-2 rounded-full bg-mediloon-500 animate-pulse" />
                            <div className="absolute inset-0 w-2 h-2 rounded-full bg-mediloon-500 blur-sm opacity-50" />
                        </div>
                        <span className="font-brand font-semibold text-gray-200 tracking-wide text-xs">Agent Trace</span>
                        {latency && (
                            <span className="text-[10px] font-mono text-accent-emerald bg-accent-emerald/10 px-1.5 py-0.5 rounded-md border border-accent-emerald/20">
                                {latency}ms
                            </span>
                        )}
                    </div>

                    <button
                        onClick={() => setIsZoomed(true)}
                        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-all duration-200 active:scale-95"
                        title="Expand trace view"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                    </button>
                </div>

                {/* Trace Content */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#0D0D1A]/50 scroll-smooth"
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
            <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-40 hover:opacity-100 transition-opacity duration-500 group cursor-default">
                <div className="relative w-16 h-16 flex items-center justify-center">
                    {/* Outer rings */}
                    <div className="absolute inset-0 rounded-full border border-mediloon-500/20 scale-100 group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 rounded-full border border-mediloon-500/10 scale-75 group-hover:scale-90 transition-transform duration-700 delay-75" />

                    {/* Inner pulse */}
                    <div className="w-2 h-2 rounded-full bg-mediloon-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                </div>
                <p className="text-[10px] font-brand tracking-[0.2em] text-gray-400 uppercase">System Active</p>
            </div>
        );
    }

    const stepColors = {
        'error': 'bg-mediloon-500/15 text-mediloon-400 border border-mediloon-500/20',
        'tool_call': 'bg-accent-sapphire/15 text-blue-400 border border-accent-sapphire/20',
        'thought': 'bg-accent-violet/15 text-violet-400 border border-accent-violet/20',
        'final_answer': 'bg-accent-emerald/15 text-emerald-400 border border-accent-emerald/20',
    };
    const defaultStep = 'bg-gray-500/15 text-gray-400 border border-gray-500/20';

    return (
        <>
            {trace.map((entry, index) => (
                <div
                    key={index}
                    className="group relative pl-4 border-l-2 border-gray-800/60 hover:border-gray-600 transition-colors new-log-entry"
                >
                    {/* Dot */}
                    <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-gray-700 group-hover:bg-mediloon-500 transition-colors ring-4 ring-[#0D0D1A]" />

                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] uppercase tracking-wider font-brand font-bold px-1.5 py-0.5 rounded-md ${stepColors[entry.step] || defaultStep}`}>
                            {entry.step}
                        </span>
                        <span className="text-xs text-gray-600 font-mono">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                        </span>
                    </div>

                    {/* Payload */}
                    <div className="text-sm text-gray-300 font-mono bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5">
                        {entry.data && entry.data.source && (
                            <div className="flex items-center gap-2 text-xs mb-2 border-b border-gray-800 pb-2">
                                <span className="text-accent-amber">{entry.data.source}</span>
                                <span className="text-gray-600"><ArrowRight size={12} /></span>
                                <span className="text-accent-violet">{entry.data.target}</span>
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
                    className="block text-center text-xs text-gray-500 hover:text-mediloon-400 mt-4 pb-2 transition-colors font-brand"
                >
                    View full trace in Langfuse <ExternalLink size={12} className="inline ml-1" />
                </a>
            )}
        </>
    );
}
