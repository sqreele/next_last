'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** What the user picked. */
  theme: ThemePreference;
  /** What's actually rendered right now (`system` resolves to light/dark). */
  resolved: 'light' | 'dark';
  setTheme: (next: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'pcms-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  // Keep the browser chrome theme-color in sync so iOS Safari / PWA standalone
  // don't flash the wrong background on push/install.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#ffffff');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Hydrate from localStorage and apply class.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    const initial: ThemePreference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setThemeState(initial);
    const next = initial === 'system' ? getSystemTheme() : initial;
    setResolved(next);
    applyClass(next);
  }, []);

  // React to system theme changes only when the user opted into `system`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      const next = event.matches ? 'dark' : 'light';
      setResolved(next);
      applyClass(next);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    const resolvedNext = next === 'system' ? getSystemTheme() : next;
    setResolved(resolvedNext);
    applyClass(resolvedNext);
  }, []);

  const toggle = useCallback(() => {
    // 2-step toggle: light <-> dark; never lands back on `system`.
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback so non-provider callers (e.g. during SSR before hydration)
    // don't crash — they get a no-op API.
    return {
      theme: 'system',
      resolved: 'light',
      setTheme: () => undefined,
      toggle: () => undefined,
    };
  }
  return ctx;
}
