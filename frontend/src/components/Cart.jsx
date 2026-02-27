import React, { useEffect, useState } from 'react';
import { ShoppingBag, Trash2, FileText, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const API_BASE = '/api';

export default function Cart({ cart, sessionId, onRemove, onCheckout, onClear, onCartUpdate }) {
    const { t } = useLanguage();
    const items = cart?.items || [];
    const [animateBadge, setAnimateBadge] = useState(false);
    const [loadingId, setLoadingId] = useState(null);

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
        <div className="glass-card-solid overflow-hidden flex flex-col h-full max-h-full transition-all duration-300 hover:shadow-lift-lg">
            {/* Header with red accent stripe */}
            <div className="relative">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-mediloon-400 via-mediloon-600 to-mediloon-400" />
                <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-10 h-10 bg-mediloon-50 text-mediloon-500 rounded-xl flex items-center justify-center border border-mediloon-100">
                                <ShoppingBag size={20} />
                            </div>
                            {hasItems && (
                                <span className={`
                                    absolute -top-2 -right-2 bg-gradient-to-br from-mediloon-500 to-mediloon-700 text-white text-[10px] font-brand font-bold 
                                    w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm
                                    ${animateBadge ? 'animate-cart-pop' : ''}
                                `}>
                                    {items.length}
                                </span>
                            )}
                        </div>
                        <h2 className="font-brand font-bold text-ink-primary">{t('yourCart')}</h2>
                    </div>
                    {hasItems && (
                        <button onClick={onClear} className="text-xs font-brand font-semibold text-ink-faint hover:text-mediloon-500 transition-all duration-200 active:scale-95">
                            {t('clearAll')}
                        </button>
                    )}
                </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2.5">
                {!hasItems ? (
                    <div className="h-36 flex flex-col items-center justify-center text-ink-ghost text-center py-8">
                        <div className="w-14 h-14 bg-surface-cloud rounded-2xl flex items-center justify-center mb-3">
                            <ShoppingBag size={24} className="text-ink-ghost" />
                        </div>
                        <p className="text-sm font-body text-ink-faint">{t('cartEmpty')}</p>
                        <p className="text-xs text-ink-ghost mt-1">{t('addViaChatOrSearch')}</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <div key={item.cart_item_id} className={`group flex items-center justify-between p-3 rounded-xl border border-surface-fog hover:border-mediloon-200 hover:shadow-sm bg-white transition-all duration-200 ${loadingId === item.cart_item_id ? 'opacity-60' : ''}`}>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-brand font-semibold text-ink-primary text-sm">{item.brand_name}</h4>
                                <p className="text-xs text-ink-muted font-body">{item.generic_name} &bull; {item.dosage}</p>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    {/* Quantity Controls */}
                                    <div className="flex items-center bg-surface-snow rounded-lg border border-surface-fog">
                                        <button
                                            onClick={() => handleQuantityChange(item.cart_item_id, item.quantity - 1)}
                                            disabled={item.quantity <= 1 || loadingId === item.cart_item_id}
                                            className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded-l-lg transition-all duration-200 ${item.quantity <= 1
                                                ? 'text-ink-ghost cursor-not-allowed'
                                                : 'text-ink-muted hover:bg-mediloon-100 hover:text-mediloon-600 active:scale-90'
                                                }`}
                                        >
                                            -
                                        </button>
                                        <span className="w-7 text-center text-xs font-brand font-bold text-ink-primary">{item.quantity}</span>
                                        <button
                                            onClick={() => handleQuantityChange(item.cart_item_id, item.quantity + 1)}
                                            disabled={loadingId === item.cart_item_id}
                                            className="w-6 h-6 flex items-center justify-center text-xs font-bold rounded-r-lg text-ink-muted hover:bg-mediloon-100 hover:text-mediloon-600 transition-all duration-200 active:scale-90"
                                        >
                                            +
                                        </button>
                                    </div>
                                    {item.rx_required && (
                                        <span className="rx-badge rx-required">
                                            <FileText size={10} />
                                            RX
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className="text-sm font-brand font-bold text-ink-primary">€{(item.price * item.quantity).toFixed(2)}</span>
                                <span className="text-[10px] text-ink-faint font-mono">€{item.price}/{t('unit')}</span>
                                <button
                                    onClick={() => onRemove(item.cart_item_id)}
                                    className="p-1 text-ink-ghost hover:text-mediloon-500 rounded transition-all duration-200 hover:scale-110 active:scale-95"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer & Summary */}
            {hasItems && (
                <div className="p-4 bg-surface-snow border-t border-surface-fog space-y-3">
                    <div className="space-y-1 py-1">
                        <div className="flex justify-between text-xs text-ink-muted font-body">
                            <span>{t('subtotal')}</span>
                            <span>€{cart.subtotal?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-ink-muted font-body">
                            <span>{t('tax')}</span>
                            <span>€{cart.tax?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-ink-muted font-body">
                            <span>{t('shipping')}</span>
                            <span>{cart.shipping === 0 ? <span className="text-accent-emerald font-brand font-semibold">{t('free')}</span> : `€${cart.shipping?.toFixed(2)}`}</span>
                        </div>
                        <div className="flex justify-between text-sm font-brand font-bold text-ink-primary pt-2 border-t border-surface-fog mt-2">
                            <span>{t('total')}</span>
                            <span className="text-mediloon-600">€{cart.total?.toFixed(2)}</span>
                        </div>
                    </div>
                    <button
                        onClick={onCheckout}
                        className="btn-primary w-full text-center"
                    >
                        {t('checkout')}
                    </button>
                </div>
            )}
        </div>
    );
}
