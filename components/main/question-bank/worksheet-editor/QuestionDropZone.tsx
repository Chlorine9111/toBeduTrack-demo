"use client";

import { useDroppable } from "@dnd-kit/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Wrap a question card with explicit top/bottom drop targets so dragging over
 * the upper or lower half of the card maps directly to insert-before/after.
 */
export default function QuestionDropZone({
  children,
  sectionId,
  questionId,
  enabled = true,
}: {
  children: React.ReactNode;
  sectionId: string;
  questionId: string;
  enabled?: boolean;
}) {
  const { isZh } = useAppI18n();
  const {
    ref: beforeRef,
    isDropTarget: isBeforeDropTarget,
  } = useDroppable({
    id: `drop-before-question-${questionId}`,
    data: {
      dropZoneId: `drop-before-question-${questionId}`,
      sectionId,
      beforeQuestionId: questionId,
    },
  });
  const {
    ref: afterRef,
    isDropTarget: isAfterDropTarget,
  } = useDroppable({
    id: `drop-after-question-${questionId}`,
    data: {
      dropZoneId: `drop-after-question-${questionId}`,
      sectionId,
      afterQuestionId: questionId,
    },
  });
  const showBeforeDropTarget = enabled && isBeforeDropTarget;
  const showAfterDropTarget = enabled && isAfterDropTarget;

  return (
    <div className="relative">
      <div
        ref={beforeRef}
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-1/2 rounded-t-md transition-all duration-150",
          showBeforeDropTarget
            ? "border-2 border-dashed border-[#5E6AD2] bg-[#5E6AD2]/6"
            : "border-2 border-transparent",
        )}
      >
        {showBeforeDropTarget ? (
          <div className="flex h-full items-start justify-center pt-2">
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#5E6AD2] shadow-sm">
              {isZh ? "拖到这里插入到上方" : "Drop to insert above"}
            </span>
          </div>
        ) : null}
      </div>
      {children}
      <div
        ref={afterRef}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/2 rounded-b-md transition-all duration-150",
          showAfterDropTarget
            ? "border-2 border-dashed border-[#5E6AD2] bg-[#5E6AD2]/6"
            : "border-2 border-transparent",
        )}
      >
        {showAfterDropTarget ? (
          <div className="flex h-full items-end justify-center pb-2">
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#5E6AD2] shadow-sm">
              {isZh ? "拖到这里插入到下方" : "Drop to insert below"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Section boundary drop zone. When beforeQuestionId is provided, dropping
 * inserts at the start of the section; otherwise it appends to that section.
 */
export function SectionDropZone({
  sectionId,
  beforeQuestionId,
  enabled = true,
}: {
  sectionId: string;
  beforeQuestionId?: string;
  enabled?: boolean;
}) {
  const { isZh } = useAppI18n();
  const { ref, isDropTarget } = useDroppable({
    id: beforeQuestionId
      ? `drop-section-start-${sectionId}`
      : `drop-section-end-${sectionId}`,
    data: {
      dropZoneId: beforeQuestionId
        ? `drop-section-start-${sectionId}`
        : `drop-section-end-${sectionId}`,
      sectionId,
      beforeQuestionId,
    },
  });
  const showDropTarget = enabled && isDropTarget;

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-150",
        showDropTarget
          ? "my-1 h-10 rounded-[4px] border-2 border-dashed border-[#5E6AD2] bg-[#5E6AD2]/5 flex items-center justify-center"
          : beforeQuestionId
            ? "h-4"
            : "h-6",
      )}
    >
      {showDropTarget ? (
        <span className="text-[11px] font-medium text-[#5E6AD2]">
          {beforeQuestionId
            ? isZh
              ? "拖到这里插入到分组开头"
              : "Drop to insert at section start"
            : isZh
              ? "拖到这里添加到当前分组"
              : "Drop to add in this section"}
        </span>
      ) : null}
    </div>
  );
}
