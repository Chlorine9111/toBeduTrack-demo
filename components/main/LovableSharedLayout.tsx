"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { isPblUiEnabled } from "@/lib/pbl/feature";
import { cn } from "@/lib/utils";
import AppSidebar from "./AppSidebar";

const SIDEBAR_HIDDEN_STORAGE_KEY = "deskmate:main-sidebar-hidden";
const SIDEBAR_EDGE_EXIT_MS = 360;
const SIDEBAR_EDGE_REVEAL_THRESHOLD = 24;
const SIDEBAR_EDGE_HIDE_THRESHOLD = 96;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

export default function LovableSharedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isZh } = useAppI18n();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarHidden, setDesktopSidebarHidden] = useState(false);
  const [desktopSidebarEdgeMounted, setDesktopSidebarEdgeMounted] = useState(false);
  const [desktopSidebarEdgeVisible, setDesktopSidebarEdgeVisible] = useState(false);
  const [desktopSidebarEdgeLeaving, setDesktopSidebarEdgeLeaving] = useState(false);

  const currentSectionLabel = useMemo(() => {
    if (
      isPblUiEnabled() &&
      (pathname.startsWith("/main/library") || pathname.startsWith("/main/content-assets")) &&
      searchParams.get("type") === "pbl"
    ) {
      return isZh ? "PBL 项目" : "PBL Projects";
    }
    if (
      pathname.startsWith("/main/library") ||
      pathname.startsWith("/main/content-assets")
    ) {
      return isZh ? "内容库" : "Library";
    }
    if (pathname.startsWith("/main/question-bank")) return isZh ? "题库" : "Question Bank";
    if (isPblUiEnabled() && pathname.startsWith("/main/pbl")) return isZh ? "PBL 项目" : "PBL Projects";
    if (pathname.startsWith("/main/wechat-editor")) return isZh ? "公众号编辑器" : "WeChat Editor";
    if (pathname.startsWith("/main/settings")) return isZh ? "设置" : "Settings";
    return isZh ? "对话" : "Chat";
  }, [pathname, searchParams, isZh]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SIDEBAR_HIDDEN_STORAGE_KEY);
    setDesktopSidebarHidden(stored === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_HIDDEN_STORAGE_KEY, desktopSidebarHidden ? "1" : "0");
  }, [desktopSidebarHidden]);

  useEffect(() => {
    if (desktopSidebarHidden) {
      setDesktopSidebarEdgeMounted(true);
      return;
    }

    setDesktopSidebarEdgeVisible(false);
    setDesktopSidebarEdgeLeaving(true);
    const exitTimer = window.setTimeout(() => {
      setDesktopSidebarEdgeMounted(false);
      setDesktopSidebarEdgeLeaving(false);
    }, SIDEBAR_EDGE_EXIT_MS);
    return () => window.clearTimeout(exitTimer);
  }, [desktopSidebarHidden]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!desktopSidebarHidden || window.innerWidth < 768) {
        setDesktopSidebarEdgeVisible(false);
        setDesktopSidebarEdgeLeaving(false);
        return;
      }
      setDesktopSidebarEdgeVisible((current) => {
        const next = current
          ? event.clientX <= SIDEBAR_EDGE_HIDE_THRESHOLD
          : event.clientX <= SIDEBAR_EDGE_REVEAL_THRESHOLD;

        if (next) {
          setDesktopSidebarEdgeLeaving(false);
          return true;
        }

        if (current) {
          setDesktopSidebarEdgeLeaving(true);
          window.setTimeout(() => {
            setDesktopSidebarEdgeLeaving(false);
          }, SIDEBAR_EDGE_EXIT_MS);
        }
        return false;
      });
    };

    const handleWindowBlur = () => {
      setDesktopSidebarEdgeVisible(false);
      setDesktopSidebarEdgeLeaving(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur-sm", handleWindowBlur);
    };
  }, [desktopSidebarHidden]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        window.innerWidth < 768 ||
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDesktopSidebarHidden(true);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setDesktopSidebarHidden(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-[#f8fafb]">
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 md:hidden">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Deskmate
          </p>
          <h1 className="truncate text-base font-semibold text-foreground">
            {currentSectionLabel}
          </h1>
        </div>
        <button
          type="button"
          aria-label={isZh ? "打开导航菜单" : "Open navigation"}
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "w-0 shrink-0 md:transition-[width] md:duration-300 md:ease-out",
            desktopSidebarHidden ? "md:w-0" : "md:w-[220px]",
          )}
        >
          <AppSidebar
            mobileOpen={mobileSidebarOpen}
            onClose={() => setMobileSidebarOpen(false)}
            desktopHidden={desktopSidebarHidden}
            onToggleDesktopHidden={() => setDesktopSidebarHidden((current) => !current)}
          />
        </div>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      {desktopSidebarEdgeMounted ? (
        <div className="pointer-events-none fixed inset-y-0 left-0 z-40 hidden w-24 md:block">
          <button
            type="button"
            onClick={() => setDesktopSidebarHidden(false)}
            aria-label={isZh ? "展开侧边导航" : "Expand sidebar"}
            title={isZh ? "展开侧边导航" : "Expand sidebar"}
            className={cn(
              "pointer-events-auto absolute left-3 top-1/2 inline-flex h-14 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300/90 bg-white/94 text-slate-600 shadow-[0_18px_48px_rgba(15,23,42,0.14)] backdrop-blur-sm will-change-transform transition-[transform,opacity,box-shadow] duration-350 hover:border-default-400 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-foreground/20",
              desktopSidebarHidden && desktopSidebarEdgeVisible
                ? "animate-pulse opacity-100 translate-x-0 scale-100"
                : desktopSidebarEdgeLeaving
                  ? "opacity-100 -translate-x-[160%] scale-95"
                : "pointer-events-none -translate-x-[160%] scale-95 opacity-0",
            )}
            style={{
              ...(desktopSidebarEdgeVisible ? { animationDuration: "4.2s" } : undefined),
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
