"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HOVER_DELAY_MS = 200;

export function useConversationOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const handleTriggerEnter = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      setIsOpen(true);
      hoverTimerRef.current = null;
    }, HOVER_DELAY_MS);
  }, [clearHoverTimer]);

  const handleTriggerLeave = useCallback(() => {
    clearHoverTimer();
  }, [clearHoverTimer]);

  // Keyboard shortcuts: Cmd+B / Ctrl+B toggle, Escape close
  // Use ref to avoid re-registering listener on every isOpen change
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;

      if (e.key === "Escape" && isOpenRef.current) {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (e.key === "b" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    handleTriggerEnter,
    handleTriggerLeave,
  };
}
