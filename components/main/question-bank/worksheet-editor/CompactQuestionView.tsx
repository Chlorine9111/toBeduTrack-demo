"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Wand2,
  Trash2,
  SquareDashed,
} from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import QuestionContentWithImages, { stripMarkdownImages } from "@/components/shared/QuestionContentWithImages";
import type { WorksheetEditorQuestion } from "@/components/main/question-bank/worksheet-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/worksheet-editor/utils";
import { cn } from "@/lib/utils";

type StrokeData = {
  points: Array<{ x: number; y: number }>;
  color: string;
  lineWidth: number;
};

function DrawingPreview({ drawingData, blankHeight }: { drawingData: string; blankHeight?: number }) {
  const canvasHeight = Math.max(200, blankHeight ?? 120);
  const svgContent = useMemo(() => {
    try {
      const strokes = JSON.parse(drawingData) as StrokeData[];
      if (!strokes || strokes.length === 0) return null;

      const paths = strokes
        .filter((s) => s.color !== "eraser" && s.points.length >= 2)
        .map((stroke) => {
          const d = stroke.points
            .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * 760).toFixed(1)},${p.y.toFixed(1)}`)
            .join(" ");
          return `<path d="${d}" stroke="${stroke.color}" stroke-width="${stroke.lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        });

      if (paths.length === 0) return null;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${canvasHeight}" preserveAspectRatio="xMidYMid meet">${paths.join("")}</svg>`;
    } catch {
      return null;
    }
  }, [drawingData, canvasHeight]);

  if (!svgContent) return null;

  return (
    <div
      className="mt-1.5 rounded border border-[rgba(55,53,47,0.08)] bg-[#fefefe]"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

type ContextMenuPosition = { x: number; y: number } | null;

type CompactQuestionViewProps = {
  question: WorksheetEditorQuestion;
  index: number;
  active?: boolean;
  onClick?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
  onAddBlankAfter?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

/**
 * 紧凑版题目卡片 — 用于 A4 分页视图中的只读显示。
 *
 * 不包含展开的编辑器、工具栏等。只显示：
 * - 题号 + 分值 + 难度
 * - 题干文字（纯文本）
 * - 选项 A-D（只读文本）
 * - stimulus 图片（如果有，按 scale 缩放）
 * - 空白块显示为虚线框
 *
 * 右键弹出上下文菜单，包含：上移、下移、换一题、删除、在此题下方添加空白区域。
 */
export default function CompactQuestionView({
  question,
  index,
  active,
  onClick,
  onMoveUp,
  onMoveDown,
  onReplace,
  onRemove,
  onAddBlankAfter,
  canMoveUp,
  canMoveDown,
}: CompactQuestionViewProps) {
  const { isZh } = useAppI18n();
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  const closeMenu = useCallback(() => setContextMenu(null), []);

  // 点击菜单外部关闭
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [contextMenu, closeMenu]);

  const menuItems = useMemo(() => {
    const isBlank = question.isBlankBlock;

    const items: Array<{
      key: string;
      label: string;
      icon: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      danger?: boolean;
      separator?: boolean;
    }> = [];

    if (!isBlank) {
      items.push(
        {
          key: "move-up",
          label: isZh ? "上移" : "Move up",
          icon: <ArrowUp className="h-3.5 w-3.5" />,
          onClick: onMoveUp,
          disabled: canMoveUp === false,
        },
        {
          key: "move-down",
          label: isZh ? "下移" : "Move down",
          icon: <ArrowDown className="h-3.5 w-3.5" />,
          onClick: onMoveDown,
          disabled: canMoveDown === false,
        },
        {
          key: "replace",
          label: isZh ? "换一题" : "Replace",
          icon: <Wand2 className="h-3.5 w-3.5" />,
          onClick: onReplace,
        },
      );
    }

    items.push({
      key: "delete",
      label: isZh ? "删除" : "Delete",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: onRemove,
      danger: true,
    });

    items.push({ key: "sep", label: "", icon: null, separator: true });

    items.push({
      key: "add-blank-after",
      label: isZh ? "在此题下方添加空白区域" : "Add blank area below",
      icon: <SquareDashed className="h-3.5 w-3.5" />,
      onClick: onAddBlankAfter,
    });

    return items;
  }, [
    question.isBlankBlock,
    isZh,
    onMoveUp,
    onMoveDown,
    onReplace,
    onRemove,
    onAddBlankAfter,
    canMoveUp,
    canMoveDown,
  ]);

  // 空白块
  if (question.isBlankBlock) {
    return (
      <>
        <div
          data-question-id={question.id}
          className={cn(
            "rounded-md border border-dashed px-3 py-3 transition-colors cursor-pointer",
            active
              ? "border-[rgba(55,53,47,0.28)] bg-[#fefefe]"
              : "border-[rgba(55,53,47,0.16)] bg-white hover:border-[rgba(55,53,47,0.22)]",
          )}
          onClick={onClick}
          onContextMenu={handleContextMenu}
          style={{ minHeight: `${question.blankHeight ?? 120}px` }}
        >
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-[#37352F]/35">
            <SquareDashed className="h-3 w-3" />
            <span className="font-medium">{isZh ? "空白区域" : "Blank area"}</span>
          </div>
          {question.blankContent ? (
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-[#37352F]/60">
              {question.blankContent}
            </p>
          ) : null}
          {question.drawingData ? (
            <DrawingPreview drawingData={question.drawingData} blankHeight={question.blankHeight} />
          ) : null}
        </div>
        {contextMenu ? (
          <ContextMenuOverlay
            position={contextMenu}
            items={menuItems}
            onClose={closeMenu}
            menuRef={menuRef}
          />
        ) : null}
      </>
    );
  }

  const mcOptions =
    question.questionType === "MC" && question.options
      ? question.options.slice(0, 4)
      : [];

  return (
    <>
      <div
        data-question-id={question.id}
        className={cn(
          "rounded-md px-3 py-2.5 transition-colors cursor-pointer",
          active
            ? "bg-[#f7f6f3] ring-1 ring-[rgba(55,53,47,0.2)]"
            : "bg-white hover:bg-[#fafaf8]",
        )}
        onClick={onClick}
        onContextMenu={handleContextMenu}
      >
        {/* 题号行 */}
        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-[#37352F]/40">
          <span className="font-semibold text-[#37352F]/60">{index + 1}.</span>
          <span>{getQuestionTypeLabel(question.questionType, isZh)}</span>
          <span>{getDifficultyLabel(question.difficulty, isZh)}</span>
          <span>{isZh ? `${question.points} 分` : `${question.points} pts`}</span>
        </div>

        {/* stimulus 图片 */}
        {question.stimulusImageUrl ? (
          <div className="mt-1.5">
            <img
              src={question.stimulusImageUrl}
              alt="Stimulus"
              referrerPolicy="no-referrer"
              className="rounded border border-[rgba(55,53,47,0.06)] object-scale-down bg-[#fafaf8]"
              style={{
                width: `${Math.round((question.stimulusImageScale ?? 0.5) * 100)}%`,
              }}
            />
          </div>
        ) : null}

        {/* 题干 — 已有 stimulusImageUrl 时只渲染文字，避免重复显示图片 */}
        <div className="mt-1.5 line-clamp-4">
          {question.stimulusImageUrl ? (
            <QuestionContentWithImages
              content={stripMarkdownImages(question.questionText)}
              className="space-y-1.5"
              textClassName="text-[12px] leading-[1.6] text-[#37352F]/85"
              galleryClassName="hidden"
            />
          ) : (
            <QuestionContentWithImages
              content={question.questionText}
              className="space-y-1.5"
              textClassName="text-[12px] leading-[1.6] text-[#37352F]/85"
              galleryClassName="grid gap-1.5"
              imageClassName="block max-h-[120px] w-auto max-w-[50%] object-scale-down"
            />
          )}
        </div>

        {/* MC 选项 */}
        {mcOptions.length > 0 ? (
          <div className="mt-1.5 space-y-0.5">
            {mcOptions.map((option) => (
              <div
                key={`${question.id}-${option.label}`}
                className="flex items-start gap-1.5 text-[11px] leading-5 text-[#37352F]/72"
              >
                <span className="w-4 shrink-0 font-semibold text-[#37352F]/60">
                  {option.label}.
                </span>
                <div className="min-w-0">
                  <QuestionContentWithImages
                    content={option.text}
                    className="space-y-1"
                    textClassName="line-clamp-2 text-[11px] leading-5"
                    galleryClassName="mt-1"
                    figureClassName="bg-[#fafaf8]"
                    imageClassName="max-h-[48px] w-auto object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {contextMenu ? (
        <ContextMenuOverlay
          position={contextMenu}
          items={menuItems}
          onClose={closeMenu}
          menuRef={menuRef}
        />
      ) : null}
    </>
  );
}

/**
 * 右键上下文菜单浮层 — 使用 fixed 定位，渲染在 portal 中。
 */
function ContextMenuOverlay({
  position,
  items,
  onClose,
  menuRef,
}: {
  position: { x: number; y: number };
  items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    danger?: boolean;
    separator?: boolean;
  }>;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  // 确保菜单不超出视口
  const adjustedPosition = useMemo(() => {
    const menuWidth = 220;
    const menuHeight = items.length * 34 + 16;
    const x =
      position.x + menuWidth > window.innerWidth
        ? position.x - menuWidth
        : position.x;
    const y =
      position.y + menuHeight > window.innerHeight
        ? Math.max(8, position.y - menuHeight)
        : position.y;
    return { x: Math.max(8, x), y };
  }, [position, items.length]);

  return (
    <div
      ref={menuRef}
      data-testid="worksheet-question-context-menu"
      className="fixed z-50 min-w-[200px] rounded-lg border border-[rgba(55,53,47,0.12)] bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item) => {
        if (item.separator) {
          return (
            <div
              key={item.key}
              className="mx-2 my-1 border-t border-[rgba(55,53,47,0.08)]"
            />
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] leading-5 transition-colors",
              item.disabled
                ? "cursor-not-allowed text-[#37352F]/25"
                : item.danger
                  ? "text-rose-600 hover:bg-rose-50"
                  : "text-[#37352F]/80 hover:bg-[#f7f6f3]",
            )}
            onClick={() => {
              if (!item.disabled && item.onClick) {
                item.onClick();
              }
              onClose();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 简易 HTML 标签剥离（用于紧凑预览） */
function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
