"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/app/lib/i18n/LocaleProvider";

export type DemoLanguage = "th" | "en";

type DemoLanguageContextValue = {
  language: DemoLanguage;
  setLanguage: (language: DemoLanguage) => void;
  text: (thai: string, english: string) => string;
};

const DemoLanguageContext = createContext<DemoLanguageContextValue | null>(null);
const STORAGE_KEY = "staymaint-demo-language";

export function DemoLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<DemoLanguage>("th");
  const { setLocale } = useLocale();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "th" || saved === "en") {
      setLanguageState(saved);
      setLocale(saved);
    } else {
      setLocale("th");
    }
  }, [setLocale]);

  const setLanguage = useCallback((nextLanguage: DemoLanguage) => {
    setLanguageState(nextLanguage);
    setLocale(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  }, [setLocale]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const text = useCallback((thai: string, english: string) => language === "th" ? thai : english, [language]);
  const value = useMemo(() => ({ language, setLanguage, text }), [language, setLanguage, text]);

  return <DemoLanguageContext.Provider value={value}>{children}</DemoLanguageContext.Provider>;
}

export function useDemoLanguage() {
  const context = useContext(DemoLanguageContext);
  if (!context) throw new Error("useDemoLanguage must be used inside DemoLanguageProvider");
  return context;
}
