"use client";

import { type ReactNode } from "react";
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@heroui/react";

type EditorBlockHandleProps = {
  children: ReactNode;
  onPlusClick?: () => void;
  onDragStart?: () => void;
  className?: string;
};

/**
 * Wraps a content block with hover-visible drag handle + plus button.
 * Positioned to the left of the block content.
 */
export default function EditorBlockHandle({
  children,
  onPlusClick,
  onDragStart,
  className,
}: EditorBlockHandleProps) {
  return (
    <div className={`group/block relative flex items-start gap-2 ${className ?? ""}`}>
      {/* Handles — positioned to the left, hidden by default */}
      <div className="absolute -left-10 top-1 flex items-center gap-1">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={onPlusClick}
          className="rounded p-1 text-[rgba(55,53,47,0.2)] opacity-0 transition-all hover:text-[rgba(55,53,47,0.5)] group-hover/block:opacity-100"
          aria-label="添加块"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <div
          className="cursor-grab p-1 text-[rgba(55,53,47,0.2)] opacity-0 transition-opacity group-hover/block:opacity-40"
          onMouseDown={onDragStart}
        >
          <GripVertical className="h-5 w-5" />
        </div>
      </div>

      {/* Block content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
