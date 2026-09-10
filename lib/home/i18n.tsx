"use client";

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { type Locale, type HomeTranslations, EN, ZH } from "./translations";

interface HomeI18nContextValue {
  readonly locale: Locale;
  readonly t: HomeTranslations;
  readonly toggleLocale: () => void;
}

const HomeI18nContext = createContext<HomeI18nContextValue>({
  locale: "en",
  t: EN,
  toggleLocale: () => {},
});

export function HomeI18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === "en" ? "zh" : "en"));
  }, []);

  const value = useMemo(
    () => ({
      locale,
      t: locale === "en" ? EN : ZH,
      toggleLocale,
    }),
    [locale, toggleLocale]
  );

  return (
    <HomeI18nContext.Provider value={value}>{children}</HomeI18nContext.Provider>
  );
}

export function useHomeI18n() {
  return useContext(HomeI18nContext);
}
