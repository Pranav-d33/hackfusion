import React, { useState } from 'react';
import { ShoppingBag, X, FileText, Trash2 } from 'lucide-react';

const API_BASE = '/api';

export default function CartDetailModal({ isOpen, onClose, cart, sessionId, onCartUpdate, onCheckout }) {
    const [loadingId, setLoadingId] = useState(null);

    if (!isOpen) return null;

    const items = cart?.items || [];
    const hasItems = items.length > 0;

    const handleQuantityChange = async (cartItemId, newQty) => {
        if (newQty < 1) return; // Use remove button instead
        setLoadingId(cartItemId);
        try {
            const res = await fetch(`${API_BASE}/cart/${sessionId}/item/${cartItemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: newQty }),
            });
            if (res.ok) {
                const updatedCart = await res.json();
                onCartUpdate(updatedCart);
            }
        } catch (err) {
            console.error('Failed to update quantity:', err);
        } finally {
            setLoadingId(null);
        }
    };

    const handleRemove = async (cartItemId) => {
        setLoadingId(cartItemId);
        try {
            const res = await fetch(`${API_BASE}/cart/${sessionId}/item/${cartItemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: 0 }),
            });
            if (res.ok) {
                const updatedCart = await res.json();
                onCartUpdate(updatedCart);
            }
        } catch (err) {
            console.error('Failed to remove item:', err);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up" style={{ maxHeight: '85vh' }}>
                {/* Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-50 text-red-500 rounded-xl">
                            <ShoppingBag size={20} />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800 text-lg">Your Cart</h2>
                            <p className="text-xs text-gray-400">{items.length} item(s)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Items */}
                <div className="overflow-y-auto p-5 space-y-3" style={{ maxHeight: 'calc(85vh - 240px)' }}>
                    {!hasItems ? (
                        <div className="text-center py-12 text-gray-400">
                            <ShoppingBag size={64} className="mx-auto mb-3 opacity-20" />
                            <p className="font-medium">Your cart is empty</p>
                            <p className="text-sm mt-1">Search or ask through voice to add medicines</p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div
                                key={item.cart_item_id}
                                className={`flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-red-100 transition-all duration-200 ${loadingId === item.cart_item_id ? 'opacity-60' : ''
                                    }`}
                            >
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-semibold text-gray-800">{item.brand_name}</h4>
                                        {item.rx_required && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded flex items-center gap-0.5">
                                                <FileText size={12} />
                                                RX
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500">{item.generic_name} &bull; {item.dosage}</p>
                                    {item.dose && item.dose !== 'As Prescribed' && (
                                        <p className="text-xs text-blue-600 mt-0.5">Dose: {item.dose}</p>
                                    )}
                                    <p className="text-xs text-gray-400 mt-0.5">&#8377;{item.price}/unit</p>
                                </div>

                                {/* Quantity Controls */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleQuantityChange(item.cart_item_id, item.quantity - 1)}
                                        disabled={item.quantity <= 1 || loadingId === item.cart_item_id}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all ${item.quantity <= 1
                                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                            : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600'
                                            }`}
                                    >
                                        -
                                    </button>
                                    <span className="w-10 text-center font-bold text-gray-800">{item.quantity}</span>
                                    <button
                                        onClick={() => handleQuantityChange(item.cart_item_id, item.quantity + 1)}
                                        disabled={loadingId === item.cart_item_id}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-all"
                                    >
                                        +
                                    </button>
                                </div>

                                {/* Price & Remove */}
                                <div className="flex flex-col items-end gap-1 ml-2">
                                    <span className="text-sm font-bold text-gray-900">&#8377;{(item.price * item.quantity).toFixed(2)}</span>
                                    <button
                                        onClick={() => handleRemove(item.cart_item_id)}
                                        disabled={loadingId === item.cart_item_id}
                                        className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Summary */}
                {hasItems && (
                    <div className="p-5 bg-gray-50 border-t border-gray-100 space-y-3">
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>Subtotal</span>
                                <span>&#8377;{cart.subtotal?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>Tax (10%)</span>
                                <span>&#8377;{cart.tax?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>Shipping</span>
                                <span>{cart.shipping === 0 ? <span className="text-green-600 font-medium">Free</span> : `₹${cart.shipping?.toFixed(2)}`}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200 mt-2">
                                <span>Total</span>
                                <span>&#8377;{cart.total?.toFixed(2)}</span>
                            </div>
                        </div>
                        <button
                            onClick={onCheckout}
                            className="w-full py-3.5 bg-gradient-to-r from-red-500 to-rose-600 text-white font-bold rounded-xl shadow-lg shadow-red-200 hover:shadow-red-300 transform active:scale-[0.98] transition-all"
                        >
                            Proceed to Checkout
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
