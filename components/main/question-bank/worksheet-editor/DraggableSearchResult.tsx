"use client";

import { useDraggable } from "@dnd-kit/react";
import type { WorksheetQuestionBankItem } from "./types";

/**
 * 将搜索结果项包裹为可拖拽元素。
 * 拖拽开始时通过 onDragStart 通知父组件当前拖拽的题目数据。
 */
export default function DraggableSearchResult({
  item,
  children,
  disabled,
  onDragStart,
}: {
  item: WorksheetQuestionBankItem;
  children: React.ReactNode;
  disabled?: boolean;
  onDragStart?: (item: WorksheetQuestionBankItem) => void;
}) {
  const { ref, isDragging } = useDraggable({
    id: `search-result-${item.id}`,
    data: { item },
    disabled,
  });

  return (
    <div
      ref={ref}
      className={isDragging ? "opacity-40 cursor-grabbing" : "cursor-grab"}
      style={{ touchAction: "none" }}
      onPointerDown={() => {
        // 在指针按下时通知父组件即将拖拽的题目（用于 DragOverlay）
        onDragStart?.(item);
      }}
    >
      {children}
    </div>
  );
}
