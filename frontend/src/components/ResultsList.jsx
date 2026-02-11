/**
 * ResultsList - List of medication candidates
 */
import React from 'react';

export default function ResultsList({ candidates, onSelect, selectedId, onFlyToCart }) {
    if (!candidates || candidates.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
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
              med-card w-full text-left p-4 rounded-xl border-2 transition-all
              ${selectedId === med.id
                                ? 'border-mediloon-red bg-red-50'
                                : 'border-gray-200 bg-white hover:border-mediloon-red/50'
                            }
            `}
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                {/* Brand name */}
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-semibold text-gray-900">
                                        {med.brand_name}
                                    </span>
                                    {med.rx_required ? (
                                        <span className="rx-badge rx-required">RX</span>
                                    ) : (
                                        <span className="rx-badge rx-otc">OTC</span>
                                    )}
                                </div>

                                {/* Generic name and dosage */}
                                <p className="text-sm text-gray-600 mt-0.5">
                                    {med.generic_name} • {med.dosage}
                                </p>

                                {/* Form */}
                                <p className="text-xs text-gray-400 mt-1 capitalize">
                                    {med.form}
                                </p>
                            </div>

                            {/* Stock indicator */}
                            <div className="text-right">
                                {med.stock_quantity > 0 ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        In Stock
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        Out of Stock
                                    </span>
                                )}
                                {med.similarity && (
                                    <p className="text-xs text-gray-400 mt-1">
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
