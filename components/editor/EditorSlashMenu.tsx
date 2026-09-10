"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  Heading,
  Image,
  List,
  ListOrdered,
  Minus,
  Quote,
  Sparkles,
  Table,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SlashMenuItem = {
  id: string;
  label: string;
  description: string;
  icon: typeof Type;
  group: string;
  highlighted?: boolean;
};

type EditorSlashMenuProps = {
  open: boolean;
  position?: { top: number; left: number };
  onSelect: (itemId: string) => void;
  onClose: () => void;
};

const ITEMS: SlashMenuItem[] = [
  { id: "text", label: "文本", description: "开始编写纯文本内容", icon: AlignLeft, group: "基础块" },
  { id: "heading1", label: "标题 1", description: "大号标题", icon: Heading, group: "基础块" },
  { id: "heading2", label: "标题 2", description: "中号标题", icon: Heading, group: "基础块" },
  { id: "heading3", label: "标题 3", description: "小号标题", icon: Heading, group: "基础块" },
  { id: "bullet-list", label: "无序列表", description: "创建无序列表", icon: List, group: "列表" },
  { id: "ordered-list", label: "有序列表", description: "创建有序列表", icon: ListOrdered, group: "列表" },
  { id: "quote", label: "引用", description: "添加引用块", icon: Quote, group: "基础块" },
  { id: "divider", label: "分隔线", description: "插入水平分隔线", icon: Minus, group: "基础块" },
  { id: "table", label: "表格", description: "创建 Rubric 评分网格", icon: Table, group: "高级" },
  { id: "image", label: "图片", description: "上传或嵌入图片", icon: Image, group: "媒体" },
  { id: "ai", label: "AI 助手", description: "用 AI 生成内容", icon: Sparkles, group: "AI", highlighted: true },
];

export default function EditorSlashMenu({
  open,
  position,
  onSelect,
  onClose,
}: EditorSlashMenuProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = ITEMS.filter(
    (item) =>
      !query ||
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase()),
  );

  // Group items
  const groups = new Map<string, SlashMenuItem[]>();
  for (const item of filtered) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const target = filtered[activeIndex];
        if (target) onSelect(target.id);
      }
    },
    [activeIndex, filtered, onClose, onSelect, open],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-64 overflow-hidden rounded-xl border border-divider bg-white py-1 shadow-lg animate-scale-in"
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      {Array.from(groups.entries()).map(([groupName, groupItems]) => (
        <div key={groupName}>
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-default-400">
            {groupName}
          </div>
          {groupItems.map((item) => {
            const idx = flatIndex;
            flatIndex += 1;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                  idx === activeIndex ? "bg-default-100" : "",
                  item.highlighted ? "hover:bg-[#DDEBF1]/30" : "hover:bg-default-100",
                )}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => onSelect(item.id)}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded",
                    item.highlighted
                      ? "bg-[#DDEBF1]/50 text-primary"
                      : "bg-default-100 text-default-400",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-foreground">{item.label}</div>
                  <div className="text-[11px] text-default-400">{item.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {filtered.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-default-400">
          没有匹配结果
        </div>
      ) : null}
    </div>
  );
}
