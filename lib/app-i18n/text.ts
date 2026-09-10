import type { AppLocale } from "@/lib/app-i18n/types";

export type LocalizedText = {
  zh: string;
  en: string;
};

export function pickLocalizedText(locale: AppLocale, value: LocalizedText | string) {
  if (typeof value === "string") {
    return value;
  }
  return locale === "en" ? value.en : value.zh;
}

export function getLocaleTag(locale: AppLocale) {
  return locale === "en" ? "en-US" : "zh-CN";
}

export function formatLocaleDateTime(
  locale: AppLocale,
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleString(getLocaleTag(locale), options);
}

export function formatLocaleDate(
  locale: AppLocale,
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(getLocaleTag(locale), options);
}

export function formatLocaleTime(
  locale: AppLocale,
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(getLocaleTag(locale), options);
}
