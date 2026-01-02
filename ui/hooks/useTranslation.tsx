import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';

interface LanguageContextType {
  t: (key: string, args?: Record<string, any>) => string;
  lang: Language;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('shopify-base-app-lang') as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('shopify-base-app-lang', lang);
    // Dispatch a custom event so non-React parts (if any) know language changed
    window.dispatchEvent(new Event('languageChanged'));
  }, [lang]);

  const t = useCallback((key: string, args?: Record<string, any>): string => {
    // @ts-ignore
    let translation = TRANSLATIONS[lang]?.[key];
    if (!translation) return key;

    if (args) {
      Object.entries(args).forEach(([k, v]) => {
        translation = translation.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }
    return translation;
  }, [lang]);

  const value = { t, lang, setLang };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}