import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// Script name badge display
const SCRIPT_BADGES = {
    'Devanagari': { label: 'हिंदी', color: 'bg-orange-500' },
    'Tamil': { label: 'தமிழ்', color: 'bg-purple-500' },
    'Telugu': { label: 'తెలుగు', color: 'bg-blue-500' },
    'Bengali': { label: 'বাংলা', color: 'bg-green-500' },
    'Gujarati': { label: 'ગુજરાતી', color: 'bg-yellow-500' },
    'Kannada': { label: 'ಕನ್ನಡ', color: 'bg-pink-500' },
    'Malayalam': { label: 'മലയാളം', color: 'bg-indigo-500' },
    'Gurmukhi': { label: 'ਪੰਜਾਬੀ', color: 'bg-teal-500' },
    'Odia': { label: 'ଓଡ଼ିଆ', color: 'bg-cyan-500' },
    'Arabic': { label: 'عربی', color: 'bg-emerald-500' },
    'Latin': { label: 'EN', color: 'bg-gray-500' },
};

function getLanguageBadge(scriptInfo) {
    if (!scriptInfo) return SCRIPT_BADGES.Latin;

    if (scriptInfo.script && scriptInfo.script !== 'Latin' && SCRIPT_BADGES[scriptInfo.script]) {
        return SCRIPT_BADGES[scriptInfo.script];
    }

    const lang = (scriptInfo.lang || '').toLowerCase();
    if (lang.startsWith('de')) return { label: 'DE', color: 'bg-blue-500' };
    if (lang.startsWith('ar')) return SCRIPT_BADGES.Arabic;
    return { label: 'EN', color: 'bg-gray-500' };
}

