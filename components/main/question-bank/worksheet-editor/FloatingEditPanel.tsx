"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eraser,
  ImagePlus,
  Minus,
  Pen,
  Plus,
  SquareDashed,
  Trash,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import QuestionTiptapEditor from "@/components/main/question-bank/shared/QuestionTiptapEditor";
import DrawingCanvas from "@/components/main/question-bank/worksheet-editor/DrawingCanvas";
import type { DrawingStroke } from "@/components/main/question-bank/worksheet-editor/DrawingCanvas";
import { stripMarkdownImages } from "@/components/shared/QuestionContentWithImages";
import type { WorksheetEditorQuestion, WorksheetQuestionBankItem } from "@/components/main/question-bank/worksheet-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/worksheet-editor/utils";
import ReplaceQuestionPanel from "@/components/main/question-bank/worksheet-editor/ReplaceQuestionPanel";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

function StimulusImageWithResize({
  url,
  scale,
  onScaleChange,
  onRemove,
}: {
  url: string;
  scale: number;
  onScaleChange: (scale: number) => void;
  onRemove: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const containerWidth = containerRef.current?.parentElement?.offsetWidth ?? 600;
      const startX = event.clientX;
      const startScale = scale;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const scaleDelta = delta / containerWidth;
        const nextScale = Math.min(1.0, Math.max(0.25, startScale + scaleDelta));
        onScaleChange(Math.round(nextScale * 20) / 20);
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [scale, onScaleChange],
  );

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative inline-block" style={{ width: `${Math.round(scale * 100)}%` }}>
        <img
          src={url}
          alt="Stimulus"
          referrerPolicy="no-referrer"
          className="w-full rounded-lg border border-[rgba(55,53,47,0.08)] object-scale-down bg-[#fafaf8]"
        />
        {/* 删除按钮 */}
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70",
            hovered ? "opacity-100" : "opacity-0",
          )}
        >
          <X className="h-3 w-3" />
        </button>
        {/* 右下角拖拽缩放手柄 */}
        <div
          onPointerDown={handleResizePointerDown}
          className={cn(
            "absolute bottom-1 right-1 flex h-5 w-5 cursor-ew-resize items-center justify-center rounded-sm bg-black/40 text-white transition hover:bg-black/60",
            hovered ? "opacity-100" : "opacity-0",
          )}
          title={`${Math.round(scale * 100)}%`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {hovered ? (
        <div className="mt-0.5 text-[10px] text-[#37352F]/35">{Math.round(scale * 100)}%</div>
      ) : null}
    </div>
  );
}

const DRAW_COLORS = [
  { value: "#000000", labelZh: "黑", labelEn: "Black", className: "bg-[#1f1f1f]" },
  { value: "#dc2626", labelZh: "红", labelEn: "Red", className: "bg-red-600" },
  { value: "#2563eb", labelZh: "蓝", labelEn: "Blue", className: "bg-blue-600" },
] as const;

const DRAW_WIDTHS = [
  { value: 1, labelZh: "细", labelEn: "Thin" },
  { value: 3, labelZh: "中", labelEn: "Medium" },
  { value: 5, labelZh: "粗", labelEn: "Thick" },
] as const;

