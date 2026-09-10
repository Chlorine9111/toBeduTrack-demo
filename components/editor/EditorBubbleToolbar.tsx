"use client";

import {
  Bold,
  Code,
  Italic,
  Link,
  Sparkles,
  Strikethrough,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@heroui/react";

type ToolbarAction = {
  id: string;
  icon: typeof Bold;
  label: string;
  active?: boolean;
};

type EditorBubbleToolbarProps = {
  visible: boolean;
  position?: { top: number; left: number };
  activeFormats?: Set<string>;
  onFormatToggle?: (format: string) => void;
  onLinkClick?: () => void;
  onAIClick?: () => void;
  onHeadingClick?: () => void;
};

const FORMAT_BUTTONS: ToolbarAction[] = [
  { id: "bold", icon: Bold, label: "加粗" },
  { id: "italic", icon: Italic, label: "斜体" },
  { id: "strikethrough", icon: Strikethrough, label: "删除线" },
  { id: "code", icon: Code, label: "行内代码" },
];

export default function EditorBubbleToolbar({
  visible,
  position,
  activeFormats = new Set(),
  onFormatToggle,
  onLinkClick,
  onAIClick,
  onHeadingClick,
}: EditorBubbleToolbarProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-lg bg-foreground px-1.5 py-1 shadow-xl animate-fade-in"
      style={position ? { top: position.top - 48, left: position.left } : undefined}
    >
      {/* Format buttons */}
      {FORMAT_BUTTONS.map((btn) => {
        const Icon = btn.icon;
        const isActive = activeFormats.has(btn.id);
        return (
          <Button
            key={btn.id}
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => onFormatToggle?.(btn.id)}
            className={cn(
              "rounded p-1 transition-colors",
              isActive
                ? "bg-white/20 text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
            aria-label={btn.label}
          >
            <Icon className="h-[18px] w-[18px]" />
          </Button>
        );
      })}

      <div className="mx-1 h-4 w-px bg-white/20" />

      {/* Link */}
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={onLinkClick}
        className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label="插入链接"
      >
        <Link className="h-[18px] w-[18px]" />
      </Button>

      <div className="mx-1 h-4 w-px bg-white/20" />

      {/* Heading */}
      <Button
        size="sm"
        variant="ghost"
        onPress={onHeadingClick}
        className="flex items-center gap-1 text-[12px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
      >
        <Type className="h-4 w-4" />
        <span>H</span>
      </Button>

      <div className="mx-1 h-4 w-px bg-white/20" />

      {/* AI Rewrite */}
      <Button
        size="sm"
        variant="ghost"
        onPress={onAIClick}
        className="flex items-center gap-1.5 text-[12px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
      >
        <Sparkles className="h-4 w-4" />
        <span>AI 改写</span>
      </Button>
    </div>
  );
}
