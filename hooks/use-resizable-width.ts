"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseResizableWidthOptions {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

interface ResizableWidthState {
  width: number;
  isDragging: boolean;
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
    className: string;
  };
}

export function useResizableWidth(
  options: UseResizableWidthOptions = {},
): ResizableWidthState {
  const {
    defaultWidth = 280,
    minWidth = 220,
    maxWidth = 480,
    storageKey = "deskmate-resizable-width",
  } = options;

  const [width, setWidth] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = Number(saved);
      if (!Number.isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
        setWidth(parsed);
      }
    }
  }, [storageKey, minWidth, maxWidth]);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      draggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setIsDragging(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [width],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.round(
        Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta)),
      );
      setWidth(next);
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setWidth((current) => {
        localStorage.setItem(storageKey, String(current));
        return current;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [minWidth, maxWidth, storageKey]);

  const handleProps = {
    onMouseDown,
    style: {
      cursor: "col-resize" as const,
    },
    className:
      "absolute right-0 top-0 z-10 h-full w-[3px] shrink-0 bg-transparent transition-colors duration-150 hover:bg-foreground/10 active:bg-foreground/15",
  };

  return { width, isDragging, handleProps };
}
