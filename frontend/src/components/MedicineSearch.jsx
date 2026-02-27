import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const API_BASE = '/api';

export default function MedicineSearch({ isOpen, onClose, onAddToCart, sessionId }) {
    const { t, dir } = useLanguage();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [addedIds, setAddedIds] = useState(new Set());
    const [rxWarning, setRxWarning] = useState(null);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 200);
        }
        if (!isOpen) {
            setQuery('');
            setResults([]);
            setAddedIds(new Set());
            setRxWarning(null);
        }
    }, [isOpen]);

    const doSearch = useCallback(async (q) => {
        if (!q || q.trim().length < 2) {
            setResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await fetch(`${API_BASE}/search/medications?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            setResults(data.results || []);
        } catch (err) {
            console.error('Search error:', err);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 300);
    };

    const handleAdd = (med) => {
        if (med.rx_required) {
            setRxWarning(med.brand_name);
            setTimeout(() => setRxWarning(null), 4000);
            return;
        }
        if ((med.stock_quantity || 0) <= 0) return;

        onAddToCart(med);
        setAddedIds(prev => new Set(prev).add(med.id));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up" style={{ maxHeight: '80vh' }} dir={dir}>
                {/* Search Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-50 text-red-500 rounded-xl">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={handleInputChange}
                            placeholder={t('searchMedicinesByName')}
                            className="flex-1 text-lg font-medium text-gray-800 bg-transparent outline-none placeholder:text-gray-400"
                        />
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Rx Warning Toast */}
                {rxWarning && (
                    <div className="mx-5 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 animate-fade-in-up">
                        <span className="text-amber-500 text-lg">&#9888;</span>
                        <p className="text-sm text-amber-800">
                            {t('rxRequiresPrescriptionUseVoice', { med: rxWarning })}
                        </p>
                    </div>
                )}

                {/* Results */}
                <div className="overflow-y-auto p-4 space-y-2" style={{ maxHeight: 'calc(80vh - 100px)' }}>
                    {isSearching && (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-3 border-red-200 border-t-red-500 rounded-full animate-spin" />
                        </div>
                    )}

                    {!isSearching && query.length >= 2 && results.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm">{t('noMedicinesFoundFor', { query })}</p>
                        </div>
                    )}

                    {!isSearching && query.length < 2 && results.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <p className="text-sm">{t('typeAtLeastTwoChars')}</p>
                        </div>
                    )}

                    {results.map((med, idx) => {
                        const isAdded = addedIds.has(med.id);
                        const outOfStock = (med.stock_quantity || 0) <= 0;

                        return (
                            <div
                                key={med.id || idx}
                                className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${isAdded
                                        ? 'border-green-200 bg-green-50/50'
                                        : 'border-gray-100 hover:border-red-200 hover:bg-red-50/20'
                                    }`}
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-semibold text-gray-800">{med.brand_name}</h4>
                                        {med.rx_required ? (
                                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded">RX</span>
                                        ) : (
                                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded">OTC</span>
                                        )}
                                        {outOfStock && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded">{t('outOfStock')}</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 mt-0.5">{med.generic_name} &bull; {med.dosage}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs text-gray-400 capitalize">{med.form}</span>
                                        {med.price > 0 && (
                                            <span className="text-xs font-semibold text-gray-700">€{med.price}</span>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleAdd(med)}
                                    disabled={isAdded || outOfStock}
                                    className={`ml-4 flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${isAdded
                                            ? 'bg-green-100 text-green-700 cursor-default'
                                            : outOfStock
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                : med.rx_required
                                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                                                    : 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200 hover:shadow-red-300 active:scale-95'
                                        }`}
                                >
                                    {isAdded ? (
                                        <span className="flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                            {t('added')}
                                        </span>
                                    ) : med.rx_required ? (
                                        <span className="flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                            {t('rxOnly')}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                            </svg>
                                            {t('add')}
                                        </span>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
