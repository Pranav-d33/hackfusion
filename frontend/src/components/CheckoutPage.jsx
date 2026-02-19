import React, { useState, useEffect } from 'react';
import { ShoppingBag, MapPin, CreditCard, Check, ChevronRight, ArrowLeft, Plus, X } from 'lucide-react';

const DEFAULT_ADDRESS = '42 MG Road, Koramangala 5th Block, Bangalore 560095';

export default function CheckoutPage({ isOpen, onClose, cart, onConfirm }) {
    const [step, setStep] = useState('review'); // 'review' | 'address' | 'confirm'
    const [addressMode, setAddressMode] = useState('default'); // 'default' | 'manual'
    const [manualAddress, setManualAddress] = useState('');
    const [showAddressPopup, setShowAddressPopup] = useState(false);
    const [finalAddress, setFinalAddress] = useState(DEFAULT_ADDRESS);
    const [isProcessing, setIsProcessing] = useState(false);

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setStep('review');
            setIsProcessing(false);
            setAddressMode('default');
            setFinalAddress(DEFAULT_ADDRESS);
            setShowAddressPopup(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const subtotal = cart?.subtotal || 0;
    const tax = cart?.tax || 0;
    const shipping = cart?.shipping || 0;
    const total = cart?.total || 0;
    const items = cart?.items || [];

    const handlePlaceOrder = async () => {
        setIsProcessing(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        onConfirm(finalAddress);
        setIsProcessing(false);
    };

    const handleManualAddressSave = () => {
        if (manualAddress.trim().length > 5) {
            setFinalAddress(manualAddress);
            setAddressMode('manual');
            setShowAddressPopup(false);
            setStep('confirm');
        }
    };

    const handleDefaultSelect = () => {
        setFinalAddress(DEFAULT_ADDRESS);
        setAddressMode('default');
        setStep('confirm');
    };

    return (
        <div className="fixed inset-0 z-50 bg-surface-snow flex flex-col font-body animate-fade-in text-ink-primary">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10 transition-all">
                <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
                    <button
                        onClick={() => {
                            if (step === 'confirm') setStep('address');
                            else if (step === 'address') setStep('review');
                            else onClose();
                        }}
                        className="p-2 -ml-2 text-ink-muted hover:text-ink-primary hover:bg-surface-cloud rounded-xl transition-all"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-brand font-bold text-lg text-ink-primary">
                        {step === 'review' && 'Review Cart'}
                        {step === 'address' && 'Select Address'}
                        {step === 'confirm' && 'Confirm Order'}
                    </h1>
                    <div className="w-10" />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
                <div className="max-w-3xl mx-auto space-y-6">

                    {/* STEP 1: REVIEW */}
                    {step === 'review' && (
                        <div className="animate-fade-in-up">
                            <div className="bg-white rounded-3xl p-6 shadow-soft-sm border border-gray-100 mb-6">
                                <h2 className="font-brand font-bold text-ink-primary mb-4 flex items-center gap-2">
                                    <ShoppingBag size={20} className="text-mediloon-500" />
                                    Items ({items.length})
                                </h2>
                                <div className="space-y-4">
                                    {items.map((item) => (
                                        <div key={item.cart_item_id} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                                            <div>
                                                <p className="font-semibold text-ink-primary">{item.brand_name}</p>
                                                <p className="text-xs text-ink-muted">{item.generic_name} • {item.dosage}</p>
                                                <p className="text-xs text-ink-muted mt-1">Qty: {item.quantity}</p>
                                            </div>
                                            <p className="font-bold text-ink-primary">₹{(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <OrderTotals subtotal={subtotal} tax={tax} shipping={shipping} total={total} />

                            <button
                                onClick={() => setStep('address')}
                                className="w-full mt-6 py-4 rounded-2xl bg-gradient-to-r from-mediloon-500 to-mediloon-600 text-white font-brand font-bold text-lg shadow-lg shadow-mediloon-200 hover:shadow-mediloon-300 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
                            >
                                Proceed to Address <ChevronRight size={20} />
                            </button>
                        </div>
                    )}

                    {/* STEP 2: ADDRESS SELECTION */}
                    {step === 'address' && (
                        <div className="animate-fade-in-up space-y-4">
                            <p className="text-ink-muted text-sm px-1">Where should we deliver your medicines?</p>

                            {/* Default Address Option */}
                            <button
                                onClick={handleDefaultSelect}
                                className="w-full text-left bg-white rounded-3xl p-6 shadow-soft-sm border border-gray-100 hover:border-mediloon-300 hover:shadow-soft-md transition-all group"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-mediloon-50 flex items-center justify-center text-mediloon-600 group-hover:bg-mediloon-100 transition-colors">
                                        <MapPin size={20} />
                                    </div>
                                    <div>
                                        <span className="font-bold text-ink-primary block text-lg">Home (Default)</span>
                                        <span className="text-sm text-ink-muted mt-1 block leading-relaxed">{DEFAULT_ADDRESS}</span>
                                    </div>
                                    <div className="ml-auto mt-2">
                                        <ChevronRight size={20} className="text-gray-300 group-hover:text-mediloon-500 transition-colors" />
                                    </div>
                                </div>
                            </button>

                            {/* New Address Option */}
                            <button
                                onClick={() => setShowAddressPopup(true)}
                                className="w-full text-left bg-white rounded-3xl p-6 shadow-soft-sm border border-gray-100 hover:border-mediloon-300 hover:shadow-soft-md transition-all group"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-surface-cloud flex items-center justify-center text-ink-muted group-hover:bg-mediloon-50 group-hover:text-mediloon-600 transition-colors">
                                        <Plus size={20} />
                                    </div>
                                    <div>
                                        <span className="font-bold text-ink-primary block text-lg">Add New Address</span>
                                        <span className="text-sm text-ink-muted mt-1 block">Enter a new delivery location manually</span>
                                    </div>
                                    <div className="ml-auto mt-2">
                                        <ChevronRight size={20} className="text-gray-300 group-hover:text-mediloon-500 transition-colors" />
                                    </div>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* STEP 3: CONFIRMATION */}
                    {step === 'confirm' && (
                        <div className="animate-fade-in-up mb-24">
                            <div className="bg-white rounded-3xl p-6 shadow-soft-sm border border-gray-100 mb-4">
                                <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-3">Deliver To</h3>
                                <div className="flex items-start gap-3">
                                    <MapPin size={20} className="text-mediloon-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-ink-primary">{addressMode === 'default' ? 'Home' : 'Other Address'}</p>
                                        <p className="text-sm text-ink-muted leading-relaxed">{finalAddress}</p>
                                        <button onClick={() => setStep('address')} className="text-xs text-mediloon-600 font-bold mt-2 hover:underline">Change</button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl p-6 shadow-soft-sm border border-gray-100 mb-6">
                                <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-3">Payment</h3>
                                <div className="flex items-center gap-3">
                                    <CreditCard size={20} className="text-gray-400" />
                                    <span className="text-sm font-medium text-ink-primary">Cash on Delivery</span>
                                </div>
                            </div>

                            <OrderTotals subtotal={subtotal} tax={tax} shipping={shipping} total={total} />
                        </div>
                    )}

                </div>
            </main>

            {/* Bottom Floating Bar for Confirmation */}
            {step === 'confirm' && (
                <div className="bg-white border-t border-gray-100 p-4 md:p-6 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] safe-pb">
                    <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                        <div>
                            <p className="text-xs text-ink-muted uppercase tracking-wider font-bold">Total</p>
                            <p className="text-2xl font-brand font-black text-mediloon-600">₹{total.toFixed(2)}</p>
                        </div>
                        <button
                            onClick={handlePlaceOrder}
                            disabled={isProcessing}
                            className="flex-1 max-w-xs py-4 rounded-xl bg-gradient-to-r from-mediloon-500 to-mediloon-600 text-white font-brand font-bold text-lg shadow-lg flex items-center justify-center gap-2 hover:shadow-mediloon-300 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? <span className="animate-pulse">Processing...</span> : <>Place Order <Check size={20} /></>}
                        </button>
                    </div>
                </div>
            )}

            {/* Manual Address Popup (Modal) */}
            {showAddressPopup && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl animate-scale-in relative">
                        <button
                            onClick={() => setShowAddressPopup(false)}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="font-brand font-bold text-xl mb-4 text-ink-primary">Enter Address</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-ink-secondary mb-1.5">Full Address</label>
                                <textarea
                                    value={manualAddress}
                                    onChange={(e) => setManualAddress(e.target.value)}
                                    placeholder="Flat No, Building, Street, Area, City, Pincode"
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:border-mediloon-500 focus:ring-2 focus:ring-mediloon-200 outline-none transition-all h-32 resize-none text-sm placeholder:text-gray-400"
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleManualAddressSave}
                                disabled={manualAddress.length < 5}
                                className="w-full py-3.5 bg-mediloon-600 text-white rounded-xl font-bold font-brand hover:bg-mediloon-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-mediloon-200"
                            >
                                Save & Proceed
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function OrderTotals({ subtotal, tax, shipping, total }) {
    return (
        <div className="bg-white rounded-3xl p-6 shadow-soft-sm border border-gray-100 space-y-2">
            <div className="flex justify-between text-sm text-ink-muted">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-ink-muted">
                <span>Tax</span>
                <span>₹{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-ink-muted">
                <span>Shipping</span>
                <span className="text-emerald-600 font-medium">{shipping === 0 ? 'Free' : `₹${shipping}`}</span>
            </div>
            <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between text-lg font-brand font-bold text-ink-primary">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
            </div>
        </div>
    );
}
