export const APP_LOCALE_STORAGE_KEY = "deskmate-locale";
export const APP_LOCALE_COOKIE = "deskmate-locale";
export const DEFAULT_APP_LOCALE = "zh";

export type AppLocale = "zh" | "en";

export function coerceAppLocale(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "zh";
}
