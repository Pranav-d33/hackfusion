import React, { useEffect, useState } from 'react';

export default function CheckoutAnimation({ isOpen, order, onClose }) {
    const [phase, setPhase] = useState(0); // 0: enter, 1: show, 2: exit

    useEffect(() => {
        if (isOpen) {
            setPhase(0);
            const t1 = setTimeout(() => setPhase(1), 100);
            const t2 = setTimeout(() => {
                setPhase(2);
                setTimeout(onClose, 500);
            }, 5000);
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className={`fixed inset-0 z-[60] flex items-center justify-center transition-all duration-500 ${phase === 2 ? 'opacity-0' : 'opacity-100'
                }`}
            onClick={() => { setPhase(2); setTimeout(onClose, 500); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />

            {/* Confetti particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <div
                        key={i}
                        className="confetti-particle"
                        style={{
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 2}s`,
                            animationDuration: `${2 + Math.random() * 3}s`,
                            backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'][i % 6],
                        }}
                    />
                ))}
            </div>

            {/* Content */}
            <div className={`relative z-10 bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full mx-4 text-center transition-all duration-700 ${phase >= 1 ? 'scale-100 translate-y-0' : 'scale-50 translate-y-10'
                }`}>
                {/* Animated Checkmark */}
                <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className={`absolute inset-0 rounded-full bg-green-100 transition-all duration-700 ${phase >= 1 ? 'scale-100' : 'scale-0'
                        }`} />
                    <svg
                        className={`absolute inset-0 w-24 h-24 text-green-500 transition-all duration-700 delay-300 ${phase >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                            }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                            className={phase >= 1 ? 'checkmark-draw' : ''}
                        />
                    </svg>
                </div>

                <h2 className={`text-2xl font-bold text-gray-900 mb-2 transition-all duration-500 delay-500 ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`}>
                    Order Confirmed!
                </h2>

                {order && (
                    <div className={`transition-all duration-500 delay-700 ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                        }`}>
                        <p className="text-gray-500 mb-4">
                            Your order #{order.order_id || '...'} has been placed successfully
                        </p>
                        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Items</span>
                                <span className="font-semibold text-gray-800">{order.item_count || 0}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Status</span>
                                <span className="font-semibold text-green-600">Confirmed</span>
                            </div>
                            {order.warehouse_status && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Fulfillment</span>
                                    <span className="font-semibold text-blue-600 capitalize">{order.warehouse_status}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <p className={`text-xs text-gray-400 mt-6 transition-all duration-500 delay-1000 ${phase >= 1 ? 'opacity-100' : 'opacity-0'
                    }`}>
                    Tap anywhere to dismiss
                </p>
            </div>
        </div>
    );
}
