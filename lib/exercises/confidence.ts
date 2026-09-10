export function normalizeSubskillConfidence(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;

  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, Number(normalized.toFixed(3))));
}
