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
            const response = await fetch(`/api/auth/me?session_token=${encodeURIComponent(sessionToken)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
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
        <div className={`fixed inset-0 z-50 flex items-center ${isVoiceMode ? 'justify-end pr-8 bg-black/10' : 'justify-center p-4 bg-black/50'}`}>
            <div className={`bg-white rounded-2xl w-full ${isVoiceMode ? 'max-w-md animate-slide-in-right' : 'max-w-2xl animate-scale-in'} overflow-hidden shadow-xl max-h-[90vh] overflow-y-auto`} dir={dir}>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{t('completeYourProfile')}</h2>
                        <p className="text-sm text-gray-500">{t('helpUsServeBetterOptional')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
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
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5 text-mediloon-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {t('personalInformation')}
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('fullName')}</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                        placeholder={t('fullNamePlaceholder')}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('phoneNumber')}</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                        placeholder={t('phonePlaceholder')}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('age')}</label>
                                    <input
                                        type="number"
                                        name="age"
                                        min="1"
                                        max="150"
                                        value={formData.age}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                        placeholder="25"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('gender')}</label>
                                    <select
                                        name="gender"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
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
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5 text-mediloon-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {t('deliveryAddressOptional')}
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('streetAddress')}</label>
                                    <input
                                        type="text"
                                        name="address"
                                        value={formData.address}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                        placeholder={t('addressLine1Placeholder')}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('city')}</label>
                                        <input
                                            type="text"
                                            name="city"
                                            value={formData.city}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                            placeholder={t('cityPlaceholder')}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('stateRegion')}</label>
                                        <input
                                            type="text"
                                            name="state"
                                            value={formData.state}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                            placeholder={t('statePlaceholder')}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('postalCode')}</label>
                                        <input
                                            type="text"
                                            name="postal_code"
                                            value={formData.postal_code}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                            placeholder={t('pincodePlaceholder')}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('country')}</label>
                                        <input
                                            type="text"
                                            name="country"
                                            value={formData.country}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mediloon-red focus:border-transparent outline-none transition-all"
                                            placeholder={t('country')}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className={`flex-1 py-3 rounded-lg font-bold text-white transition-all transform active:scale-95 ${loading
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-mediloon-red hover:bg-red-700 shadow-lg hover:shadow-xl'
                                    }`}
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                                className="flex-1 py-3 rounded-lg font-bold border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-all transform active:scale-95"
                            >
                                {t('skipForNow')}
                            </button>
                        </div>
                    </form>

                    <p className="text-xs text-gray-400 text-center mt-4">
                        {t('updateProfileAnytime')}
                    </p>
                </div>
            </div>
        </div>
    );
}
