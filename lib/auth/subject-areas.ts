import type { AppLocale } from "@/lib/app-i18n/types";

export const OTHER_SUBJECT_AREA_VALUE = "Other";

const OTHER_SUBJECT_AREA_ALIASES = new Set(["other", "general", "其他", "通用"]);

function normalizeSubjectAreaKey(value: string | null | undefined) {
  return `${value ?? ""}`.trim().toLowerCase();
}

export function isOtherSubjectArea(value: string | null | undefined) {
  return OTHER_SUBJECT_AREA_ALIASES.has(normalizeSubjectAreaKey(value));
}

export function normalizeSubjectAreaValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return isOtherSubjectArea(trimmed) ? OTHER_SUBJECT_AREA_VALUE : trimmed;
}

export function normalizeSubjectAreaList(values: string[]) {
  const deduped = new Map<string, string>();

  for (const rawValue of values) {
    const normalizedValue = normalizeSubjectAreaValue(rawValue);
    if (!normalizedValue) continue;
    const dedupeKey = normalizeSubjectAreaKey(normalizedValue);
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, normalizedValue);
    }
  }

  return Array.from(deduped.values()).slice(0, 10);
}

export function getSubjectAreaLabel(value: string, locale: AppLocale = "zh") {
  const normalizedValue = normalizeSubjectAreaValue(value);
  if (normalizedValue === OTHER_SUBJECT_AREA_VALUE) {
    return locale === "zh" ? "其他" : "Other";
  }
  return normalizedValue;
}
