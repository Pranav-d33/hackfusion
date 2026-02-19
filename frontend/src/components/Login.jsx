import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../firebase/firebaseClient';

export default function Login({ onLogin, onCancel }) {
    const [isRegister, setIsRegister] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        phone: ''
    });

    const ensureFirebaseAuth = async () => {
        if (!auth) {
            throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* variables to your Vite environment.');
        }
        if (isRegister) {
            const credential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            if (formData.name) {
                await updateProfile(credential.user, { displayName: formData.name });
            }
            return credential.user;
        }
        return (await signInWithEmailAndPassword(auth, formData.email, formData.password)).user;
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await ensureFirebaseAuth();
            const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
            const body = { email: formData.email, password: formData.password };
            if (isRegister) {
                body.name = formData.name;
                body.phone = formData.phone;
            }
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Authentication failed');
            onLogin(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const inputClasses = "w-full px-4 py-3 border-2 border-surface-fog rounded-2xl font-body text-ink-primary placeholder:text-ink-ghost focus:ring-2 focus:ring-mediloon-100 focus:border-mediloon-400 outline-none transition-all duration-200 bg-white";

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-glass-lg animate-scale-in">
                {/* Red accent bar */}
                <div className="h-1.5 bg-gradient-to-r from-mediloon-400 via-mediloon-600 to-mediloon-400" />

                {/* Header */}
                <div className="px-8 pt-8 pb-2 text-center">
                    {/* Brand mark */}
                    <div className="w-14 h-14 bg-gradient-to-br from-mediloon-500 to-mediloon-700 rounded-2xl flex items-center justify-center shadow-lg shadow-mediloon-200 mx-auto mb-4">
                        <span className="text-white font-brand font-black text-2xl">M</span>
                    </div>
                    <h2 className="text-2xl font-brand font-extrabold text-ink-primary">
                        {isRegister ? 'Create Account' : 'Welcome Back'}
                    </h2>
                    <p className="text-sm text-ink-muted mt-1 font-body">
                        {isRegister ? 'Join Mediloon to start ordering' : 'Sign in to your Mediloon account'}
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
                        <div className="mb-4 bg-mediloon-50 text-mediloon-600 p-3 rounded-xl text-sm font-body flex items-center gap-2 border border-mediloon-200 animate-slide-down">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isRegister && (
                            <>
                                <div>
                                    <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">Full Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        required
                                        value={formData.name}
                                        onChange={handleChange}
                                        className={inputClasses}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">Phone (Optional)</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className={inputClasses}
                                        placeholder="+91 98765 43210"
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">Email Address</label>
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
                            <label className="block text-sm font-brand font-semibold text-ink-secondary mb-1.5">Password</label>
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
                                    Processing...
                                </span>
                            ) : (
                                isRegister ? 'Create Account' : 'Sign In'
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-ink-muted font-body">
                        {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                        <button
                            onClick={() => setIsRegister(!isRegister)}
                            className="font-brand font-bold text-mediloon-600 hover:text-mediloon-700 hover:underline transition-colors"
                        >
                            {isRegister ? 'Sign in' : 'Create one'}
                        </button>
                    </div>
                    <p className="mt-4 text-[10px] uppercase tracking-[0.15em] text-ink-ghost text-center font-brand">
                        Secured by Firebase Auth
                    </p>
                </div>
            </div>
        </div>
    );
}
