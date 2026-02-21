/**
 * LanguageContext — Global language state for Mediloon UI
 * Provides `lang`, `setLang`, `t()`, and `dir` to all components
 */
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { getLangKey, getLangBCP47, getDirection, createT } from './translations';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'mediloon_ui_lang';

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    // Restore from localStorage, default to 'en'
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['en', 'de', 'ar', 'hi'].includes(stored)) return stored;
    }
    return 'en';
  });

  const setLang = useCallback((code) => {
    const key = getLangKey(code);
    setLangState(key);
    localStorage.setItem(STORAGE_KEY, key);
  }, []);

  const t = useMemo(() => createT(lang), [lang]);
  const dir = useMemo(() => getDirection(lang), [lang]);
  const bcp47 = useMemo(() => getLangBCP47(lang), [lang]);

  // Update document dir and lang attributes
  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }, [dir, lang]);

  const value = useMemo(() => ({ lang, setLang, t, dir, bcp47 }), [lang, setLang, t, dir, bcp47]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export default LanguageContext;
