"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Toolbar } from "@heroui/react";
import {
  Database,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  MessageSquareText,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import IconSidebar from "./IconSidebar";
import FeedbackLauncher from "@/components/main/feedback/FeedbackLauncher";
import { SidebarTour } from "@/components/product-tour";
import type { ShellIconKey, ShellNavItem } from "@/components/shells/navigation";

const SearchModal = dynamic(() => import("./SearchModal"), {
  loading: () => null,
});

const MOBILE_ICON_MAP: Record<ShellIconKey, React.ElementType> = {
  plus: Plus,
  "folder-open": FolderOpen,
  database: Database,
  "message-square-text": MessageSquareText,
  "file-text": FileText,
  "graduation-cap": GraduationCap,
  "layout-dashboard": LayoutDashboard,
};

type ProductShellChromeProps = {
  children: React.ReactNode;
  navigation: ShellNavItem[];
  mobileNavigation: ShellNavItem[];
  actorLabel: { zh: string; en: string } | null;
  showQuota: boolean;
};

export default function ProductShellChrome({
  children,
  navigation,
  mobileNavigation,
  actorLabel,
  showQuota,
}: ProductShellChromeProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-(--bg-page)">
      <div className="hidden md:block">
        <Suspense>
          <IconSidebar
            navigation={navigation}
            actorLabel={actorLabel}
            showQuota={showQuota}
            onSearchClick={handleSearchClick}
          />
        </Suspense>
      </div>

      <Toolbar
        aria-label="Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-around border-t border-divider bg-(--bg-page) pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {mobileNavigation.map((tab) => {
          const TabIcon = MOBILE_ICON_MAP[tab.icon];
          const active =
            pathname === tab.href ||
            pathname.startsWith(`${tab.href}/`) ||
            (tab.href === "/main/agent" && (pathname === "/main" || pathname.startsWith("/main/agent")));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1",
                active ? "text-foreground" : "text-default-400",
              )}
            >
              <TabIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium">
                {tab.label.zh}
              </span>
            </Link>
          );
        })}
        <Button
          variant="ghost"
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-default-400"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">More</span>
        </Button>
      </Toolbar>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-14 md:ml-[56px] md:pb-0">
        {children}
      </main>

      <SidebarTour />
      <FeedbackLauncher />

      {searchOpen ? (
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      ) : null}
    </div>
  );
}
