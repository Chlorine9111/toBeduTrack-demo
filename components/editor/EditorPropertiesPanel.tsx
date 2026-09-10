"use client";

import { type ReactNode } from "react";
import { ChevronRight, Download, RefreshCw, X } from "lucide-react";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";

type WeightItem = {
  id: string;
  label: string;
  percentage: number;
  active?: boolean;
};

type EditorPropertiesPanelProps = {
  open: boolean;
  title?: string;
  onClose?: () => void;
  children?: ReactNode;
};

export default function EditorPropertiesPanel({
  open,
  title = "文档设置",
  onClose,
  children,
}: EditorPropertiesPanelProps) {
  return (
    <aside
      data-testid="editor-properties-panel"
      className={cn(
        "fixed right-0 top-0 z-40 flex h-screen w-[280px] flex-col border-l border-divider bg-default-100/80 pt-12 backdrop-blur-md transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-default-400">
            {title}
          </h3>
          {onClose ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              data-testid="editor-properties-close"
              onPress={onClose}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {children}
      </div>
    </aside>
  );
}

/* ── Reusable sub-components for property panels ── */

export function PropertyGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

export function PropertyInput({
  label,
  type = "text",
  value,
  onChange,
  options,
}: {
  label: string;
  type?: "text" | "number" | "select";
  value: string | number;
  onChange?: (value: string) => void;
  options?: Array<{ label: string; value: string }>;
}) {
  const baseClass =
    "w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm outline-hidden transition-all focus:ring-2 focus:ring-[rgba(94,106,210,0.28)]";

  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-default-500">
        {label}
      </span>
      {type === "select" && options ? (
        <select
          className={cn(baseClass, "cursor-pointer appearance-none")}
          value={value}
          style={{}}
          onChange={(e) => onChange?.(e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className={baseClass}
          value={value}
          style={{}}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </label>
  );
}

export function PropertyWeightList({
  items,
  onItemClick,
}: {
  items: WeightItem[];
  onItemClick?: (id: string) => void;
}) {
  return (
    <div>
      <span className="mb-3 block text-[12px] font-semibold text-default-500">
        权重分配
      </span>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onItemClick?.(item.id)}
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-xl border border-divider bg-white p-3 transition-colors hover:bg-default-100",
              item.active ? "border-[#0B6E99]/30" : "",
            )}
          >
            <span className="text-[13px] text-foreground">{item.label}</span>
            <span
              className={cn(
                "text-xs font-bold",
                item.active ? "text-primary" : "text-default-400",
              )}
            >
              {item.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PropertyActionList({
  actions,
}: {
  actions: Array<{ id: string; label: string; icon: typeof Download; onClick?: () => void }>;
}) {
  return (
    <div className="space-y-0.5 pt-4">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] text-default-500 transition-colors hover:bg-default-100"
          >
            <span className="flex items-center gap-2">
              <Icon className="h-[18px] w-[18px]" />
              {action.label}
            </span>
            <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        );
      })}
    </div>
  );
}

export function PropertyUserCard({
  initials,
  name,
  role,
}: {
  initials: string;
  name: string;
  role: string;
}) {
  return (
    <div className="border-t border-divider bg-default-50 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DDEBF1] text-xs font-bold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
          <div className="truncate text-[11px] text-default-400">{role}</div>
        </div>
      </div>
    </div>
  );
}