const DIFFICULTY_OPTIONS = [
  {
    value: 1 as const,
    labelZh: "基础",
    labelEn: "Basic",
    activeClassName: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  {
    value: 2 as const,
    labelZh: "常规",
    labelEn: "Standard",
    activeClassName: "border-amber-300 bg-amber-50 text-amber-700",
  },
  {
    value: 3 as const,
    labelZh: "进阶",
    labelEn: "Advanced",
    activeClassName: "border-rose-300 bg-rose-50 text-rose-700",
  },
  {
    value: 4 as const,
    labelZh: "提高",
    labelEn: "Challenge",
    activeClassName: "border-red-300 bg-red-50 text-red-700",
  },
];

function ensureMcOptions(
  options: WorksheetEditorQuestion["options"],
): NonNullable<WorksheetEditorQuestion["options"]> {
  const base = options?.slice(0, 4) ?? [];
  const labels = ["A", "B", "C", "D"];
  return labels.map((label, index) => ({
    label,
    text: base[index]?.text ?? "",
    isCorrect: base[index]?.isCorrect ?? index === 0,
  }));
}

/**
 * 浮动编辑面板 — 当用户在 A4 分页视图中点击一道题时弹出。
 *
 * 包含：
 * - 题干编辑（QuestionTiptapEditor）
 * - 选项编辑
 * - 正确答案标记
 * - 解析编辑
 * - 分值 / 难度
 * - stimulus 图片编辑
 * - 工具栏（换一题、删除等）
 */
export default function FloatingEditPanel({
  question,
  index,
  anchorRect,
  savedDragPos,
  onDragPosChange,
  autoOpenReplace = false,
  onAutoOpenReplaceHandled,
  onUpdateQuestion,
  onRemoveQuestion,
  onSearchReplacements,
  onConfirmReplace,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onClose,
}: {
  question: WorksheetEditorQuestion;
  index: number;
  /** 被点击题目的 getBoundingClientRect */
  anchorRect: { top: number; left: number; right: number; bottom: number; width: number };
  /** 编辑区滚动容器的 getBoundingClientRect */
  containerRect: { top: number; left: number; right: number; bottom: number; width: number };
  onUpdateQuestion: (
    updater: (q: WorksheetEditorQuestion) => WorksheetEditorQuestion,
  ) => void;
  onRemoveQuestion: () => void;
  onSearchReplacements: () => Promise<WorksheetQuestionBankItem[]>;
  onConfirmReplace: (item: WorksheetQuestionBankItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  savedDragPos?: { x: number; y: number } | null;
  onDragPosChange?: (pos: { x: number; y: number }) => void;
  autoOpenReplace?: boolean;
  onAutoOpenReplaceHandled?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
}) {
  const { isZh } = useAppI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [editingStem, setEditingStem] = useState(false);
  const [editingOptionLabel, setEditingOptionLabel] = useState<string | null>(null);
  const [editingCorrectAnswer, setEditingCorrectAnswer] = useState(false);
  const [editingSolutionSteps, setEditingSolutionSteps] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 空白块编辑状态
  const [blankMode, setBlankMode] = useState<"text" | "draw">("text");
  const [drawColor, setDrawColor] = useState("#000000");
  const [drawWidth, setDrawWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);

  const parseStrokes = useCallback((data: string | undefined): DrawingStroke[] => {
    if (!data) return [];
    try {
      return JSON.parse(data) as DrawingStroke[];
    } catch {
      return [];
    }
  }, []);

  const handleStrokesChange = useCallback(
    (newStrokes: DrawingStroke[]) => {
      onUpdateQuestion((current) => ({
        ...current,
        drawingData: JSON.stringify(newStrokes),
        isModified: true,
      }));
    },
    [onUpdateQuestion],
  );

  const handleUndo = useCallback(() => {
    const currentStrokes = parseStrokes(question.drawingData);
    if (currentStrokes.length === 0) return;
    handleStrokesChange(currentStrokes.slice(0, -1));
  }, [question.drawingData, parseStrokes, handleStrokesChange]);

  const handleClearDrawing = useCallback(() => {
    handleStrokesChange([]);
  }, [handleStrokesChange]);

  const mcOptions =
    question.questionType === "MC" ? ensureMcOptions(question.options) : [];

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setReplaceMode(false);
    setEditingCorrectAnswer(false);
    setEditingSolutionSteps(false);
  }, [question.id]);

  useEffect(() => {
    if (!autoOpenReplace || question.isBlankBlock) return;
    setReplaceMode(true);
    onAutoOpenReplaceHandled?.();
  }, [autoOpenReplace, onAutoOpenReplaceHandled, question.id, question.isBlankBlock]);

  // 可拖拽定位（位置保存在父组件中，切换题目不重置）
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // 初始位置：题目下方（仅在没有保存位置时使用）
  const initialTop = typeof window !== "undefined" && anchorRect.bottom + 300 > window.innerHeight
    ? Math.max(8, anchorRect.top - 400)
    : anchorRect.bottom + 4;
  const initialLeft = anchorRect.left;

  const currentX = savedDragPos?.x ?? initialLeft;
  const currentY = savedDragPos?.y ?? initialTop;

  const handleDragPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragStartRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: currentX,
      origY: currentY,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;
      // 限制不超出视口（左边留 56px 给 Deskmate 导航栏）
      const nextX = Math.max(56, Math.min(window.innerWidth - 100, dragStartRef.current.origX + dx));
      const nextY = Math.max(0, Math.min(window.innerHeight - 40, dragStartRef.current.origY + dy));
      onDragPosChange?.({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  }, [currentX, currentY]);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const dataUrl = loadEvent.target?.result;
        if (typeof dataUrl === "string") {
          onUpdateQuestion((current) => ({
            ...current,
            stimulusImageUrl: dataUrl,
            stimulusImageScale: 0.5,
            stimulusImageAsset: null,
            isModified: true,
          }));
        }
      };
      reader.readAsDataURL(file);
      event.target.value = "";
    },
    [onUpdateQuestion],
  );

  const panelWidth = Math.min(anchorRect.width, 600);

  return (
    <div
      ref={panelRef}
      data-floating-edit-panel
      className="fixed z-50 flex flex-row items-start"
      style={{
        top: `${currentY}px`,
        left: `${currentX}px`,
      }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {/* 左侧：换一题候选面板 */}
      {replaceMode ? (
        <ReplaceQuestionPanel
          key={`replace-panel-${question.id}`}
          onSearchReplacements={onSearchReplacements}
          onConfirmReplace={(item) => {
            onConfirmReplace(item);
            setReplaceMode(false);
          }}
          onClose={() => setReplaceMode(false)}
        />
      ) : null}

      {/* 右侧：原始悬浮编辑面板 */}
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-[rgba(55,53,47,0.16)] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        style={{
          width: `${panelWidth}px`,
          maxHeight: "70vh",
        }}
      >
      {/* 面板标题栏：整条可拖拽，但默认鼠标正常 */}
      <div
        onPointerDown={handleDragPointerDown}
        className="relative flex shrink-0 items-center border-b border-[rgba(55,53,47,0.08)] px-3 py-2 select-none active:cursor-grabbing"
      >
        {/* 左：题目信息 */}
        <div className="flex items-center gap-2 text-[11px] text-[#37352F]/50 pointer-events-none">
          {question.isBlankBlock ? (
            <>
              <SquareDashed className="h-3 w-3" />
              <span className="font-semibold text-[#37352F]/70">
                {isZh ? "空白区域" : "Blank area"}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-[#37352F]/70">
                {isZh ? `第 ${index + 1} 题` : `Question ${index + 1}`}
              </span>
              <span>{getQuestionTypeLabel(question.questionType, isZh)}</span>
              <span>{getDifficultyLabel(question.difficulty, isZh)}</span>
            </>
          )}
        </div>

        {/* 正中间：六点拖拽提示（绝对定位确保居中） */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="cursor-grab rounded-md px-3 py-1.5 text-[#37352F]/18 transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#37352F]/35 active:cursor-grabbing">
            <svg width="22" height="14" viewBox="0 0 22 14" fill="currentColor">
              <circle cx="3.5" cy="4" r="2" />
              <circle cx="11" cy="4" r="2" />
              <circle cx="18.5" cy="4" r="2" />
              <circle cx="3.5" cy="10" r="2" />
              <circle cx="11" cy="10" r="2" />
              <circle cx="18.5" cy="10" r="2" />
            </svg>
          </div>
        </div>

        {/* 右：关闭 */}
        <div className="ml-auto">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onClose(); }}
            onPointerDown={(event) => event.stopPropagation()}
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#37352F]/50 transition hover:bg-[#f5f5f0] hover:text-[#37352F]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 可滚动内容 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {question.isBlankBlock ? (
          /* ===== 空白块编辑界面 ===== */
          <div>
            {/* 模式切换 + 画笔工具栏 */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {/* 文字 / 画笔 切换 */}
              <div className="inline-flex overflow-hidden rounded-lg border border-[rgba(55,53,47,0.12)]">
                <button
                  type="button"
                  onClick={() => {
                    setBlankMode("text");
                    setIsEraser(false);
                    // 切到文字时清空画笔数据
                    onUpdateQuestion((current) => ({
                      ...current,
                      drawingData: undefined,
                      isModified: true,
                    }));
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition",
                    blankMode === "text"
                      ? "bg-[#37352F] text-white"
                      : "bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
                  )}
                >
                  <Type className="h-3.5 w-3.5" />
                  {isZh ? "文字" : "Text"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBlankMode("draw");
                    setIsEraser(false);
                    // 切到画笔时清空文字，且高度不低于 200
                    onUpdateQuestion((current) => ({
                      ...current,
                      blankContent: "",
                      blankHeight: Math.max(200, current.blankHeight ?? 300),
                      isModified: true,
                    }));
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 border-l border-[rgba(55,53,47,0.12)] px-2.5 py-1.5 text-[11px] font-medium transition",
                    blankMode === "draw"
                      ? "bg-[#37352F] text-white"
                      : "bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
                  )}
                >
                  <Pen className="h-3.5 w-3.5" />
                  {isZh ? "画笔" : "Draw"}
                </button>
              </div>

              {/* 画笔模式下的工具 */}
              {blankMode === "draw" ? (
                <>
                  <div className="h-5 w-px bg-[rgba(55,53,47,0.12)]" />
                  {DRAW_COLORS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setDrawColor(item.value);
                        setIsEraser(false);
                      }}
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition",
                        !isEraser && drawColor === item.value
                          ? "border-[#37352F] ring-1 ring-[#37352F]/30"
                          : "border-[rgba(55,53,47,0.12)] hover:border-[rgba(55,53,47,0.28)]",
                      )}
                      title={isZh ? item.labelZh : item.labelEn}
                    >
                      <span className={cn("h-3.5 w-3.5 rounded-full", item.className)} />
                    </button>
                  ))}
                  <div className="h-5 w-px bg-[rgba(55,53,47,0.12)]" />
                  {DRAW_WIDTHS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setDrawWidth(item.value);
                        setIsEraser(false);
                      }}
                      className={cn(
                        "inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-medium transition",
                        !isEraser && drawWidth === item.value
                          ? "border-[#37352F] bg-[#37352F] text-white"
                          : "border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
                      )}
                    >
                      {isZh ? item.labelZh : item.labelEn}
                    </button>
                  ))}
                  <div className="h-5 w-px bg-[rgba(55,53,47,0.12)]" />
                  <button
                    type="button"
                    onClick={() => setIsEraser((prev) => !prev)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition",
                      isEraser
                        ? "border-[#37352F] bg-[#37352F] text-white"
                        : "border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
                    )}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    {isZh ? "橡皮" : "Eraser"}
                  </button>
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={parseStrokes(question.drawingData).length === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-[rgba(55,53,47,0.12)] bg-white px-2 py-1 text-[11px] font-medium text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {isZh ? "撤销" : "Undo"}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearDrawing}
                    disabled={parseStrokes(question.drawingData).length === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-[rgba(55,53,47,0.12)] bg-white px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Trash className="h-3.5 w-3.5" />
                    {isZh ? "清除" : "Clear"}
                  </button>
                </>
              ) : null}
            </div>

            {/* 内容区域 */}
            {blankMode === "text" ? (
              <textarea
                value={question.blankContent ?? ""}
                placeholder={
                  isZh
                    ? "输入文字内容（可选），留空则导出为空白区域"
                    : "Enter text content if needed. Leave blank to export an empty area."
                }
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    blankContent: event.target.value,
                    isModified: true,
                  }))
                }
                className="w-full min-h-[160px] resize-y rounded-lg border border-dashed border-[rgba(55,53,47,0.12)] bg-[#faf9f6] px-4 py-3 text-sm leading-7 text-[#37352F] outline-none placeholder:text-[#37352F]/30 focus:border-[rgba(55,53,47,0.28)]"
              />
            ) : (
              <DrawingCanvas
                width={Math.max(300, Math.min(anchorRect.width, 600) - 32)}
                height={Math.max(200, question.blankHeight ?? 120)}
                strokes={parseStrokes(question.drawingData)}
                color={drawColor}
                lineWidth={drawWidth}
                isEraser={isEraser}
                onStrokesChange={handleStrokesChange}
              />
            )}

            {/* 空白块高度设置 */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.16em] text-[#8c7e68]">
                {isZh ? "区域高度" : "Area height"}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    blankHeight: Math.max(blankMode === "draw" ? 200 : 32, (current.blankHeight ?? 300) - 20),
                    isModified: true,
                  }))
                }
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-white"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min={blankMode === "draw" ? 200 : 32}
                step={20}
                value={question.blankHeight ?? 300}
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    blankHeight: Math.min(700, Math.max(blankMode === "draw" ? 200 : 32, Number(event.target.value) || 300)),
                    isModified: true,
                  }))
                }
                className="h-6 w-14 rounded-full border border-[rgba(55,53,47,0.12)] bg-white px-2 text-center text-xs text-[#37352F] outline-none"
              />
              <span className="text-xs text-[#37352F]/55">px</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    blankHeight: Math.min(700, (current.blankHeight ?? 300) + 20),
                    isModified: true,
                  }))
                }
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* ===== 普通题目编辑界面 ===== */
          <div>
            {/* stimulus 图片编辑 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            {question.stimulusImageUrl ? (
              <div className="mb-3">
                <StimulusImageWithResize
                  url={question.stimulusImageUrl}
                  scale={question.stimulusImageScale ?? 0.5}
                  onScaleChange={(nextScale) =>
                    onUpdateQuestion((current) => ({
                      ...current,
                      stimulusImageScale: nextScale,
                      isModified: true,
                    }))
                  }
                  onRemove={() =>
                    onUpdateQuestion((current) => ({
                      ...current,
                      stimulusImageUrl: null,
                      stimulusImageScale: undefined,
                      stimulusImageAsset: null,
                      isModified: true,
                    }))
                  }
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[rgba(55,53,47,0.16)] bg-[#fafaf8] px-2.5 py-1.5 text-[10px] text-[#37352F]/50 transition hover:border-[rgba(55,53,47,0.32)] hover:text-[#37352F]/70"
              >
                <ImagePlus className="h-3 w-3" />
                {isZh ? "添加配图" : "Add image"}
              </button>
            )}

            {/* 题干编辑 */}
            <div className="mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
                {isZh ? "题干" : "Question"}
              </span>
              <div className="mt-1">
                <QuestionTiptapEditor
                  content={question.stimulusImageUrl ? stripMarkdownImages(question.questionText) : question.questionText}
                  editable={editingStem}
                  onFocus={() => undefined}
                  onEditStart={() => setEditingStem(true)}
                  onEditEnd={() => setEditingStem(false)}
                  onUpdate={(text) =>
                    onUpdateQuestion((current) => ({
                      ...current,
                      questionText: text,
                      isModified: true,
                    }))
                  }
                  className="px-0"
                  contentClassName="[&_.ProseMirror]:min-h-[40px] [&_.ProseMirror]:text-[13px]"
                  placeholderText={isZh ? "双击编辑题干" : "Double-click to edit the question"}
                  editingAppearance="seamless"
                />
              </div>
            </div>

            {/* MC 选项编辑 */}
            {mcOptions.length > 0 ? (
              <div className="mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
                  {isZh ? "选项" : "Options"}
                </span>
                <div className="mt-1 space-y-0.5">
                  {mcOptions.map((option, optionIndex) => (
                    <div
                      key={`${question.id}-edit-${option.label}`}
                      className="flex items-start gap-2 text-[13px] leading-7 text-[#37352F]/82"
                    >
                      <span className="w-5 shrink-0 pt-0.5 font-semibold text-[#37352F]">
                        {option.label}.
                      </span>
                      <QuestionTiptapEditor
                        content={option.text}
                        editable={editingOptionLabel === option.label}
                        onFocus={() => undefined}
                        onEditStart={() => setEditingOptionLabel(option.label)}
                        onEditEnd={() =>
                          setEditingOptionLabel((current) =>
                            current === option.label ? null : current,
                          )
                        }
                        onUpdate={(text) =>
                          onUpdateQuestion((current) => {
                            const nextOptions = ensureMcOptions(current.options);
                            nextOptions[optionIndex] = {
                              ...nextOptions[optionIndex],
                              text,
                            };
                            return {
                              ...current,
                              options: nextOptions,
                              isModified: true,
                            };
                          })
                        }
                        className="min-w-0 flex-1 px-0"
                        contentClassName="min-h-0 [&_.ProseMirror]:min-h-[24px] [&_.ProseMirror]:text-[13px] [&_.ProseMirror]:leading-7 [&_.ProseMirror]:text-[#37352F]/82 [&_img]:max-h-[120px] [&_.ProseMirror_p]:my-0"
                        placeholderText={
                          isZh
                            ? `编辑选项 ${option.label}`
                            : `Edit option ${option.label}`
                        }
                        editingAppearance="seamless"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 分值 + 难度 */}
            <div className="mb-3 space-y-2 rounded-lg border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] p-3">
              {/* 分值 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-[#8c7e68]">
                  {isZh ? "分值" : "Points"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateQuestion((current) => ({
                      ...current,
                      points: Math.max(1, (Number(current.points) || 1) - 1),
                      isModified: true,
                    }))
                  }
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-white"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={question.points}
                  onChange={(event) => {
                    const nextPoints = Math.max(1, Number(event.target.value) || 1);
                    onUpdateQuestion((current) => ({
                      ...current,
                      points: nextPoints,
                      isModified: true,
                    }));
                  }}
                  className="h-6 w-12 rounded-full border border-[rgba(55,53,47,0.12)] bg-white px-2 text-center text-xs text-[#37352F] outline-none"
                />
                <span className="text-xs text-[#37352F]/55">{isZh ? "分" : "pts"}</span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateQuestion((current) => ({
                      ...current,
                      points: Math.min(99, (Number(current.points) || 0) + 1),
                      isModified: true,
                    }))
                  }
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 难度 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[10px] uppercase tracking-[0.16em] text-[#8c7e68]">
                  {isZh ? "难度" : "Difficulty"}
                </span>
                {DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      onUpdateQuestion((current) => ({
                        ...current,
                        difficulty: option.value,
                        isModified: true,
                      }))
                    }
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                      question.difficulty === option.value
                        ? option.activeClassName
                        : "border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/60 hover:bg-[#faf8f3]",
                    )}
                  >
                    {isZh ? option.labelZh : option.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* 正确答案 */}
            {question.questionType === "MC" ? (
              <div className="mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
                  {isZh ? "正确答案" : "Correct answer"}
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {mcOptions.map((option, optionIndex) => {
                    const checked =
                      Boolean(option.isCorrect) ||
                      question.correctAnswer === option.label;
                    return (
                      <button
                        key={`${question.id}-${option.label}-answer`}
                        type="button"
                        onClick={() =>
                          onUpdateQuestion((current) => ({
                            ...current,
                            options: ensureMcOptions(current.options).map(
                              (item, itemIndex) => ({
                                ...item,
                                isCorrect: itemIndex === optionIndex,
                              }),
                            ),
                            correctAnswer: option.label,
                            isModified: true,
                          }))
                        }
                        className={cn(
                          "inline-flex min-w-[40px] items-center justify-center rounded-full border px-2.5 py-1.5 text-xs transition",
                          checked
                            ? "border-[#1f1f1f] bg-[#1f1f1f] text-white"
                            : "border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/72 hover:bg-[#faf8f3]",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
                  {isZh ? "正确答案" : "Correct answer"}
                </span>
                <div className="mt-1 rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2">
                  <QuestionTiptapEditor
                    content={question.correctAnswer}
                    editable={editingCorrectAnswer}
                    onFocus={() => undefined}
                    onEditStart={() => setEditingCorrectAnswer(true)}
                    onEditEnd={() => setEditingCorrectAnswer(false)}
                    onUpdate={(text) =>
                      onUpdateQuestion((current) => ({
                        ...current,
                        correctAnswer: text,
                        isModified: true,
                      }))
                    }
                    className="px-0"
                    contentClassName="[&_.ProseMirror]:min-h-[36px] [&_.ProseMirror]:text-[12px] [&_.ProseMirror]:leading-6 [&_p]:text-[12px] [&_p]:leading-6"
                    placeholderText={
                      isZh ? "双击编辑正确答案" : "Double-click to edit the correct answer"
                    }
                    editingAppearance="seamless"
                  />
                </div>
              </div>
            )}

            {/* 解析 */}
            <div className="mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
                {isZh ? "解析" : "Explanation"}
              </span>
              <div className="mt-1 rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2">
                <QuestionTiptapEditor
                  content={question.solutionSteps}
                  editable={editingSolutionSteps}
                  onFocus={() => undefined}
                  onEditStart={() => setEditingSolutionSteps(true)}
                  onEditEnd={() => setEditingSolutionSteps(false)}
                  onUpdate={(text) =>
                    onUpdateQuestion((current) => ({
                      ...current,
                      solutionSteps: text,
                      showSolution: true,
                      isModified: true,
                    }))
                  }
                  className="px-0"
                  contentClassName="[&_.ProseMirror]:min-h-[48px] [&_.ProseMirror]:text-[12px] [&_.ProseMirror]:leading-6 [&_p]:text-[12px] [&_p]:leading-6"
                  placeholderText={
                    isZh ? "双击编辑解析" : "Double-click to edit the explanation"
                  }
                  editingAppearance="seamless"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-t border-[rgba(55,53,47,0.08)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/60 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
            title={isZh ? "上移" : "Move up"}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/60 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
            title={isZh ? "下移" : "Move down"}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {!question.isBlankBlock ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (replaceMode) {
                    setReplaceMode(false);
                    return;
                  }
                  setReplaceMode(true);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition",
                  replaceMode
                    ? "border-[#37352F] bg-[#37352F] text-white"
                    : "border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/65 hover:bg-[#faf8f3]",
                )}
              >
                <RefreshCw className="h-3 w-3" />
                {replaceMode
                  ? isZh
                    ? "取消换题"
                    : "Cancel replace"
                  : isZh
                    ? "换一题"
                    : "Replace"}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onRemoveQuestion}
            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2 py-1 text-[10px] text-rose-600 transition hover:bg-rose-50"
          >
            <Trash2 className="h-3 w-3" />
            {isZh ? "删除" : "Delete"}
          </button>
        </div>

      </div>
      </div>
    </div>
  );
}
