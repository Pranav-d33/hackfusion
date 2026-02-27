import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function PrescriptionModal({
    isOpen,
    onClose,
    mode = 'upload',
    isVoiceMode = false
}) {
    const { t, dir } = useLanguage();

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 z-[60] flex items-center ${isVoiceMode ? 'justify-end pr-8 bg-black/10' : 'justify-center backdrop-blur-md bg-black/40'} animate-fade-in`}>
            <div className={`rounded-3xl p-8 max-w-md text-center shadow-glass-lg m-4 relative overflow-hidden ${isVoiceMode ? 'bg-[#0D0D1A] border border-gray-800 animate-slide-in-right' : 'bg-white animate-scale-in'
                }`} dir={dir}>
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-mediloon-400 via-mediloon-600 to-mediloon-400" />
                <div className="w-16 h-16 bg-gradient-to-br from-mediloon-500 to-mediloon-700 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-mediloon-200">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h2 className={`text-2xl font-brand font-extrabold mb-2 ${isVoiceMode ? 'text-gray-100' : 'text-ink-primary'
                    }`}>
                    {mode === 'replace' ? t('replacePrescription') : t('uploadPrescription')}
                </h2>
                <p className={`font-body text-sm mb-6 leading-relaxed ${isVoiceMode ? 'text-gray-400' : 'text-ink-muted'
                    }`}>
                    {mode === 'replace'
                        ? t('replacePrescriptionDesc')
                        : t('uploadPrescriptionDesc')}
                </p>
                <button
                    onClick={() => {
                        onClose();
                        document.getElementById('prescription-upload-input')?.click();
                    }}
                    className={`btn-primary w-full mb-3 flex items-center justify-center gap-2 ${isVoiceMode ? 'bg-mediloon-600 hover:bg-mediloon-500' : ''
                        }`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {t('chooseFile')}
                </button>
                <button
                    onClick={onClose}
                    className={`text-sm font-brand font-medium transition-colors ${isVoiceMode ? 'text-gray-500 hover:text-gray-300' : 'text-ink-faint hover:text-ink-secondary'
                        }`}
                >
                    {t('maybeLater')}
                </button>
            </div>
        </div>
    );
}
