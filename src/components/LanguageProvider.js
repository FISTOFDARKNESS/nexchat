'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

  const value = { lang, setLang };
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
