import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function OrderSummaryModal({ isOpen, onClose, onConfirm, onBack, cart, address, isVoiceMode }) {
    const { t, dir } = useLanguage();
    if (!isOpen) return null;

    const items = cart?.items || [];
    const subtotal = cart?.subtotal || 0;
    const tax = cart?.tax || 0;
    const shipping = cart?.shipping || 0;
    const total = cart?.total || 0;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center ${isVoiceMode ? 'justify-end p-4 pr-6' : 'justify-center px-4'}`}>
            {/* Backdrop */}
            <div
                className={`absolute inset-0 ${isVoiceMode ? 'bg-black/20 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm'}`}
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className={`relative w-full ${isVoiceMode
                    ? 'max-w-md animate-slide-in-right h-[calc(100vh-2rem)] my-4'
                    : 'max-w-lg animate-fade-in-up max-h-[90vh]'
                    } bg-white rounded-3xl shadow-glass-lg overflow-hidden flex flex-col`}
                dir={dir}
            >
                {/* Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800 text-lg">Order Summary</h2>
                            <p className="text-xs text-gray-400">Please review and confirm</p>
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

                {/* Body — scrollable */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1">

                    {/* Cart Items */}
                    <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-100">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            Items ({items.length})
                        </h3>
                        <div className="space-y-3">
                            {items.map((item, i) => (
                                <div key={item.cart_item_id || i} className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-800 text-sm truncate">{item.brand_name}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {item.generic_name}{item.dosage ? ` • ${item.dosage}` : ''}
                                        </p>
                                        <p className="text-[11px] text-gray-400">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="font-bold text-gray-700 text-sm flex-shrink-0 ml-3">
                                        €{(item.price * item.quantity).toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Price Breakdown */}
                    <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-100 space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Subtotal</span>
                            <span>€{subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Tax</span>
                            <span>€{tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Shipping</span>
                            <span className="text-emerald-600 font-medium">{shipping === 0 ? 'Free' : `€${shipping.toFixed(2)}`}</span>
                        </div>
                        <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-base font-bold text-gray-800">
                            <span>Total</span>
                            <span>€{total.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Delivery Address */}
                    <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-100">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Deliver To
                        </h3>
                        <p className="text-sm text-gray-700 leading-relaxed">{address}</p>
                    </div>

                    {/* Payment Method */}
                    <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-100">
                        <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            Payment
                        </h3>
                        <p className="text-sm font-medium text-amber-800">Cash on Delivery (COD)</p>
                        <p className="text-[11px] text-amber-600 mt-1">We currently only support Cash on Delivery.</p>
                    </div>
                </div>

                {/* Footer — Confirm / Back */}
                <div className="p-5 border-t border-gray-100 bg-gray-50 flex-shrink-0 space-y-2.5">
                    <button
                        onClick={onConfirm}
                        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-200 hover:shadow-emerald-300 active:scale-[0.98]"
                    >
                        Confirm Order
                    </button>
                    <button
                        onClick={onBack}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700 active:scale-[0.98]"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
}
