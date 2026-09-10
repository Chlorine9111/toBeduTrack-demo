"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

type Rect = { top: number; left: number; width: number; height: number };

const EMPTY_RECT: Rect = { top: 0, left: 0, width: 0, height: 0 };
const PADDING = 6;
const BORDER_RADIUS = 8;

type SpotlightOverlayProps = {
  targetSelector: string;
  isVisible: boolean;
  onBackdropClick?: () => void;
};

export default function SpotlightOverlay({
  targetSelector,
  isVisible,
  onBackdropClick,
}: SpotlightOverlayProps) {
  const [rect, setRect] = useState<Rect>(EMPTY_RECT);

  useLayoutEffect(() => {
    if (!isVisible) return;

    const update = () => {
      const el = document.querySelector(targetSelector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect((prev) => {
        if (
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
        )
          return prev;
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
    };

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(update);
    });

    const observer = new ResizeObserver(update);
    const el = document.querySelector(targetSelector);
    if (el) observer.observe(el);

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    const interval = setInterval(update, 200);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      clearInterval(interval);
    };
  }, [isVisible, targetSelector]);

  const overlay = (
    <AnimatePresence>
      {isVisible && rect.width > 0 && (
        <>
          <motion.div
            key="spotlight-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
            onClick={onBackdropClick}
            aria-hidden="true"
          />
          <motion.div
            key="spotlight-highlight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed z-50"
            style={{
              top: rect.top - PADDING,
              left: rect.left - PADDING,
              width: rect.width + PADDING * 2,
              height: rect.height + PADDING * 2,
              borderRadius: BORDER_RADIUS,
              boxShadow:
                "0 0 0 2px rgba(94, 106, 210, 0.5), 0 0 0 9999px rgba(0, 0, 0, 0.5)",
            }}
          />
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
