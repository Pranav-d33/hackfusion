/**
 * TracePanel - Agent trace display with animations
 */
import React, { useState, useEffect, useRef } from 'react';

export default function TracePanel({ trace, latency, traceId, traceUrl }) {
    const [isExpanded, setIsExpanded] = useState(true); // Default open for visibility
    const [visibleEntries, setVisibleEntries] = useState([]);
    const prevTraceLength = useRef(0);

    // Animate new trace entries
    useEffect(() => {
        if (trace && trace.length > prevTraceLength.current) {
            // New entries added - animate them in
            const newEntries = trace.slice(prevTraceLength.current);
            newEntries.forEach((_, i) => {
                setTimeout(() => {
                    setVisibleEntries(prev => [...prev, prevTraceLength.current + i]);
                }, i * 100);
            });
        }
        prevTraceLength.current = trace?.length || 0;
    }, [trace]);

    return (
        <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-xl border border-gray-800/50">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between text-white hover:bg-gray-800/50 transition-all"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/20">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-4 h-4 text-white"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="4 17 10 11 4 5" />
                            <line x1="12" y1="19" x2="20" y2="19" />
                        </svg>
                    </div>
                    <div className="text-left">
                        <span className="font-semibold text-sm">Agent Trace</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            {latency && (
                                <span className="text-xs text-emerald-400 font-mono">
                                    {latency}ms
                                </span>
                            )}
                            {trace && trace.length > 0 && (
                                <span className="text-xs text-gray-500">
                                    {trace.length} steps
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* Trace content */}
            <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-[400px]' : 'max-h-0'}`}>
                <div className="border-t border-gray-800">
                    {/* Langfuse Link */}
                    {traceUrl && (
                        <div className="p-3 bg-gray-800/50 border-b border-gray-700/50">
                            <a
                                href={traceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 rounded-lg text-white text-xs font-medium transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                Open in Langfuse
                            </a>
                        </div>
                    )}

                    {(!trace || trace.length === 0) ? (
                        <div className="p-6 text-center">
                            <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                <div className="w-4 h-4 border-2 border-gray-600 border-t-green-400 rounded-full animate-spin-slow" />
                            </div>
                            <p className="text-gray-500 text-sm">Waiting for agent activity...</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-800/50 max-h-72 overflow-y-auto">
                            {trace.map((entry, index) => (
                                <div
                                    key={index}
                                    className={`p-3 animate-trace-entry hover:bg-gray-800/30 transition-colors`}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <StepBadge step={entry.step} />
                                        <span className="text-xs text-gray-500 font-mono">
                                            {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                                        </span>
                                    </div>

                                    {/* CoT Visualization */}
                                    {entry.data && entry.data.source && entry.data.target ? (
                                        <div className="bg-gray-800/30 p-2 rounded-lg border border-gray-700/30">
                                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-300 mb-1.5">
                                                <span className="text-blue-400">{entry.data.source}</span>
                                                <span className="text-gray-500">→</span>
                                                <span className="text-purple-400">{entry.data.target}</span>
                                                <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 font-mono text-[10px] ml-auto">
                                                    {entry.data.action}
                                                </span>
                                            </div>

                                            {/* Specialized content based on action */}
                                            {entry.data.result && entry.data.result.message && (
                                                <div className="text-sm text-gray-300 italic mb-1">
                                                    "{entry.data.result.message}"
                                                </div>
                                            )}

                                            <div className="text-xs text-gray-400 font-mono overflow-x-auto">
                                                {entry.data.input && (
                                                    <div className="mb-1">
                                                        <span className="text-gray-500">Input:</span> {typeof entry.data.input === 'string' ? entry.data.input : JSON.stringify(entry.data.input)}
                                                    </div>
                                                )}
                                                {entry.data.result && !entry.data.result.message && (
                                                    <div>
                                                        <span className="text-gray-500">Result:</span> {JSON.stringify(entry.data.result)}
                                                    </div>
                                                )}
                                                {entry.data.args && (
                                                    <div>
                                                        <span className="text-gray-500">Args:</span> {JSON.stringify(entry.data.args)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono bg-gray-800/30 p-2 rounded-lg">
                                            {typeof entry.data === 'object'
                                                ? JSON.stringify(entry.data, null, 2)
                                                : entry.data}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StepBadge({ step }) {
    const config = {
        safety_check: { bg: 'from-yellow-500 to-orange-500', icon: '🛡️' },
        nlu_parse: { bg: 'from-blue-500 to-cyan-500', icon: '🧠' },
        plan: { bg: 'from-purple-500 to-pink-500', icon: '📋' },
        tool_call: { bg: 'from-green-500 to-emerald-500', icon: '🔧' },
        execute: { bg: 'from-cyan-500 to-teal-500', icon: '⚡' },
        error: { bg: 'from-red-500 to-rose-500', icon: '❌' },
        default: { bg: 'from-gray-500 to-gray-600', icon: '📍' }
    };

    const { bg, icon } = config[step] || config.default;

    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium text-white bg-gradient-to-r ${bg} shadow-sm flex items-center gap-1`}>
            <span>{icon}</span>
            <span>{step}</span>
        </span>
    );
}
