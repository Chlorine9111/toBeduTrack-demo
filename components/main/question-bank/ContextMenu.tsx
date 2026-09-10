"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type ContextMenuItem = {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [handleClickOutside, onClose]);

  // Adjust position so menu doesn't overflow viewport
  const MENU_MIN_WIDTH = 200;
  const MENU_ITEM_HEIGHT = 36;
  const MENU_PADDING = 16;

  const style: React.CSSProperties = {
    position: "fixed",
    left:
      typeof window !== "undefined"
        ? Math.min(x, window.innerWidth - MENU_MIN_WIDTH)
        : x,
    top:
      typeof window !== "undefined"
        ? Math.min(
            y,
            window.innerHeight - items.length * MENU_ITEM_HEIGHT - MENU_PADDING,
          )
        : y,
    zIndex: 9999,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors",
            item.danger
              ? "text-rose-600 hover:bg-rose-50"
              : "text-slate-700 hover:bg-slate-50",
            item.disabled && "cursor-not-allowed opacity-40",
          )}
        >
          {item.icon ? (
            <span className="flex h-4 w-4 items-center justify-center">
              {item.icon}
            </span>
          ) : null}
          {item.label}
        </button>
      ))}
    </div>
  );
}
