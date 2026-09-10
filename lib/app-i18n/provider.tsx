"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  APP_LOCALE_COOKIE,
  APP_LOCALE_STORAGE_KEY,
  coerceAppLocale,
  DEFAULT_APP_LOCALE,
  type AppLocale,
} from "@/lib/app-i18n/types";

type AppI18nContextValue = {
  locale: AppLocale;
  isZh: boolean;
  setLocale: (locale: AppLocale) => void;
  toggleLocale: () => void;
};

const AppI18nContext = createContext<AppI18nContextValue>({
  locale: DEFAULT_APP_LOCALE,
  isZh: true,
  setLocale: () => {},
  toggleLocale: () => {},
});

function persistLocale(locale: AppLocale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.cookie = `${APP_LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function AppI18nProvider({
  children,
  initialLocale = DEFAULT_APP_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    const savedLocale = coerceAppLocale(
      typeof window !== "undefined"
        ? window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)
        : initialLocale,
    );
    setLocaleState(savedLocale);
    persistLocale(savedLocale);
  }, [initialLocale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    persistLocale(nextLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((current) => {
      const next = current === "zh" ? "en" : "zh";
      persistLocale(next);
      return next;
    });
  }, []);

  const value = useMemo<AppI18nContextValue>(
    () => ({
      locale,
      isZh: locale === "zh",
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  );

  return <AppI18nContext.Provider value={value}>{children}</AppI18nContext.Provider>;
}

export function useAppI18n() {
  return useContext(AppI18nContext);
}
