/**
 * Cart - Shopping cart component with animations
 */
import React, { useEffect, useState } from 'react';

export default function Cart({ cart, onRemove, onCheckout, onClear }) {
    const items = cart?.items || [];
    const [animatingItems, setAnimatingItems] = useState(new Set());
    const [prevItemCount, setPrevItemCount] = useState(0);

    // Track new items for animation
    useEffect(() => {
        if (items.length > prevItemCount) {
            // New item added - animate the latest one
            const newItemIds = items.map(i => i.cart_item_id);
            setAnimatingItems(new Set(newItemIds.slice(-1)));
            setTimeout(() => setAnimatingItems(new Set()), 300);
        }
        setPrevItemCount(items.length);
    }, [items.length]);

    if (items.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="flex flex-col items-center justify-center text-gray-400 py-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-6 h-6"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium">Your cart is empty</span>
                    <span className="text-xs mt-1">Add medicines to get started</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-lg animate-fade-in-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-50 to-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <div className="relative">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-5 h-5 text-mediloon-red"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                        {items.length > 0 && (
                            <span className="cart-badge">{items.length}</span>
                        )}
                    </div>
                    <span>Cart</span>
                </h3>
                <button
                    onClick={onClear}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                >
                    Clear all
                </button>
            </div>

            {/* Items */}
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {items.map((item, index) => (
                    <div
                        key={item.cart_item_id}
                        className={`p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors ${animatingItems.has(item.cart_item_id) ? 'animate-cart-item' : ''
                            }`}
                        style={{ animationDelay: `${index * 50}ms` }}
                    >
                        <div className="flex-1">
                            <p className="font-medium text-gray-900 text-sm">{item.brand_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {item.generic_name} • {item.dosage}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                    Qty: {item.quantity}
                                </span>
                                {item.rx_required && (
                                    <span className="rx-badge rx-required">RX</span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => onRemove(item.cart_item_id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            aria-label="Remove item"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>

            {/* Checkout button */}
            <div className="p-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
                <button
                    onClick={onCheckout}
                    className="w-full py-3 px-4 bg-gradient-to-r from-mediloon-red to-red-600 text-white font-semibold rounded-xl btn-primary shadow-lg shadow-red-200/50 hover:shadow-xl hover:shadow-red-300/50"
                >
                    Proceed to Checkout
                </button>
            </div>
        </div>
    );
}
