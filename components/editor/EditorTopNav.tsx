"use client";

import Link from "next/link";
import { Check, Clock, PanelRight, Share2 } from "lucide-react";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";

type Crumb = {
  label: string;
  href?: string;
};

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

type EditorTopNavProps = {
  breadcrumbs: Crumb[];
  saveStatus?: SaveStatus;
  propertiesOpen?: boolean;
  onShare?: () => void;
  onHistory?: () => void;
  onToggleProperties?: () => void;
};

const STATUS_CONFIG: Record<SaveStatus, { label: string; icon: typeof Check; color: string; bg: string }> = {
  saved: { label: "已保存", icon: Check, color: "text-success", bg: "bg-[#DDEDEA]/50" },
  saving: { label: "保存中…", icon: Clock, color: "text-default-400", bg: "bg-default-100" },
  unsaved: { label: "未保存", icon: Clock, color: "text-[#DFAB01]", bg: "bg-[#FBF3DB]/50" },
  error: { label: "保存失败", icon: Clock, color: "text-danger", bg: "bg-[#FBE4E4]/50" },
};

export default function EditorTopNav({
  breadcrumbs,
  saveStatus = "saved",
  propertiesOpen = false,
  onShare,
  onHistory,
  onToggleProperties,
}: EditorTopNavProps) {
  const status = STATUS_CONFIG[saveStatus];
  const StatusIcon = status.icon;

  return (
    <header className="sticky top-0 z-40 flex h-12 w-full items-center justify-between bg-white/80 px-6 backdrop-blur-md">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 overflow-hidden text-sm text-default-500">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <span key={index} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="text-[rgba(55,53,47,0.2)]">/</span>
              ) : null}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  data-testid={`editor-breadcrumb-${index}`}
                  className="rounded px-1.5 py-0.5 transition-colors hover:bg-default-50"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5",
                    isLast ? "truncate font-medium text-foreground" : "",
                  )}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* Save status */}
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            status.bg,
            status.color,
          )}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </div>

        <div className="mx-1 h-4 w-px bg-[rgba(55,53,47,0.12)]" />

        {onShare ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={onShare}
            aria-label="分享"
          >
            <Share2 className="h-5 w-5" />
          </Button>
        ) : null}

        {onHistory ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={onHistory}
            aria-label="历史版本"
          >
            <Clock className="h-5 w-5" />
          </Button>
        ) : null}

        {onToggleProperties ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            data-testid="editor-properties-toggle"
            onPress={onToggleProperties}
            className={cn(
              propertiesOpen
                ? "bg-default-100 text-foreground"
                : "text-default-400",
            )}
            aria-label="文档设置"
          >
            <PanelRight className="h-5 w-5" />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
