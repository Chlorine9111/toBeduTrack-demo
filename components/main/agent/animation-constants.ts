import { useCallback, useEffect, useRef, useState } from "react";

/* ── Duration tokens (ms) ── */
export const DURATION_FAST = 150;
export const DURATION_NORMAL = 200;
export const DURATION_SLOW = 250;
export const DURATION_PANEL = 240;

/* ── Easing curves ── */
export const EASING_DEFAULT = "cubic-bezier(0.16, 1, 0.3, 1)"; // ease-out
export const EASING_IN = "cubic-bezier(0.4, 0, 1, 1)";

/* ── prefers-reduced-motion hook ── */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return reduced;
}

/* ── will-change lifecycle hook ── */
export function useWillChange(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  properties = "transform, opacity",
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (active) {
      el.style.willChange = properties;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      // Remove will-change 200ms after animation ends to free GPU memory
      timeoutRef.current = setTimeout(() => {
        el.style.willChange = "auto";
        timeoutRef.current = null;
      }, 200);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [active, properties, ref]);
}

/* ── Duration resolver (respects reduced motion) ── */
export function resolveMs(ms: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : ms;
}

/* ── Inline transition style builder ── */
export function buildTransitionStyle(
  properties: string,
  durationMs: number,
  easing = EASING_DEFAULT,
): React.CSSProperties {
  return {
    transition: `${properties} ${durationMs}ms ${easing}`,
  };
}

/* ── Is-scrolled-to-bottom hook (used by Phase 2) ── */
export function useIsScrolledToBottom(
  scrollRef: React.RefObject<HTMLElement | null>,
  threshold = 40,
) {
  const [atBottom, setAtBottom] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setAtBottom(isAtBottom);
  }, [scrollRef, threshold]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, [scrollRef, checkScroll]);

  return atBottom;
}
