import React, { useState } from 'react';

const DEFAULT_ADDRESS = '42 MG Road, Koramangala 5th Block, Bangalore 560095';

export default function AddressModal({ isOpen, onClose, onConfirm, cart }) {
    const [mode, setMode] = useState('default'); // 'default' | 'manual'
    const [manualAddress, setManualAddress] = useState('');

    if (!isOpen) return null;

    const canConfirm = mode === 'default' || (mode === 'manual' && manualAddress.trim().length > 10);
    const selectedAddress = mode === 'default' ? DEFAULT_ADDRESS : manualAddress.trim();

    const handleConfirm = () => {
        if (!canConfirm) return;
        onConfirm(selectedAddress);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-50 text-red-500 rounded-xl">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800 text-lg">Delivery Address</h2>
                            <p className="text-xs text-gray-400">Where should we deliver your order?</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Default Address Option */}
                    <button
                        onClick={() => setMode('default')}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${mode === 'default'
                                ? 'border-red-400 bg-red-50/50 shadow-sm'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${mode === 'default' ? 'border-red-500' : 'border-gray-300'
                                }`}>
                                {mode === 'default' && <div className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800 text-sm">Default Address</p>
                                <p className="text-sm text-gray-500 mt-1">{DEFAULT_ADDRESS}</p>
                            </div>
                        </div>
                    </button>

                    {/* Manual Address Option */}
                    <button
                        onClick={() => setMode('manual')}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${mode === 'manual'
                                ? 'border-red-400 bg-red-50/50 shadow-sm'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${mode === 'manual' ? 'border-red-500' : 'border-gray-300'
                                }`}>
                                {mode === 'manual' && <div className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-gray-800 text-sm">Enter Address Manually</p>
                                <p className="text-xs text-gray-400 mt-0.5">Type your full delivery address</p>
                            </div>
                        </div>
                    </button>

                    {/* Manual Address Input */}
                    {mode === 'manual' && (
                        <div className="animate-fade-in-up">
                            <textarea
                                value={manualAddress}
                                onChange={(e) => setManualAddress(e.target.value)}
                                placeholder="Enter your complete delivery address including pincode..."
                                rows={3}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all resize-none"
                                autoFocus
                            />
                            {manualAddress.length > 0 && manualAddress.trim().length < 11 && (
                                <p className="text-xs text-amber-600 mt-1">Please enter a complete address (at least 10 characters)</p>
                            )}
                        </div>
                    )}

                    {/* Order Summary Mini */}
                    {cart && cart.items?.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>{cart.item_count} item(s)</span>
                                <span className="font-semibold text-gray-800">&#8377;{cart.total?.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {cart.items.slice(0, 3).map((item, i) => (
                                    <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600">
                                        {item.brand_name}
                                    </span>
                                ))}
                                {cart.items.length > 3 && (
                                    <span className="text-[10px] text-gray-400">+{cart.items.length - 3} more</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 ${canConfirm
                                ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-200 hover:shadow-red-300 active:scale-[0.98]'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        Confirm &amp; Place Order
                    </button>
                </div>
            </div>
        </div>
    );
}
