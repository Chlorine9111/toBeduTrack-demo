import type { ProductTourState } from "./types";

const STORAGE_KEY = "deskmate-product-tour-state";

export function readTourStateFromLocal(): ProductTourState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeTourStateToLocal(state: ProductTourState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function clearTourStateLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