export default function LiveOverlay({
    isOpen,
    onClose,
    isListening,
    isSpeaking,
    isLoading = false,
    isTranscribing = false,
    transcript,
    messages,
    onUpload,
    audioLevel = 0,
    cart,
    scriptInfo = { lang: 'en-US', script: 'Latin', direction: 'ltr' },
    candidates = [],
    onSelectCandidate,
    languageOptions = [],
    activeLanguage,
    onSelectLanguage,
    isAnyModalOpen,
    onRetryListening,
    onOpenStartWithPrescription,
    onOpenAddPrescription,
}) {
    const { t, setLang } = useLanguage();
    const scrollRef = useRef(null);
    const [showUploadPrompt, setShowUploadPrompt] = useState(false);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const [cartNotif, setCartNotif] = useState(null);
    const [showLangMenu, setShowLangMenu] = useState(false);
    const prevCartCount = useRef(cart?.item_count || 0);

    // Auto-scroll chat in overlay
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, transcript]);

    // Detect if the agent asked for a prescription
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        const text = String(lastMsg?.text || '').toLowerCase();
        const uploadHints = ['upload', 'prescription', 'rezept', 'وصفة', 'प्रिस्क्रिप्शन'];
        if (isOpen && !lastMsg?.isUser &&
            uploadHints.some((hint) => text.includes(hint))) {
            setShowUploadPrompt(true);
        } else {
            setShowUploadPrompt(false);
        }
    }, [messages, isOpen]);

    // Cart add animation — show item name from last assistant message
    useEffect(() => {
        const currentCount = cart?.item_count || 0;
        if (isOpen && currentCount > prevCartCount.current) {
            const added = currentCount - prevCartCount.current;
            let itemName = '';
            if (!itemName && cart?.items?.length > 0) {
                itemName = cart.items[cart.items.length - 1]?.brand_name || '';
            }
            setCartNotif(itemName ? `✓ ${itemName}` : `+${added} ${t('added')}`);
            const timer = setTimeout(() => setCartNotif(null), 3000);
            prevCartCount.current = currentCount;
            return () => clearTimeout(timer);
        }
        prevCartCount.current = currentCount;
    }, [cart?.item_count, isOpen, cart?.items, t]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) onUpload(file);
        e.target.value = '';
    };

    const handleCameraChange = (e) => {
        const file = e.target.files[0];
        if (file) onUpload(file);
        e.target.value = '';
    };

    // Voice-reactive shape calculations
    const sphereStyles = useMemo(() => {
        const scale = 1 + (audioLevel * 0.5);
        const bl1 = 60 - (audioLevel * 30);
        const bl2 = 40 + (audioLevel * 30);
        const bl3 = 30 + (audioLevel * 40);
        const bl4 = 70 - (audioLevel * 30);
        const borderRadius = `${bl1}% ${bl2}% ${bl3}% ${bl4}% / ${bl2}% ${bl3}% ${bl4}% ${bl1}%`;
        const glowSize = 20 + (audioLevel * 40);
        const glowOpacity = 0.4 + (audioLevel * 0.4);
        const animationDuration = Math.max(1.5, 6 - (audioLevel * 4));

        return { scale, borderRadius, glowSize, glowOpacity, animationDuration };
    }, [audioLevel]);

    if (!isOpen) return null;

    const cartCount = cart?.item_count || 0;
    const activeBadge = getLanguageBadge(scriptInfo);
    const langList = languageOptions.length ? languageOptions : [{ code: 'en-US', label: 'English', sub: '' }];
    const activeLangLabel = langList.find(l => l.code === activeLanguage)?.label || langList[0]?.label || 'English';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Blurred Backdrop */}
            <div
                className="absolute inset-0 bg-white/60 backdrop-blur-md transition-opacity duration-500"
                onClick={onClose}
            ></div>

            {/* Detected Language Badge - Top Left */}
            {isListening && activeBadge && (
                <div className="absolute top-6 left-6 z-20 pointer-events-none">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg text-white font-semibold text-sm ${activeBadge.color} transition-all duration-200`}>
                        <span className="w-2 h-2 bg-white/80 rounded-full animate-pulse"></span>
                        {activeBadge.label}
                    </div>
                </div>
            )}

            {/* Language selector — visible but subtle */}
            <div className="absolute top-6 right-6 z-30 pointer-events-auto">
                <div className="relative">
                    <button
                        onClick={() => setShowLangMenu(v => !v)}
                        className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm hover:border-red-200 hover:text-red-600 transition-colors text-sm font-semibold"
                        title={t('chooseListeningLanguage')}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m3 14h9m-9 0a3 3 0 01-3-3v-4m0 7a3 3 0 01-3-3v-4m6 7v-4m0 0a3 3 0 00-3-3H3" /></svg>
                        <span>{activeLangLabel}</span>
                        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" /></svg>
                    </button>

                    {showLangMenu && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in">
                            {langList.map((opt, idx) => {
                                const isActive = opt.code === activeLanguage;
                                return (
                                    <button
                                        key={`${opt.code}-${idx}`}
                                        onClick={() => {
                                            onSelectLanguage && onSelectLanguage(opt.code);
                                            // Sync UI language too
                                            if (opt.code) {
                                                const base = opt.code.split('-')[0].toLowerCase();
                                                if (['en', 'de', 'ar', 'hi'].includes(base)) setLang(base);
                                            }
                                            setShowLangMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors ${isActive ? 'bg-red-50 text-red-600 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                                    >
                                        <span className="text-sm">{opt.label}</span>
                                        {opt.sub && <span className="text-xs text-gray-500">{opt.sub}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Cart Badge - Bottom Right */}
            {cartCount > 0 && (
                <div className="absolute bottom-8 right-8 z-20 pointer-events-none">
                    <div className="relative flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2.5 rounded-2xl shadow-xl border border-gray-200 animate-fade-in-up">
                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{cartCount} {cartCount !== 1 ? t('items') : t('item')}</span>
                        {cart?.total > 0 && (
                            <span className="text-xs text-gray-500 font-medium">€{cart.total.toFixed(0)}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Add-to-cart notification */}
            {cartNotif && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                    <div className="flex items-center gap-3 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-2xl voice-cart-notif">
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <span className="font-bold text-base block">{cartNotif}</span>
                            <span className="text-green-100 text-xs">{cart?.item_count || 0} {(cart?.item_count || 0) !== 1 ? t('items') : t('item')} {t('inCart')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Voice Interface */}
            <div className={`relative h-[85vh] flex flex-col justify-end items-center pointer-events-none voice-mode-enter transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isAnyModalOpen ? 'w-1/2 px-4' : 'w-full max-w-2xl mx-auto px-6'}`}>

                {/* Floating Chat History */}
                <div className="w-full flex-1 overflow-y-auto px-6 mb-10 pointer-events-auto mask-gradient" ref={scrollRef}>
                    <div className="space-y-6 pb-4">
                        {messages.slice(-6).map((msg) => (
                            <div key={msg.id} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} w-full animate-slide-up`} style={{ animationFillMode: 'both' }}>
                                {msg.isUser ? (
                                    <div className="px-5 py-3.5 bg-indigo-600 text-white rounded-[1.4rem] rounded-tr-sm shadow-apple max-w-[85%] text-[15px] font-body">
                                        {msg.text}
                                    </div>
                                ) : (
                                    <div className="flex gap-2.5 sm:gap-3 items-start max-w-full">
                                        <div className="w-8 h-8 rounded-full bg-surface-cloud flex items-center justify-center flex-shrink-0 mt-1 shadow-sm border border-black/[0.04] animate-scale-in">
                                            <span className="text-indigo-600 font-brand font-bold text-xs">M</span>
                                        </div>
                                        <div className="px-5 py-3.5 bg-white/95 backdrop-blur-md rounded-[1.4rem] rounded-tl-sm shadow-apple border border-white max-w-[85%] flex flex-col gap-2">
                                            {msg.text.split('\n').map((part, index) => (
                                                <div key={index} className="flex items-start gap-2">
                                                    {part.startsWith('- ') && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />}
                                                    <span className="text-ink-primary font-body text-[15px] leading-relaxed block">{part.replace(/^- /, '')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {/* Real-time transcript with native script support */}
                        {(isListening || isTranscribing) && transcript && (
                            <div className="flex justify-end w-full animate-slide-up" style={{ animationFillMode: 'both' }}>
                                <div className="px-5 py-3.5 bg-white/50 backdrop-blur-md text-ink-primary rounded-[1.4rem] rounded-tr-sm shadow-sm border border-white max-w-[85%] text-[15px] font-body flex items-center gap-3">
                                    <span className="opacity-70">{transcript}</span>
                                    <div className="flex gap-1 items-center h-4">
                                        <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Medicine Candidates */}
                {candidates && candidates.length > 0 && (
                    <div className="w-full mb-4 pointer-events-auto animate-fade-in-up px-2">
                        <p className="text-xs text-center text-gray-400 font-medium mb-3 tracking-wide uppercase">{t('tapToAdd')}</p>
                        <div className="flex gap-2.5 overflow-x-auto pb-1 justify-center flex-wrap">
                            {candidates.slice(0, 4).map((med, i) => (
                                <button
                                    key={med.id || i}
                                    onClick={() => onSelectCandidate && onSelectCandidate(med)}
                                    className="px-4 py-2 bg-white/80 backdrop-blur-md border border-indigo-100 rounded-full text-sm font-brand font-medium text-indigo-700 shadow-sm hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-300 active:scale-95 flex-shrink-0 animate-fade-in-up"
                                    style={{ animationDelay: `${0.1 + i * 0.05}s`, animationFillMode: 'both' }}
                                >
                                    <div className="flex items-center gap-1.5 mb-1 w-full">
                                        <span className="font-bold text-gray-800 text-sm leading-tight truncate flex-1">{med.brand_name}</span>
                                        {med.rx_required ? (
                                            <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0">RX</span>
                                        ) : (
                                            <span className="text-[9px] font-bold bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full flex-shrink-0">OTC</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 leading-tight">{med.dosage}</p>
                                    <div className="mt-2 flex items-center gap-1 text-indigo-500 text-xs font-semibold">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                        {t('addToCart')}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upload Prompt */}
                {showUploadPrompt && (
                    <div className="mb-8 pointer-events-auto animate-fade-in-up">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                            accept="image/*,.pdf"
                        />
                        <input
                            type="file"
                            ref={cameraInputRef}
                            className="hidden"
                            onChange={handleCameraChange}
                            accept="image/*"
                            capture="environment"
                        />
                        <button className="flex items-center gap-2 px-5 py-2.5 bg-white/90 backdrop-blur border border-indigo-100/50 rounded-full shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-indigo-600 font-brand font-medium group active:scale-95 animate-fade-in-up"
                            style={{ animationDelay: '0.1s' }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <svg className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            <span className="text-sm">{t('tapUploadPrescription')}</span>
                        </button>
                        <button className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-white/90 backdrop-blur border border-indigo-100/50 rounded-full shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-indigo-600 font-brand font-medium group active:scale-95 animate-fade-in-up"
                            style={{ animationDelay: '0.2s' }}
                            onClick={() => cameraInputRef.current?.click()}
                        >
                            <svg className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h2l1.5-1.5A2 2 0 0110 3h4a2 2 0 011.5.5L17 5h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span className="text-sm">{t('tapCapturePrescription')}</span>
                        </button>
                    </div>
                )}

                {/* System Active & Prescription Actions Combined (Voice Mode) */}
                <div className="mb-6 w-full max-w-xl pointer-events-auto animate-fade-in-up">
                    <div className="w-full bg-white/90 backdrop-blur-md border border-mediloon-100/50 rounded-2xl shadow-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-4 relative overflow-hidden group hover:border-mediloon-200 transition-colors">
                        {/* Ambient Glow */}
                        <div className="absolute -left-10 -top-10 w-32 h-32 bg-mediloon-100/30 rounded-full blur-3xl group-hover:bg-mediloon-100/50 transition-colors pointer-events-none" />

                        {/* Left Side: System Active Orb & Text */}
                        <div className="flex items-center gap-3 relative z-10 pl-2 w-full sm:w-auto">
                            <div className="relative w-10 h-10 flex flex-shrink-0 items-center justify-center">
                                {/* Outer rings */}
                                <div className="absolute inset-0 rounded-full border border-mediloon-500/20 scale-100 group-hover:scale-110 transition-transform duration-700" />
                                <div className="absolute inset-0 rounded-full border border-mediloon-500/10 scale-75 group-hover:scale-90 transition-transform duration-700 delay-75" />
                                {/* Inner pulse */}
                                <div className="w-2.5 h-2.5 rounded-full bg-mediloon-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="text-[11px] font-brand tracking-[0.15em] text-mediloon-600 font-bold uppercase leading-tight">{t('systemActive')}</span>
                                <span className="text-[10px] font-body text-ink-muted leading-tight">Ready to assist</span>
                            </div>
                        </div>

                        {/* Right Side: Prescription Options */}
                        <div className="flex items-center justify-center sm:justify-end gap-2 relative z-10 w-full sm:w-auto">
                            <button
                                onClick={() => onOpenStartWithPrescription && onOpenStartWithPrescription()}
                                disabled={isLoading}
                                className="flex-1 sm:flex-none px-3 py-2 bg-mediloon-50 hover:bg-mediloon-100 text-mediloon-700 rounded-xl text-xs font-brand font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span>{t('startWithPrescription')}</span>
                                <span className="bg-red-500 text-white text-[9px] px-1 rounded uppercase min-w-max ml-0.5">{t('new')}</span>
                            </button>
                            <button
                                onClick={() => onOpenAddPrescription && onOpenAddPrescription()}
                                disabled={isLoading}
                                className="flex-1 sm:flex-none px-3 py-2 bg-mediloon-50 hover:bg-mediloon-100 text-mediloon-700 rounded-xl text-xs font-brand font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 7a2 2 0 012-2h2l1.5-1.5A2 2 0 0110 3h4a2 2 0 011.5.5L17 5h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                <span className="hidden sm:inline">{t('addPrescription')}</span>
                                <span className="sm:hidden">Add Rx</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* VOICE-REACTIVE SIRI SPHERE */}
                <div className="pointer-events-auto mb-16 relative">
                    {/* Exit Button */}
                    <div className="mt-8 flex items-center justify-center gap-4 animate-slide-up relative z-20" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
                        <button
                            onClick={onClose}
                            className="w-12 h-12 rounded-full border border-black/[0.1] bg-white text-ink-primary hover:bg-surface-cloud hover:text-indigo-600 flex items-center justify-center transition-all duration-200 shadow-sm"
                            title={t('exitVoiceMode')}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* The Voice-Reactive Sphere Container */}
                    <div
                        className="relative w-36 h-36 flex items-center justify-center"
                        style={{
                            transform: `scale(${sphereStyles.scale})`,
                            transition: 'transform 0.08s ease-out'
                        }}
                    >
                        {/* Ambient Glow */}
                        <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-[80px] animate-pulse-subtle scale-[1.5]" />

                        {/* Outer Sphere — Indigo/Blue/Cyan morph */}
                        <div
                            className={`absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500 via-blue-500 to-cyan-400 opacity-90 transition-all duration-300 ${isSpeaking ? 'scale-[1.15] animate-spin-slow' :
                                isListening ? 'scale-100' : 'scale-[0.85] opacity-60'
                                }`}
                            style={{
                                clipPath: `polygon(${sphereStyles.borderRadius.split(' / ')[0].split(' ').map((p, i) => `${p} ${sphereStyles.borderRadius.split(' / ')[1].split(' ')[i]}`).join(', ')})`,
                                boxShadow: `0 0 ${40 + audioLevel * 60}px rgba(79, 70, 229, ${0.4 + audioLevel * 0.4})`
                            }}
                        />

                        {/* Inner Core — Blue/Cyan/Violet */}
                        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-blue-400 via-cyan-300 to-violet-300 opacity-80 mix-blend-overlay" />
                        <div className="absolute inset-6 rounded-full bg-white opacity-20 blur-sm" />

                        {/* Status Icon Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center z-10 text-white drop-shadow-lg">
                            {isTranscribing ? (
                                <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : isListening ? (
                                <svg
                                    className="w-10 h-10"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    style={{
                                        transform: `scale(${1 + audioLevel * 0.3})`,
                                        transition: 'transform 0.1s ease-out'
                                    }}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                            ) : isSpeaking ? (
                                <svg className="w-10 h-10 animate-bounce-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                </svg>
                            ) : (
                                <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
                            )}
                        </div>
                    </div>

                    {/* Audio Level Bar */}
                    {isListening && (
                        <div className="mt-6 w-32 h-2 bg-gray-200/50 rounded-full overflow-hidden mx-auto">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-400 via-blue-500 to-cyan-400 rounded-full"
                                style={{
                                    width: `${Math.max(5, audioLevel * 100)}%`,
                                    transition: 'width 0.05s ease-out'
                                }}
                            ></div>
                        </div>
                    )}

                    <p className="text-center mt-4 font-medium text-gray-500">
                        {isTranscribing ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                {t('transcribing')}
                            </span>
                        ) : isListening ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                {t('listening')}
                            </span>
                        ) : isSpeaking ? t('speaking') : isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                {t('thinking')}
                            </span>
                        ) : (
                            <button
                                onClick={() => onRetryListening?.()}
                                className="group inline-flex items-center justify-center gap-2.5 px-5 py-3 lg:px-6 lg:py-3.5 rounded-full min-h-[44px] lg:min-h-[52px] min-w-[170px] lg:min-w-[210px] border border-red-200/70 bg-white/90 backdrop-blur-sm text-red-500 hover:text-red-600 hover:bg-red-50 hover:border-red-300 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer"
                            >
                                <span className="relative inline-flex">
                                    <span className="w-2.5 h-2.5 bg-red-400 rounded-full"></span>
                                    <span className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-60"></span>
                                </span>
                                <span className="font-semibold tracking-[0.01em]">{t('tapToSpeak')}</span>
                            </button>
                        )}
                    </p>
                </div>
            </div>

            <style>{`
                .mask-gradient {
                    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 100%);
                }
                @keyframes liquid-morph {
                    0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
                    25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
                    50% { border-radius: 50% 50% 40% 60% / 40% 50% 60% 50%; }
                    75% { border-radius: 40% 60% 50% 50% / 60% 40% 50% 60%; }
                }
                .voice-cart-notif {
                    animation: voice-notif-anim 2s ease-out forwards;
                }
                @keyframes voice-notif-anim {
                    0% { opacity: 0; transform: translateY(20px) scale(0.8); }
                    15% { opacity: 1; transform: translateY(0) scale(1); }
                    75% { opacity: 1; transform: translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateY(-20px) scale(0.8); }
                }
                .animate-fade-in {
                    animation: fade-in 0.15s ease-out;
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
