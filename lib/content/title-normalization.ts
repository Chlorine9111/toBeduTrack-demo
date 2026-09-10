function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

const STREAMING_TITLE_SUFFIX = /\s*[（(](?:生成中|streaming)[）)]\s*$/iu;

export function normalizeGeneratedContentTitle(value: string | null | undefined) {
  const normalized = cleanText(value);
  if (!normalized) return "";

  const stripped = normalized.replace(STREAMING_TITLE_SUFFIX, "").trim();
  return stripped || normalized;
}
