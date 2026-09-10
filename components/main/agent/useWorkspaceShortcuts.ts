"use client";

import { useEffect, useRef } from "react";
import type { PresetMode } from "./useResizablePanel";

type ShortcutHandlers = {
  toggleConversation?: () => void;
  setCanvasMode?: (mode: PresetMode) => void;
  toggleHelp?: () => void;
  closeOverlays?: () => void;
};

/**
 * 统一的工作区快捷键注册 hook。
 *
 * ⌘B 已在 useConversationOverlay 中处理，此处不重复注册。
 * ⌘K 已在 ProductShell 中处理（搜索）。
 *
 * 使用 ref 存储 handlers，避免每次渲染都重新注册 listener。
 */
export function useWorkspaceShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;

      const isMod = e.metaKey || e.ctrlKey;
      const h = handlersRef.current;

      // ⌘Shift+1 → Focus 模式
      if (isMod && e.shiftKey && e.key === "1") {
        if (h.setCanvasMode) {
          e.preventDefault();
          h.setCanvasMode("focus");
        }
        return;
      }

      // ⌘Shift+2 → Split 模式
      if (isMod && e.shiftKey && e.key === "2") {
        if (h.setCanvasMode) {
          e.preventDefault();
          h.setCanvasMode("split");
        }
        return;
      }

      // ⌘Shift+3 → Canvas 模式
      if (isMod && e.shiftKey && e.key === "3") {
        if (h.setCanvasMode) {
          e.preventDefault();
          h.setCanvasMode("canvas");
        }
        return;
      }

      // ⌘Shift+/ (即 ⌘?) → 帮助面板
      if (isMod && e.shiftKey && e.key === "/") {
        e.preventDefault();
        h.toggleHelp?.();
        return;
      }

      // Escape → 按优先级关闭 overlay
      if (e.key === "Escape") {
        e.preventDefault();
        h.closeOverlays?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // 只注册一次，通过 ref 读取最新 handlers
}
