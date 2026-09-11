'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
  type DictKey,
  getDictionary,
} from '@/app/lib/i18n/dictionary';
import { interpolateTranslation, resolveClientLocale } from '@/app/lib/i18n/runtime.mjs';

export const LOCALE_STORAGE_KEY = 'pcms-locale';
export const LOCALE_COOKIE_KEY = 'pcms-locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: DictKey, values?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && (SUPPORTED_LOCALES as readonly string[]).includes(value));
}

function detectLocale(initialLocale: Locale): Locale {
  if (typeof window === 'undefined') return initialLocale;
  return resolveClientLocale(
    window.localStorage.getItem(LOCALE_STORAGE_KEY),
    initialLocale,
    SUPPORTED_LOCALES,
  );
}

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const detected = detectLocale(initialLocale);
    setLocaleState(detected);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, detected);
    document.cookie = `${LOCALE_COOKIE_KEY}=${detected}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [initialLocale]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY && isLocale(event.newValue)) {
        setLocaleState(event.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', locale);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      document.cookie = `${LOCALE_COOKIE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
  }, []);

  const dictionary = useMemo(() => getDictionary(locale), [locale]);

  const t = useCallback(
    (key: DictKey, values?: Record<string, string | number>) => {
      const template = dictionary[key] ?? getDictionary(DEFAULT_LOCALE)[key] ?? key;
      return interpolateTranslation(template, values);
    },
    [dictionary],
  );

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
