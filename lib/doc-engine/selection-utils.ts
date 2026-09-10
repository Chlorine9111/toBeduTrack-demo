export const MIN_MEANINGFUL_SELECTION_CHARS = 2;

export function countMeaningfulSelectionChars(text: string | null | undefined) {
  return `${text ?? ""}`.replace(/\s+/g, "").length;
}

export function hasMeaningfulSelectionText(
  text: string | null | undefined,
  minChars = MIN_MEANINGFUL_SELECTION_CHARS,
) {
  return countMeaningfulSelectionChars(text) >= minChars;
}
