'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getLanguageFromCountry } from '@/lib/i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    try {
      return localStorage.getItem('nexchat_lang') || 'en';
    } catch (e) { return 'en'; }
  });

  const setLang = (newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem('nexchat_lang', newLang);
    } catch (e) {}
  };

  const setLanguageFromCountry = (country) => {
    const newLang = getLanguageFromCountry(country);
    setLangState(newLang);
    
  };

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
