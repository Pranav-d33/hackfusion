import React, { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function AddressModal({ isOpen, onClose, onConfirm, cart, user, isVoiceMode }) {
    const { t, dir } = useLanguage();
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
        if (!formData.fullName.trim()) newErrors.fullName = t('fullNameRequired');
        if (!formData.phone.trim()) newErrors.phone = t('phoneRequired');
        if (!formData.addressLine1.trim()) newErrors.addressLine1 = t('addressLine1Required');
        if (!formData.city.trim()) newErrors.city = t('cityRequired');
        if (!formData.state.trim()) newErrors.state = t('stateRequired');
        if (!formData.pincode.trim()) newErrors.pincode = t('pincodeRequired');
        else if (!/^\d{5,6}$/.test(formData.pincode.trim())) newErrors.pincode = t('validPincode');
        if (formData.phone.trim() && !/^[\d\s+\-()]{7,15}$/.test(formData.phone.trim())) newErrors.phone = t('validPhone');
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
                formData.landmark ? `${t('landmarkPrefix')}: ${formData.landmark}` : '',
            ].filter(Boolean).join(', ');
            onConfirm(addr);
        }
    };

    const inputClasses = (field) =>
        `w-full px-3 py-2.5 border-2 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all ${errors[field]
            ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-100'
            : 'border-gray-200 focus:border-red-400 focus:ring-2 focus:ring-red-100'
        }`;

    return (
        <div className={`fixed inset-0 z-[100] flex ${isVoiceMode ? 'items-end md:items-center justify-end p-0 md:p-4 md:pr-6' : 'items-end md:items-center justify-center p-0 md:px-4'}`}>
            {/* Backdrop */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${isVoiceMode ? 'bg-black/20 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm'}`} onClick={onClose} />

            {/* Bottom Sheet Modal */}
            <div className={`relative w-full ${isVoiceMode ? 'md:max-w-md animate-slide-up-spring md:animate-slide-in-right h-[85vh] md:h-[calc(100vh-2rem)] md:my-4 rounded-t-[2rem] md:rounded-[2rem]' : 'md:max-w-lg animate-slide-up-spring md:animate-fade-in-up h-[90vh] md:h-auto md:max-h-[90vh] rounded-t-[2rem] md:rounded-[2rem]'} bg-white shadow-apple-2xl overflow-hidden flex flex-col will-change-transform`} dir={dir}>

                {/* iOS Sheet Drag Handle (Mobile Only) */}
                <div className="w-full flex justify-center pt-3 pb-1 md:hidden absolute top-0 z-10 bg-white/80 backdrop-blur-md">
                    <div className="w-12 h-1.5 bg-black/15 rounded-full" />
                </div>

                {/* Header */}
                <div className="pt-8 md:pt-6 pb-4 px-6 border-b border-black/[0.04] bg-white/95 backdrop-blur-xl flex-shrink-0 z-0">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <h2 className="font-brand font-bold text-ink-primary text-[22px] tracking-[-0.01em]">{t('deliveryAddress')}</h2>
                            <p className="text-[13px] font-body text-ink-secondary mt-0.5">{t('whereDeliverOrder')}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 bg-surface-snow hover:bg-surface-fog text-ink-secondary rounded-full transition-colors hidden md:block" // Hidden on mobile where you'd just swipe down
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body — scrollable */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-surface-snow/30">
                    {hasDefaultAddress && (
                        <button
                            onClick={() => setMode('default')}
                            className={`w-full text-left p-5 rounded-[1.25rem] border transition-all duration-300 shadow-sm ${mode === 'default'
                                ? 'border-accent-sapphire bg-accent-sapphire-light/20 shadow-apple-md'
                                : 'border-black/[0.06] bg-white hover:border-black/[0.12] hover:shadow-apple-md'
                                }`}
                        >
                            <div className="flex items-start gap-3.5">
                                <div className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${mode === 'default' ? 'border-accent-sapphire' : 'border-ink-faint'
                                    }`}>
                                    {mode === 'default' && <div className="w-2.5 h-2.5 rounded-full bg-accent-sapphire" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-brand font-semibold text-ink-primary text-[15px]">{t('savedAddress')}</p>
                                    <p className="text-[13px] font-body text-ink-secondary mt-1 leading-relaxed">{user?.name} — {defaultAddress}</p>
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
                                <p className="font-semibold text-gray-800 text-sm">{t('enterNewAddress')}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{t('fillDeliveryDetails')}</p>
                            </div>
                        </div>
                    </button>

                    {mode === 'manual' && (
                        <div className="space-y-4 animate-fade-in-up bg-white rounded-[1.25rem] p-5 border border-black/[0.06] shadow-sm">
                            {/* Name & Phone Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{t('fullName')} *</label>
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={formData.fullName}
                                        onChange={handleChange}
                                        placeholder={t('fullNamePlaceholder')}
                                        className={inputClasses('fullName')}
                                    />
                                    {errors.fullName && <p className="text-xs text-red-500 mt-0.5">{errors.fullName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{t('phoneNumber')} *</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        placeholder={t('phonePlaceholder')}
                                        className={inputClasses('phone')}
                                    />
                                    {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
                                </div>
                            </div>

                            {/* Address Line 1 */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('addressLine1')} *</label>
                                <input
                                    type="text"
                                    name="addressLine1"
                                    value={formData.addressLine1}
                                    onChange={handleChange}
                                    placeholder={t('addressLine1Placeholder')}
                                    className={inputClasses('addressLine1')}
                                    autoFocus
                                />
                                {errors.addressLine1 && <p className="text-xs text-red-500 mt-0.5">{errors.addressLine1}</p>}
                            </div>

                            {/* Address Line 2 */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('addressLine2')}</label>
                                <input
                                    type="text"
                                    name="addressLine2"
                                    value={formData.addressLine2}
                                    onChange={handleChange}
                                    placeholder={t('addressLine2Placeholder')}
                                    className={inputClasses('addressLine2')}
                                />
                            </div>

                            {/* City & State Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{t('city')} *</label>
                                    <input
                                        type="text"
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        placeholder={t('cityPlaceholder')}
                                        className={inputClasses('city')}
                                    />
                                    {errors.city && <p className="text-xs text-red-500 mt-0.5">{errors.city}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{t('state')} *</label>
                                    <input
                                        type="text"
                                        name="state"
                                        value={formData.state}
                                        onChange={handleChange}
                                        placeholder={t('statePlaceholder')}
                                        className={inputClasses('state')}
                                    />
                                    {errors.state && <p className="text-xs text-red-500 mt-0.5">{errors.state}</p>}
                                </div>
                            </div>

                            {/* Pincode & Landmark Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{t('pincode')} *</label>
                                    <input
                                        type="text"
                                        name="pincode"
                                        value={formData.pincode}
                                        onChange={handleChange}
                                        placeholder={t('pincodePlaceholder')}
                                        maxLength={6}
                                        className={inputClasses('pincode')}
                                    />
                                    {errors.pincode && <p className="text-xs text-red-500 mt-0.5">{errors.pincode}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{t('landmark')}</label>
                                    <input
                                        type="text"
                                        name="landmark"
                                        value={formData.landmark}
                                        onChange={handleChange}
                                        placeholder={t('landmarkPlaceholder')}
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
                                <span>{cart.item_count} {(cart.item_count === 1 ? t('item') : t('items'))}</span>
                                <span className="font-semibold text-gray-800">€{cart.total?.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {cart.items.slice(0, 3).map((item, i) => (
                                    <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600">
                                        {item.brand_name}
                                    </span>
                                ))}
                                {cart.items.length > 3 && (
                                    <span className="text-[10px] text-gray-400">+{cart.items.length - 3} {t('more')}</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 md:p-6 border-t border-black/[0.04] bg-white/95 backdrop-blur-xl flex-shrink-0 pb-8 md:pb-6">
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className={`w-full py-4 rounded-[1.25rem] font-brand font-bold text-[15px] transition-all duration-300 ${canConfirm
                            ? 'bg-indigo-600 text-white shadow-apple hover:shadow-apple-lg hover:bg-indigo-700 active:scale-[0.98]'
                            : 'bg-surface-fog text-ink-faint cursor-not-allowed'
                            }`}
                    >
                        {t('confirmPlaceOrder')}
                    </button>
                </div>
            </div>
        </div >
    );
}
