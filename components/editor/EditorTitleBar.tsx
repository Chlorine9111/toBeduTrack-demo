"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";

type PropertyPill = {
  key: string;
  icon?: string;
  label: string;
  value: string;
  color?: { bg: string; text: string };
  onChange?: (value: string) => void;
};

type EditorTitleBarProps = {
  title: string;
  onTitleChange: (title: string) => void;
  properties?: PropertyPill[];
  onAddProperty?: () => void;
  placeholder?: string;
  readOnly?: boolean;
};

const DEFAULT_COLORS: Record<string, { bg: string; text: string }> = {
  course: { bg: "bg-[#DDEBF1]/50", text: "text-primary" },
  unit: { bg: "bg-[#EAE4F2]/50", text: "text-[#6940A5]" },
  status: { bg: "bg-[#DDEDEA]/50", text: "text-success" },
  type: { bg: "bg-[#FAEBDD]/50", text: "text-[#D9730D]" },
  default: { bg: "bg-[#EBECED]/50", text: "text-default-400" },
};

export default function EditorTitleBar({
  title,
  onTitleChange,
  properties = [],
  onAddProperty,
  placeholder = "Untitled",
  readOnly = false,
}: EditorTitleBarProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [hovering, setHovering] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const isComposingRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // 同步外部 title 到 contentEditable（处理版本冲突刷新等场景）
  useEffect(() => {
    const el = titleRef.current;
    if (!el || isComposingRef.current) return;
    if (el.textContent !== title) {
      el.textContent = title;
    }
  }, [title]);

  const handleTitleInput = useCallback(() => {
    if (isComposingRef.current) return;
    const text = titleRef.current?.textContent ?? "";
    onTitleChange(text);
  }, [onTitleChange]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
      }
    },
    [],
  );

  return (
    <section
      className="group mb-6"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Editable title */}
      {isHydrated && !readOnly ? (
        <h1
          key="editable-title"
          ref={titleRef}
          data-testid="editor-title"
          className="mb-3 text-[26px] font-semibold leading-tight text-foreground outline-hidden empty:before:text-[rgba(55,53,47,0.25)] empty:before:content-[attr(data-placeholder)]"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          data-placeholder={placeholder}
          onInput={handleTitleInput}
          onKeyDown={handleTitleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            handleTitleInput();
          }}
        >
          {title}
        </h1>
      ) : (
        <h1
          key="static-title"
          data-testid="editor-title"
          className="mb-3 text-[26px] font-semibold leading-tight text-foreground empty:before:text-[rgba(55,53,47,0.25)] empty:before:content-[attr(data-placeholder)]"
          data-placeholder={placeholder}
        >
          {title}
        </h1>
      )}

      {/* Property pills */}
      {properties.length > 0 || onAddProperty ? (
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          {properties.map((prop) => {
            const color = prop.color ?? DEFAULT_COLORS[prop.key] ?? DEFAULT_COLORS.default;
            return (
              <div
                key={prop.key}
                className="flex cursor-default items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-default-50"
              >
                {prop.icon ? (
                  <span className="text-default-400">{prop.icon}</span>
                ) : null}
                <span className="w-20 text-default-400">{prop.label}</span>
                <span className={cn("rounded px-1.5 py-0.5", color.bg, color.text)}>
                  {prop.value}
                </span>
              </div>
            );
          })}

          {onAddProperty ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={onAddProperty}
              className={cn(
                "transition-all",
                hovering ? "opacity-100" : "opacity-0",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              添加属性
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Divider */}
      <div className="mt-6 border-b border-default-100" />
    </section>
  );
}
