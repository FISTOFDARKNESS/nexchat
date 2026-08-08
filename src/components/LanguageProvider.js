'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getLanguageFromCountry } from '@/lib/i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    try {
      return localStorage.getItem('nexchat_lang') || 'en';
    } catch (e) { return 'en'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('nexchat_lang', lang);
    } catch (e) {}
  }, [lang]);

  const setLanguageFromCountry = useCallback((country) => {
    const newLang = getLanguageFromCountry(country);
    setLang(newLang);
  }, []);

  const value = { lang, setLang, setLanguageFromCountry };
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
