import React, { useEffect, useState } from 'react';
import { ShoppingBag, Trash2, FileText, X } from 'lucide-react';

const API_BASE = '/api';

export default function Cart({ cart, sessionId, onRemove, onCheckout, onClear, onCartUpdate }) {
    const items = cart?.items || [];
    const [animateBadge, setAnimateBadge] = useState(false);
    const [loadingId, setLoadingId] = useState(null);

    // Trigger animation when item count increases
    useEffect(() => {
        if (items.length > 0) {
            setAnimateBadge(true);
            const timer = setTimeout(() => setAnimateBadge(false), 400);
            return () => clearTimeout(timer);
        }
    }, [cart?.item_count]);

    const hasItems = items.length > 0;

    const handleQuantityChange = async (cartItemId, newQty) => {
        if (newQty < 1 || !sessionId) return;
        setLoadingId(cartItemId);
        try {
            const res = await fetch(`${API_BASE}/cart/${sessionId}/item/${cartItemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: newQty }),
            });
            if (res.ok && onCartUpdate) {
                const updatedCart = await res.json();
                onCartUpdate(updatedCart);
            }
        } catch (err) {
            console.error('Failed to update quantity:', err);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col h-full max-h-[600px]">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-white to-gray-50">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="p-2 bg-red-50 text-red-500 rounded-lg">
                            <div className="p-2 bg-red-50 text-red-500 rounded-lg">
                                <ShoppingBag size={24} />
                            </div>
                        </div>
                        {hasItems && (
                            <span className={`
                                absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold 
                                w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm
                                ${animateBadge ? 'animate-cart-pop' : ''}
                            `}>
                                {items.length}
                            </span>
                        )}
                    </div>
                    <h2 className="font-bold text-gray-800">Your Cart</h2>
                </div>
                {hasItems && (
                    <button onClick={onClear} className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors">
                        Clear
                    </button>
                )}
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!hasItems ? (
                    <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-center">
                        <ShoppingBag size={48} className="mb-2 opacity-20" />
                        <p className="text-sm">Your cart is empty</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <div key={item.cart_item_id} className={`group flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-red-100 hover:bg-red-50/30 transition-all duration-200 animate-fade-in-up ${loadingId === item.cart_item_id ? 'opacity-60' : ''}`}>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-800 text-sm">{item.brand_name}</h4>
                                <p className="text-xs text-gray-500">{item.generic_name} &bull; {item.dosage}</p>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    {/* Quantity +/- Controls */}
                                    <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                                        <button
                                            onClick={() => handleQuantityChange(item.cart_item_id, item.quantity - 1)}
                                            disabled={item.quantity <= 1 || loadingId === item.cart_item_id}
                                            className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded-l-lg transition-all ${item.quantity <= 1
                                                ? 'text-gray-300 cursor-not-allowed'
                                                : 'text-gray-500 hover:bg-red-100 hover:text-red-600'
                                                }`}
                                        >
                                            -
                                        </button>
                                        <span className="w-7 text-center text-xs font-bold text-gray-800">{item.quantity}</span>
                                        <button
                                            onClick={() => handleQuantityChange(item.cart_item_id, item.quantity + 1)}
                                            disabled={loadingId === item.cart_item_id}
                                            className="w-6 h-6 flex items-center justify-center text-xs font-bold rounded-r-lg text-gray-500 hover:bg-red-100 hover:text-red-600 transition-all"
                                        >
                                            +
                                        </button>
                                    </div>
                                    {item.rx_required && (
                                        <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                            <FileText size={10} />
                                            RX
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className="text-sm font-bold text-gray-900">&#8377;{(item.price * item.quantity).toFixed(2)}</span>
                                <span className="text-[10px] text-gray-400">&#8377;{item.price}/unit</span>
                                <button
                                    onClick={() => onRemove(item.cart_item_id)}
                                    className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer & Summary */}
            {hasItems && (
                <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-3">
                    <div className="space-y-1 py-1">
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Subtotal</span>
                            <span>&#8377;{cart.subtotal?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Tax (10%)</span>
                            <span>&#8377;{cart.tax?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Shipping</span>
                            <span>{cart.shipping === 0 ? <span className="text-green-600 font-medium">Free</span> : `₹${cart.shipping?.toFixed(2)}`}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-200 mt-2">
                            <span>Total</span>
                            <span>&#8377;{cart.total?.toFixed(2)}</span>
                        </div>
                    </div>
                    <button
                        onClick={onCheckout}
                        className="w-full py-3.5 bg-gradient-to-r from-red-500 to-rose-600 text-white font-bold rounded-xl shadow-lg shadow-red-200 hover:shadow-red-300 transform active:scale-[0.98] transition-all"
                    >
                        Checkout
                    </button>
                </div>
            )}
        </div>
    );
}
