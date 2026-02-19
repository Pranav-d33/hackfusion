/**
 * ResultsList — Medication candidate cards with visual hierarchy
 */
import React from 'react';

export default function ResultsList({ candidates, onSelect, selectedId, onFlyToCart }) {
    if (!candidates || candidates.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2.5">
            <h3 className="text-xs font-brand font-semibold text-ink-faint uppercase tracking-wider">
                Available Medications
            </h3>
            <div className="grid gap-2">
                {candidates.map((med, index) => (
                    <button
                        key={med.id || index}
                        onClick={(e) => {
                            if (onFlyToCart) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                onFlyToCart(rect);
                            }
                            onSelect(med, index + 1);
                        }}
                        className={`
                            med-card w-full text-left p-4 rounded-2xl border-2 transition-all duration-200
                            ${selectedId === med.id
                                ? 'border-mediloon-500 bg-mediloon-50 shadow-glow-red-sm'
                                : 'border-surface-fog bg-white hover:border-mediloon-200'
                            }
                        `}
                        style={{ animationDelay: `${index * 80}ms` }}
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                {/* Brand name */}
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-brand font-bold text-ink-primary">
                                        {med.brand_name}
                                    </span>
                                    {med.rx_required ? (
                                        <span className="rx-badge rx-required">RX</span>
                                    ) : (
                                        <span className="rx-badge rx-otc">OTC</span>
                                    )}
                                </div>

                                {/* Generic name and dosage */}
                                <p className="text-sm text-ink-muted mt-0.5 font-body">
                                    {med.generic_name} • {med.dosage}
                                </p>

                                {/* Form */}
                                <p className="text-xs text-ink-faint mt-1 capitalize font-body">
                                    {med.form}
                                </p>
                            </div>

                            {/* Stock indicator */}
                            <div className="text-right flex flex-col items-end gap-1">
                                {med.stock_quantity > 0 ? (
                                    <span className="feature-badge-emerald">
                                        <span className="w-1.5 h-1.5 bg-accent-emerald rounded-full" />
                                        In Stock
                                    </span>
                                ) : (
                                    <span className="feature-badge bg-red-50 text-mediloon-600 border border-mediloon-200">
                                        <span className="w-1.5 h-1.5 bg-mediloon-500 rounded-full" />
                                        Out of Stock
                                    </span>
                                )}
                                {med.similarity && (
                                    <p className="text-[10px] text-ink-faint mt-1 font-mono">
                                        Match: {Math.round(med.similarity * 100)}%
                                    </p>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
