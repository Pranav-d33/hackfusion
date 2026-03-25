import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/firebaseClient';
import { useLanguage } from '../i18n/LanguageContext';

export default function Login({ onLogin, onCancel }) {
    const { t, dir } = useLanguage();
    const [isRegister, setIsRegister] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        phone: ''
    });
    const normalizedEmail = formData.email.trim().toLowerCase();

    const ensureFirebaseAuth = async () => {
        if (!auth) {
            throw new Error(t('firebaseNotConfigured'));
        }
        if (isRegister) {
            const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, formData.password);
            if (formData.name) {
                await updateProfile(credential.user, { displayName: formData.name });
            }
            return credential.user;
        }
        return (await signInWithEmailAndPassword(auth, normalizedEmail, formData.password)).user;
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError(null);
        setInfo(null);
    };

    const completeBackendAuth = async ({ email, password, isRegisterFlow = false, name, phone }) => {
        const endpoint = isRegisterFlow ? '/api/auth/register' : '/api/auth/login';
        const body = { email, password };
        if (isRegisterFlow) {
            body.name = name;
            body.phone = phone;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const text = await response.text();
        let data = {};
        try {
            if (text) data = JSON.parse(text);
        } catch (e) {
            console.error("JSON parse error:", e, "Response Text:", text);
        }

        if (!response.ok) {
            throw new Error(data.detail || data.message || t('sorry'));
        }

        if (!data.user || !data.session_token) {
            throw new Error(data.message || 'Invalid server response — missing user or session token');
        }

        return data;
    };

    const tryLoginAfterRegisterConflict = async () => {
        // First try Firebase email/password sign-in
        try {
            const existingUser = await signInWithEmailAndPassword(auth, normalizedEmail, formData.password);
            const data = await completeBackendAuth({
                email: (existingUser.user.email || normalizedEmail).toLowerCase(),
                password: formData.password,
                isRegisterFlow: false,
            });
            setIsRegister(false);
            onLogin(data);
            return;
        } catch (firebaseLoginErr) {
            // Firebase sign-in failed — user likely has a Google-only account.
            // Fall through to backend-only login which handles this case.
            console.warn('Firebase sign-in failed during register conflict, trying backend directly:', firebaseLoginErr.code);
        }
        // Backend-only fallback (works for Google-created accounts without a password in Firebase)
        const data = await completeBackendAuth({
            email: normalizedEmail,
            password: formData.password,
            isRegisterFlow: false,
            name: formData.name,
        });
        setIsRegister(false);
        onLogin(data);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setInfo(null);
        try {
            // Step 1: Try Firebase auth
            let firebaseOk = false;
            let firebaseError = null;
            try {
                await ensureFirebaseAuth();
                firebaseOk = true;
            } catch (fbErr) {
                firebaseError = fbErr;
                // Hard errors that should stop immediately
                if (!auth) throw fbErr;
                if (fbErr.code === 'auth/weak-password') throw fbErr;
                if (fbErr.code === 'auth/invalid-email') throw fbErr;

                // Register conflict: email already in use in Firebase
                if (isRegister && fbErr.code === 'auth/email-already-in-use') {
                    await tryLoginAfterRegisterConflict();
                    return;
                }

                // Login failures: user may have signed up via Google only
                // (no email/password credential in Firebase). Fall through to backend.
                if (!isRegister && (
                    fbErr.code === 'auth/invalid-credential' ||
                    fbErr.code === 'auth/user-not-found' ||
                    fbErr.code === 'auth/wrong-password'
                )) {
                    console.warn('Firebase email/password failed, trying backend directly:', fbErr.code);
                    // Fall through to Step 2
                } else if (!isRegister) {
                    throw fbErr; // Unknown Firebase error during login
                } else {
                    throw fbErr; // Unknown Firebase error during register
                }
            }

            // Step 2: Complete backend auth
            const data = await completeBackendAuth({
                email: normalizedEmail,
                password: formData.password,
                isRegisterFlow: firebaseOk && isRegister,
                name: formData.name,
                phone: formData.phone,
            });
            onLogin(data);
        } catch (err) {
            const msg = err.message || '';
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError(t('invalidCredentials'));
            } else if (err.code === 'auth/email-already-in-use') {
                setError(t('emailAlreadyInUse'));
            } else if (err.code === 'auth/weak-password') {
                setError(t('weakPassword'));
            } else {
                setError(msg || t('sorry'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!auth) {
            setError(t('firebaseNotConfigured'));
            return;
        }
        if (!formData.email?.trim()) {
            setError(t('enterEmailForReset'));
            return;
        }
        setLoading(true);
        setError(null);
        setInfo(null);
        try {
            await sendPasswordResetEmail(auth, normalizedEmail);
            setInfo(t('resetPasswordSent'));
        } catch (err) {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
                setError(t('invalidCredentials'));
            } else {
                setError(err.message || t('sorry'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        if (!auth) { setError(t('firebaseNotConfigured')); return; }
        setLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email, name: user.displayName, uid: user.uid, provider: 'google' }),
            });
            const text = await response.text();
            let data = {};
            try {
                if (text) data = JSON.parse(text);
            } catch (e) {
                console.error("JSON parse error:", e, "Response Text:", text);
            }
            if (!response.ok) throw new Error(data.detail || data.message || t('sorry'));
            onLogin(data.ok === false ? { name: user.displayName, email: user.email } : data);
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                setError(err.message || 'Google sign-in failed.');
            }
        } finally {
            setLoading(false);
        }
    };

    const inputClasses = "w-full pl-4 pr-4 py-3.5 bg-white rounded-[1rem] text-[15px] font-brand text-ink-primary placeholder:text-ink-ghost transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-mediloon-500/20 shadow-soft-sm focus:shadow-soft-sm-hover";

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-md mx-auto overflow-hidden shadow-apple-2xl animate-scale-in" dir={dir}>
                {/* Red accent bar */}
                <div className="h-1.5 bg-gradient-to-r from-mediloon-400 via-mediloon-600 to-mediloon-400" />

                {/* Header */}
                <div className="px-8 pt-8 pb-2 text-center">
                    {/* Brand mark */}
                    <div className="w-14 h-14 bg-gradient-to-br from-mediloon-500 to-mediloon-700 rounded-2xl flex items-center justify-center shadow-lg shadow-mediloon-200 mx-auto mb-4">
                        <span className="text-white font-brand font-black text-2xl">M</span>
                    </div>
                    <h2 className="text-2xl font-brand font-extrabold text-ink-primary">
                        {isRegister ? t('createAccount') : t('welcomeBack')}
                    </h2>
                    <p className="text-sm text-ink-muted mt-1 font-body">
                        {isRegister ? t('joinMediloonToOrder') : t('signInToMediloonAccount')}
                    </p>
                </div>

                {/* Close button */}
                <button
                    onClick={onCancel}
                    className="absolute top-6 right-6 text-ink-ghost hover:text-ink-primary transition-colors p-1"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="p-8 pt-4">
                    {error && (
                        <div className="mb-4 bg-mediloon-50 text-mediloon-600 p-3 rounded-xl text-sm font-body flex items-center gap-2 shadow-soft-sm animate-slide-down">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}
                    {info && (
                        <div className="mb-4 bg-green-50 text-green-700 p-3 rounded-xl text-sm font-body shadow-soft-sm animate-slide-down">
                            {info}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isRegister && (
                            <>
                                <div>
                                    <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">{t('fullName')}</label>
                                    <input
                                        type="text"
                                        name="name"
                                        required
                                        value={formData.name}
                                        onChange={handleChange}
                                        className={inputClasses}
                                        placeholder={t('fullNamePlaceholder')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">{t('phoneOptional')}</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className={inputClasses}
                                        placeholder={t('phonePlaceholder')}
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">{t('emailAddress')}</label>
                            <input
                                type="email"
                                name="email"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                className={inputClasses}
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">{t('password')}</label>
                            <input
                                type="password"
                                name="password"
                                required
                                minLength={6}
                                value={formData.password}
                                onChange={handleChange}
                                className={inputClasses}
                                placeholder="••••••••"
                            />
                        </div>
                        {!isRegister && (
                            <div className="text-right -mt-1">
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    disabled={loading}
                                    className="text-xs font-brand font-semibold text-mediloon-600 hover:text-mediloon-700 hover:underline disabled:text-ink-ghost"
                                >
                                    {t('forgotPassword')}
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3.5 rounded-2xl font-brand font-bold text-white transition-all duration-200 active:scale-[0.97] ${loading ? 'bg-ink-ghost cursor-not-allowed' : 'bg-gradient-to-r from-mediloon-500 to-mediloon-700 shadow-lg shadow-mediloon-200 hover:shadow-xl hover:shadow-mediloon-300'
                                }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    {t('processing')}
                                </span>
                            ) : (
                                isRegister ? t('createAccount') : t('signIn')
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-ink-muted font-body">
                        {isRegister ? t('alreadyHaveAccount') : t('dontHaveAccount')}{' '}
                        <button
                            onClick={() => setIsRegister(!isRegister)}
                            className="font-brand font-bold text-mediloon-600 hover:text-mediloon-700 hover:underline transition-colors"
                        >
                            {isRegister ? t('signIn') : t('createOne')}
                        </button>
                    </div>

                    {/* Google sign-in divider */}
                    <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-surface-fog" />
                        <span className="text-[11px] uppercase tracking-widest text-ink-ghost font-brand">or</span>
                        <div className="flex-1 h-px bg-surface-fog" />
                    </div>

                    {/* Google button */}
                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className={`w-full py-3 rounded-2xl font-brand font-semibold flex items-center justify-center gap-3 transition-all duration-300 active:scale-[0.97]
                            ${loading
                                ? 'text-ink-ghost cursor-not-allowed bg-surface-fog/30 shadow-soft-sm'
                                : 'text-ink-primary bg-white shadow-soft hover:shadow-soft-hover hover:bg-gray-50'
                            }`}
                    >
                        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Continue with Google
                    </button>
                    <p className="mt-4 text-[10px] uppercase tracking-[0.15em] text-ink-ghost text-center font-brand">
                        {t('securedByFirebaseAuth')}
                    </p>
                </div>
            </div>
        </div>
    );
}
