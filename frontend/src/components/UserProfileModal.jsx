import React, { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function UserProfileModal({ user, sessionToken, onUpdate, onSkip, onClose, isVoiceMode }) {
    const { t, dir } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        name: user?.name || '',
        phone: user?.phone || '',
        age: user?.age || '',
        gender: user?.gender || '',
        address: user?.address || '',
        city: user?.city || '',
        state: user?.state || '',
        postal_code: user?.postal_code || '',
        country: user?.country || 'Germany',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    ...formData,
                    age: formData.age ? parseInt(formData.age) : null,
                    profile_completed: true,
                }),
            });

            if (!response.ok) {
                throw new Error(t('sorry'));
            }

            const data = await response.json();
            onUpdate(data);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = () => {
        onSkip();
        onClose();
    };

    return (
        <div className={`fixed inset-0 z-[100] flex ${isVoiceMode ? 'items-end md:items-center justify-end p-0 md:pr-6 bg-black/10' : 'items-end md:items-center justify-center p-0 md:px-4 bg-black/20 backdrop-blur-sm'}`}>
            <div className={`bg-white rounded-t-[2rem] md:rounded-[2rem] w-full ${isVoiceMode ? 'md:max-w-md animate-slide-up-spring md:animate-slide-in-right h-[85vh] md:h-auto md:max-h-[85vh]' : 'md:max-w-2xl animate-slide-up-spring md:animate-scale-in max-h-[90vh]'} overflow-hidden shadow-apple-2xl flex flex-col will-change-transform`} dir={dir}>

                {/* iOS Sheet Drag Handle (Mobile Only) */}
                <div className="w-full flex justify-center pt-3 pb-1 md:hidden absolute top-0 z-20 bg-white/80 backdrop-blur-md">
                    <div className="w-12 h-1.5 bg-black/15 rounded-full" />
                </div>

                <div className="px-6 pt-8 md:pt-6 pb-4 border-b border-black/[0.04] flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xl z-10 flex-shrink-0">
                    <div>
                        <h2 className="text-[22px] font-brand font-bold text-ink-primary tracking-[-0.01em]">{t('completeYourProfile')}</h2>
                        <p className="text-[13px] font-body text-ink-secondary mt-0.5">{t('helpUsServeBetterOptional')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-surface-snow hover:bg-surface-fog text-ink-secondary rounded-full transition-colors hidden md:block"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 bg-surface-snow/30">
                    {error && (
                        <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Personal Information */}
                        <div className="bg-white rounded-[1.25rem] p-5 shadow-soft">
                            <h3 className="font-brand font-semibold text-ink-primary mb-4 flex items-center gap-2">
                                <div className="p-1.5 bg-mediloon-50 text-mediloon-600 rounded-lg">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                {t('personalInformation')}
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('fullName')}</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                        placeholder={t('fullNamePlaceholder')}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('phoneNumber')}</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                        placeholder={t('phonePlaceholder')}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('age')}</label>
                                    <input
                                        type="number"
                                        name="age"
                                        min="1"
                                        max="150"
                                        value={formData.age}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                        placeholder="25"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('gender')}</label>
                                    <select
                                        name="gender"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                    >
                                        <option value="">{t('selectGender')}</option>
                                        <option value="male">{t('male')}</option>
                                        <option value="female">{t('female')}</option>
                                        <option value="other">{t('other')}</option>
                                        <option value="prefer_not_to_say">{t('preferNotToSay')}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Address Information */}
                        <div className="bg-white rounded-[1.25rem] p-5 shadow-soft mt-5">
                            <h3 className="font-brand font-semibold text-ink-primary mb-4 flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                {t('deliveryAddressOptional')}
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('streetAddress')}</label>
                                    <input
                                        type="text"
                                        name="address"
                                        value={formData.address}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                        placeholder={t('addressLine1Placeholder')}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('city')}</label>
                                        <input
                                            type="text"
                                            name="city"
                                            value={formData.city}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                            placeholder={t('cityPlaceholder')}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('stateRegion')}</label>
                                        <input
                                            type="text"
                                            name="state"
                                            value={formData.state}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                            placeholder={t('statePlaceholder')}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('postalCode')}</label>
                                        <input
                                            type="text"
                                            name="postal_code"
                                            value={formData.postal_code}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                            placeholder={t('pincodePlaceholder')}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[13px] font-brand font-semibold text-ink-secondary mb-1.5">{t('country')}</label>
                                        <input
                                            type="text"
                                            name="country"
                                            value={formData.country}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover"
                                            placeholder={t('country')}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3 pt-6 pb-6 md:pb-0">
                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-4 rounded-[1.25rem] font-brand font-bold text-[15px] transition-all duration-300 ${loading
                                    ? 'bg-surface-fog text-ink-faint cursor-not-allowed'
                                    : 'bg-mediloon-600 text-white shadow-apple hover:shadow-apple-lg hover:bg-mediloon-700 active:scale-[0.98]'
                                    }`}
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('saving')}
                                    </span>
                                ) : (
                                    t('saveProfile')
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={handleSkip}
                                disabled={loading}
                                className="w-full py-3.5 rounded-[1.25rem] font-brand font-semibold text-ink-secondary hover:bg-surface-fog transition-colors active:scale-[0.98]"
                            >
                                {t('skipForNow')}
                            </button>
                        </div>
                    </form>

                    <p className="text-[12px] font-body text-ink-muted text-center mt-4">
                        {t('updateProfileAnytime')}
                    </p>
                </div>
            </div>
        </div>
    );
}
