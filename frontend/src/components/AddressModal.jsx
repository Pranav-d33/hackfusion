import React, { useState, useEffect } from 'react';

export default function AddressModal({ isOpen, onClose, onConfirm, cart, user }) {
    const [mode, setMode] = useState('default'); // 'default' | 'manual'
    const [formData, setFormData] = useState({
        fullName: '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        pincode: '',
        landmark: '',
    });
    const [errors, setErrors] = useState({});

    // Build default address from user profile
    const defaultAddress = user
        ? [user.address, user.city, user.state, user.postal_code].filter(Boolean).join(', ')
        : '';
    const hasDefaultAddress = defaultAddress.length > 5;

    // Pre-fill form with user data when opening
    useEffect(() => {
        if (isOpen && user) {
            setFormData(prev => ({
                ...prev,
                fullName: prev.fullName || user.name || '',
                phone: prev.phone || user.phone || '',
            }));
            // If user has no saved address, default to manual
            if (!hasDefaultAddress) setMode('manual');
        }
    }, [isOpen, user, hasDefaultAddress]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
        if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
        if (!formData.addressLine1.trim()) newErrors.addressLine1 = 'Address line 1 is required';
        if (!formData.city.trim()) newErrors.city = 'City is required';
        if (!formData.state.trim()) newErrors.state = 'State is required';
        if (!formData.pincode.trim()) newErrors.pincode = 'Pincode is required';
        else if (!/^\d{5,6}$/.test(formData.pincode.trim())) newErrors.pincode = 'Enter a valid 5-6 digit pincode';
        if (formData.phone.trim() && !/^[\d\s+\-()]{7,15}$/.test(formData.phone.trim())) newErrors.phone = 'Enter a valid phone number';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const canConfirm = mode === 'default' ? hasDefaultAddress : true;

    const handleConfirm = () => {
        if (mode === 'default') {
            if (!hasDefaultAddress) return;
            const addr = `${user.name}, ${defaultAddress}`;
            onConfirm(addr);
        } else {
            if (!validateForm()) return;
            const addr = [
                formData.fullName,
                formData.phone,
                formData.addressLine1,
                formData.addressLine2,
                formData.city,
                formData.state,
                formData.pincode,
                formData.landmark ? `Landmark: ${formData.landmark}` : '',
            ].filter(Boolean).join(', ');
            onConfirm(addr);
        }
    };

    const inputClasses = (field) =>
        `w-full px-3 py-2.5 border-2 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all ${
            errors[field]
                ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-100'
                : 'border-gray-200 focus:border-red-400 focus:ring-2 focus:ring-red-100'
        }`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 flex-shrink-0">
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

                {/* Body — scrollable */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* Default Address Option */}
                    {hasDefaultAddress && (
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
                                    <p className="font-semibold text-gray-800 text-sm">Saved Address</p>
                                    <p className="text-sm text-gray-500 mt-1">{user?.name} — {defaultAddress}</p>
                                </div>
                            </div>
                        </button>
                    )}

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
                                <p className="font-semibold text-gray-800 text-sm">Enter New Address</p>
                                <p className="text-xs text-gray-400 mt-0.5">Fill in your delivery details carefully</p>
                            </div>
                        </div>
                    </button>

                    {/* Manual Address Form */}
                    {mode === 'manual' && (
                        <div className="space-y-3 animate-fade-in-up bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            {/* Name & Phone Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={formData.fullName}
                                        onChange={handleChange}
                                        placeholder="John Doe"
                                        className={inputClasses('fullName')}
                                    />
                                    {errors.fullName && <p className="text-xs text-red-500 mt-0.5">{errors.fullName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number *</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        placeholder="+91 98765 43210"
                                        className={inputClasses('phone')}
                                    />
                                    {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
                                </div>
                            </div>

                            {/* Address Line 1 */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 1 *</label>
                                <input
                                    type="text"
                                    name="addressLine1"
                                    value={formData.addressLine1}
                                    onChange={handleChange}
                                    placeholder="House/Flat No., Building, Street"
                                    className={inputClasses('addressLine1')}
                                    autoFocus
                                />
                                {errors.addressLine1 && <p className="text-xs text-red-500 mt-0.5">{errors.addressLine1}</p>}
                            </div>

                            {/* Address Line 2 */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 2</label>
                                <input
                                    type="text"
                                    name="addressLine2"
                                    value={formData.addressLine2}
                                    onChange={handleChange}
                                    placeholder="Area, Colony, Locality (optional)"
                                    className={inputClasses('addressLine2')}
                                />
                            </div>

                            {/* City & State Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">City *</label>
                                    <input
                                        type="text"
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        placeholder="Bangalore"
                                        className={inputClasses('city')}
                                    />
                                    {errors.city && <p className="text-xs text-red-500 mt-0.5">{errors.city}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">State *</label>
                                    <input
                                        type="text"
                                        name="state"
                                        value={formData.state}
                                        onChange={handleChange}
                                        placeholder="Karnataka"
                                        className={inputClasses('state')}
                                    />
                                    {errors.state && <p className="text-xs text-red-500 mt-0.5">{errors.state}</p>}
                                </div>
                            </div>

                            {/* Pincode & Landmark Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Pincode *</label>
                                    <input
                                        type="text"
                                        name="pincode"
                                        value={formData.pincode}
                                        onChange={handleChange}
                                        placeholder="560095"
                                        maxLength={6}
                                        className={inputClasses('pincode')}
                                    />
                                    {errors.pincode && <p className="text-xs text-red-500 mt-0.5">{errors.pincode}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Landmark</label>
                                    <input
                                        type="text"
                                        name="landmark"
                                        value={formData.landmark}
                                        onChange={handleChange}
                                        placeholder="Near park, temple, etc."
                                        className={inputClasses('landmark')}
                                    />
                                </div>
                            </div>
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
                <div className="p-5 border-t border-gray-100 bg-gray-50 flex-shrink-0">
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
