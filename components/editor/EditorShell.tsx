"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import EditorTopNav from "./EditorTopNav";

type Crumb = {
  label: string;
  href?: string;
};

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

type EditorShellProps = {
  breadcrumbs: Crumb[];
  saveStatus?: SaveStatus;
  onShare?: () => void;
  onHistory?: () => void;
  onToggleProperties?: () => void;
  propertiesOpen?: boolean;
  propertiesPanel?: ReactNode;
  children: ReactNode;
};

export default function EditorShell({
  breadcrumbs,
  saveStatus = "saved",
  onShare,
  onHistory,
  onToggleProperties,
  propertiesOpen = false,
  propertiesPanel,
  children,
}: EditorShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      {/* Top navigation */}
      <EditorTopNav
        breadcrumbs={breadcrumbs}
        saveStatus={saveStatus}
        propertiesOpen={propertiesOpen}
        onShare={onShare}
        onHistory={onHistory}
        onToggleProperties={onToggleProperties}
      />

      {/* Editor canvas */}
      <main
        className={cn(
          "flex flex-1 flex-col px-12 pb-32 pt-16",
          propertiesPanel ? "pr-[calc(280px+48px)]" : "",
        )}
      >
        <div className="mx-auto w-full max-w-[720px]">{children}</div>
      </main>

      {/* Right properties panel (optional) */}
      {propertiesPanel}
    </div>
  );
}
