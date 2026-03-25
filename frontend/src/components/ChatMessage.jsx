/**
 * ChatMessage — Individual chat message bubble
 * Renders plain text or structured medication lists elegantly.
 * Professional pharmacist tone. No emojis.
 */
import React, { useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

/** Remove emoji/symbol characters for clean professional display */
function stripEmojis(text) {
    if (!text) return '';
    return text
        .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/[✅✓❌⚠️]/g, '')
        .replace(/  +/g, ' ')
        .trim();
}

/**
 * Parse a bot message that may contain a numbered medication list.
 * Supports format: "1. Brand Name (dosage) — €price — N in stock"
 */
function parseMessage(text) {
    if (!text) return { type: 'plain', text: '' };
    const cleaned = stripEmojis(text);
    const lines = cleaned.split('\n');

    const preLines = [];
    const items = [];
    const postLines = [];
    let state = 'pre';

    for (const line of lines) {
        const trimmed = line.trim();
        const listMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (listMatch) {
            state = 'list';
            items.push({ num: parseInt(listMatch[1]), raw: listMatch[2] });
        } else if (state === 'list') {
            if (trimmed) postLines.push(trimmed);
        } else {
            if (trimmed) preLines.push(trimmed);
        }
    }

    if (items.length < 2) {
        return { type: 'plain', text: cleaned };
    }

    // Parse each medication line: "Name (dosage) — €price — N in stock"
    const parsedItems = items.map(item => {
        const raw = item.raw;
        const priceMatch = raw.match(/€([\d.,]+)/);
        const stockMatch = raw.match(/(\d+)\s*in stock|[Ss]tock:\s*(\d+)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
        const stockVal = stockMatch ? parseInt(stockMatch[1] ?? stockMatch[2]) : null;
        // Name is everything before the first " — "
        const dashIdx = raw.indexOf(' — ');
        const namePart = (dashIdx > -1 ? raw.slice(0, dashIdx) : raw).trim();
        return {
            num: item.num,
            name: namePart,
            price,
            stock: stockVal,
            inStock: stockVal == null || stockVal > 0,
        };
    });

    return {
        type: 'medication_list',
        pre: preLines.join(' ').trim(),
        items: parsedItems,
        post: postLines.join(' ').trim(),
    };
}

/** Elegant medication selection table */
function MedicationListMessage({ pre, items, post, latency }) {
    const { t } = useLanguage();
    return (
        <div className="space-y-2.5" style={{ minWidth: 260 }}>
            {pre && (
                <p className="text-[13px] font-semibold text-ink-secondary leading-snug">
                    {pre}
                </p>
            )}

            {/* Item table */}
            <div className="rounded-xl shadow-soft overflow-hidden divide-y divide-surface-fog">
                {items.map((item, idx) => (
                    <div
                        key={item.num}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 bg-white transition-colors ${!item.inStock ? 'opacity-55' : ''}`}
                    >
                        {/* Index badge */}
                        <span className="w-[22px] h-[22px] flex-shrink-0 rounded-md bg-mediloon-50 border border-mediloon-100 flex items-center justify-center text-[10px] font-bold text-mediloon-600 leading-none">
                            {item.num}
                        </span>

                        {/* Medication name */}
                        <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold text-ink-primary leading-tight truncate">
                                {item.name}
                            </p>
                            {!item.inStock && (
                                <p className="text-[10px] text-red-500 mt-0.5 font-medium">{t('currentlyUnavailable')}</p>
                            )}
                        </div>

                        {/* Price */}
                        {item.price != null && (
                            <span className="text-[13px] font-bold text-ink-primary flex-shrink-0 tabular-nums">
                                &euro;{item.price.toFixed(2)}
                            </span>
                        )}

                        {/* Stock badge */}
                        {item.stock != null && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 tabular-nums ${item.stock > 10
                                ? 'bg-green-50 text-green-700 border border-green-100'
                                : item.stock > 0
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                    : 'bg-red-50 text-red-600 border border-red-100'
                                }`}>
                                {item.stock > 0 ? `${item.stock} pcs` : 'Out'}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {post && (
                <p className="text-[12.5px] text-ink-muted leading-relaxed">
                    {post}
                </p>
            )}

            {latency != null && (
                <span className="text-[10px] text-ink-faint block text-right font-mono">
                    {latency}ms
                </span>
            )}
        </div>
    );
}

/** Standard plain-text message renderer */
function PlainMessage({ text, latency }) {
    return (
        <>
            <p className="whitespace-pre-wrap text-[14px] font-body text-ink-primary leading-relaxed" dir="auto">
                {text}
            </p>
            {latency != null && (
                <span className="text-[10px] text-ink-faint mt-1.5 block text-right font-mono">
                    {latency}ms
                </span>
            )}
        </>
    );
}

export default function ChatMessage({ message, isUser, isLoading, latency }) {
    const parsed = useMemo(() => {
        if (!message || isUser) return null;
        return parseMessage(message);
    }, [message, isUser]);

    if (isLoading) {
        return (
            <div className="flex justify-start message-enter">
                <div className="flex items-start gap-2 md:gap-2.5">
                    <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg md:rounded-xl bg-indigo-50/80 backdrop-blur-md flex items-center justify-center flex-shrink-0 mt-0.5 shadow-soft-sm">
                        <span className="text-indigo-500 font-brand font-bold text-[10px] md:text-xs">M</span>
                    </div>
                    <div className="bg-white/70 backdrop-blur-xl rounded-2xl rounded-tl-md px-3 py-2 md:px-4 md:py-3 max-w-[85%] md:max-w-[80%] shadow-apple-md">
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
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} message-enter mb-3 md:mb-4 w-full`}>
            {isUser ? (
                /* User message — Indigo bubble */
                <div className="bg-indigo-600/95 backdrop-blur-md text-white rounded-2xl rounded-tr-sm md:rounded-[1.4rem] md:rounded-tr-sm px-3.5 py-2.5 md:px-5 md:py-3.5 max-w-[88%] md:max-w-[80%] shadow-md shadow-indigo-500/20">
                    <p className="whitespace-pre-wrap text-[14px] md:text-[15px] font-body leading-relaxed" dir="auto">{message}</p>
                </div>
            ) : (
                /* Bot message — Frosted White bubble with avatar */
                <div className="flex items-start gap-2 md:gap-3 max-w-[95%] md:max-w-[88%] w-full">
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/70 backdrop-blur-md flex items-center justify-center flex-shrink-0 mt-1 shadow-soft-sm">
                        <span className="text-indigo-600 font-brand font-bold text-[10px] md:text-xs">M</span>
                    </div>
                    <div className="bg-white/70 backdrop-blur-2xl rounded-2xl rounded-tl-sm md:rounded-[1.4rem] md:rounded-tl-sm px-3.5 py-3 md:px-5 md:py-4 shadow-apple-sm md:shadow-apple-md flex-1 min-w-0">
                        {parsed?.type === 'medication_list' ? (
                            <MedicationListMessage
                                pre={parsed.pre}
                                items={parsed.items}
                                post={parsed.post}
                                latency={latency}
                            />
                        ) : (
                            <PlainMessage text={parsed?.text ?? message} latency={latency} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
