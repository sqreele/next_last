'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
  type DictKey,
  getDictionary,
} from '@/app/lib/i18n/dictionary';

const STORAGE_KEY = 'pcms-locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: DictKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  const browser = (navigator.language || DEFAULT_LOCALE).slice(0, 2).toLowerCase();
  if ((SUPPORTED_LOCALES as readonly string[]).includes(browser)) {
    return browser as Locale;
  }
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', locale);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const dictionary = useMemo(() => getDictionary(locale), [locale]);

  const t = useCallback((key: DictKey) => dictionary[key] ?? key, [dictionary]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Safe fallback so consumers outside the provider (e.g. SSR-only paths)
    // still render the English copy without crashing.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => undefined,
      t: (key) => getDictionary(DEFAULT_LOCALE)[key] ?? key,
    };
  }
  return ctx;
}

export function useT() {
  return useLocale().t;
}
