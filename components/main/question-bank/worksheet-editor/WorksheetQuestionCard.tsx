"use client";

import { useState, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  SquareDashed,
  Trash2,
  Wand2,
  ArrowDown,
  ArrowUp,
  Minus,
  Plus,
  Search,
  Pen,
  Type,
  Eraser,
  Undo2,
  Trash,
  X,
  ImagePlus,
} from "lucide-react";
import QuestionTiptapEditor from "@/components/main/question-bank/shared/QuestionTiptapEditor";
import DrawingCanvas from "@/components/main/question-bank/worksheet-editor/DrawingCanvas";
import type { DrawingStroke } from "@/components/main/question-bank/worksheet-editor/DrawingCanvas";
import type { WorksheetEditorQuestion } from "@/components/main/question-bank/worksheet-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/worksheet-editor/utils";
import { cn } from "@/lib/utils";

const DRAW_COLORS = [
  { value: "#000000", label: "黑", className: "bg-[#1f1f1f]" },
  { value: "#dc2626", label: "红", className: "bg-red-600" },
  { value: "#2563eb", label: "蓝", className: "bg-blue-600" },
] as const;

const DRAW_WIDTHS = [
  { value: 1, label: "细" },
  { value: 3, label: "中" },
  { value: 5, label: "粗" },
] as const;

const DIFFICULTY_OPTIONS = [
  {
    value: 1 as const,
    label: "基础",
    activeClassName: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  {
    value: 2 as const,
    label: "常规",
    activeClassName: "border-amber-300 bg-amber-50 text-amber-700",
  },
  {
    value: 3 as const,
    label: "进阶",
    activeClassName: "border-rose-300 bg-rose-50 text-rose-700",
  },
  {
    value: 4 as const,
    label: "提高",
    activeClassName: "border-red-300 bg-red-50 text-red-700",
  },
];

function StimulusImageEditor({
  question,
  onUpdateQuestion,
}: {
  question: WorksheetEditorQuestion;
  onUpdateQuestion: (
    updater: (question: WorksheetEditorQuestion) => WorksheetEditorQuestion,
  ) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hovered, setHovered] = useState(false);

  const scale = question.stimulusImageScale ?? 0.5;

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

      // 清空 input 以便重复选择同一文件
      event.target.value = "";
    },
    [onUpdateQuestion],
  );

  const handleRemoveImage = useCallback(() => {
    onUpdateQuestion((current) => ({
      ...current,
      stimulusImageUrl: null,
      stimulusImageScale: undefined,
      stimulusImageAsset: null,
      isModified: true,
    }));
  }, [onUpdateQuestion]);

  const handleScaleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextScale = Number(event.target.value);
      onUpdateQuestion((current) => ({
        ...current,
        stimulusImageScale: nextScale,
        isModified: true,
      }));
    },
    [onUpdateQuestion],
  );

  // 隐藏的文件 input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFileSelect}
      onClick={(event) => event.stopPropagation()}
    />
  );

  // 没有图片时：显示添加按钮
  if (!question.stimulusImageUrl) {
    return (
      <div className="mt-2.5">
        {fileInput}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[rgba(55,53,47,0.16)] bg-[#fafaf8] px-3 py-2 text-[11px] text-[#37352F]/50 transition hover:border-[rgba(55,53,47,0.32)] hover:bg-[#f5f3ee] hover:text-[#37352F]/70"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          添加题目配图
        </button>
      </div>
    );
  }

  // 拖拽缩放
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startScale: number } | null>(null);

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const containerWidth = containerRef.current?.offsetWidth ?? 600;
      dragStartRef.current = { startX: event.clientX, startScale: scale };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!dragStartRef.current) return;
        const delta = moveEvent.clientX - dragStartRef.current.startX;
        const scaleDelta = delta / containerWidth;
        const nextScale = Math.min(1.0, Math.max(0.25, dragStartRef.current.startScale + scaleDelta));
        onUpdateQuestion((current) => ({
          ...current,
          stimulusImageScale: Math.round(nextScale * 20) / 20,
          isModified: true,
        }));
      };

      const handlePointerUp = () => {
        dragStartRef.current = null;
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
    [scale, onUpdateQuestion],
  );

  // 有图片时：显示图片 + 拖拽缩放手柄
  return (
    <div
      ref={containerRef}
      className="group/stimulus mt-2.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => event.stopPropagation()}
    >
      {fileInput}
      <div className="relative inline-block" style={{ width: `${Math.round(scale * 100)}%` }}>
        <img
          src={question.stimulusImageUrl}
          alt="Stimulus"
          referrerPolicy="no-referrer"
          className="w-full rounded-lg border border-[rgba(55,53,47,0.08)] object-scale-down bg-[#fafaf8]"
        />

        {/* 右上角删除按钮 */}
        <button
          type="button"
          onClick={handleRemoveImage}
          className={cn(
            "absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70",
            hovered ? "opacity-100" : "opacity-0",
          )}
          aria-label="删除图片"
        >
          <X className="h-3.5 w-3.5" />
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
            <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* 当前缩放百分比 - hover 时显示 */}
      {hovered ? (
        <div className="mt-1 text-[10px] text-[#37352F]/40">
          {Math.round(scale * 100)}%
        </div>
      ) : null}
    </div>
  );
}

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

export default function WorksheetQuestionCard({
  question,
  index,
  active,
  expanded,
  onFocus,
  onToggleExpand,
  onUpdateQuestion,
  onRemoveQuestion,
  onReplaceQuestion,
  onSearchSimilarQuestion,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDropBefore,
  canMoveUp,
  canMoveDown,
}: {
  question: WorksheetEditorQuestion;
  index: number;
  active: boolean;
  expanded: boolean;
  onFocus: () => void;
  onToggleExpand: () => void;
  onUpdateQuestion: (
    updater: (question: WorksheetEditorQuestion) => WorksheetEditorQuestion,
  ) => void;
  onRemoveQuestion: () => void;
  onReplaceQuestion: () => void;
  onSearchSimilarQuestion: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDropBefore: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [editingStem, setEditingStem] = useState(false);
  const [editingOptionLabel, setEditingOptionLabel] = useState<string | null>(null);
  const [editingCorrectAnswer, setEditingCorrectAnswer] = useState(false);
  const [editingSolutionSteps, setEditingSolutionSteps] = useState(false);
  const [blankMode, setBlankMode] = useState<"text" | "draw">("text");
  const [drawColor, setDrawColor] = useState("#000000");
  const [drawWidth, setDrawWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);
  const isEditing =
    editingStem ||
    editingOptionLabel !== null ||
    editingCorrectAnswer ||
    editingSolutionSteps;

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
  const mcOptions = question.questionType === "MC" ? ensureMcOptions(question.options) : [];
  const showToolbar = expanded;
  const revealControls = expanded || isEditing;

  // 空白块专用渲染
  if (question.isBlankBlock) {
    return (
      <article
        data-worksheet-question-card
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver();
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropBefore();
        }}
        className={cn(
          "group relative overflow-visible rounded-[20px] border-2 border-dashed pl-[18px] pr-[56px] py-4 transition-[border-color,box-shadow,background-color]",
          active
            ? "border-[rgba(55,53,47,0.28)] bg-white"
            : "border-[rgba(55,53,47,0.16)] bg-white hover:border-[rgba(55,53,47,0.28)]",
        )}
        onClick={() => {
          onFocus();
        }}
      >
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "absolute right-[-14px] top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#8c7e68] shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition active:cursor-grabbing",
            active
              ? "pointer-events-auto cursor-grab opacity-100"
              : "pointer-events-none cursor-default opacity-0 group-hover:pointer-events-auto group-hover:cursor-grab group-hover:opacity-100",
          )}
          aria-label="拖动排序"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className={cn(
          "absolute right-[-46px] top-14 flex flex-col gap-2 transition",
          active
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
        )}>
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={(event) => {
              event.stopPropagation();
              onMoveUp();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="上移"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={(event) => {
              event.stopPropagation();
              onMoveDown();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="下移"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveQuestion();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.12)] bg-white text-rose-600 transition hover:bg-rose-50"
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0 text-left">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#37352F]/40">
            <SquareDashed className="h-3.5 w-3.5" />
            <span className="font-medium">空白区域</span>
          </div>

          {/* 模式切换 + 画笔工具栏 */}
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5"
            onClick={(event) => { event.stopPropagation(); onFocus(); }}
          >
            {/* 文字 / 画笔 切换 */}
            <div className="inline-flex overflow-hidden rounded-lg border border-[rgba(55,53,47,0.12)]">
              <button
                type="button"
                onClick={() => {
                  setBlankMode("text");
                  setIsEraser(false);
                }}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition",
                  blankMode === "text"
                    ? "bg-[#37352F] text-white"
                    : "bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
                )}
              >
                <Type className="h-3.5 w-3.5" />
                文字
              </button>
              <button
                type="button"
                onClick={() => {
                  setBlankMode("draw");
                  setIsEraser(false);
                }}
                className={cn(
                  "inline-flex items-center gap-1 border-l border-[rgba(55,53,47,0.12)] px-2.5 py-1.5 text-[11px] font-medium transition",
                  blankMode === "draw"
                    ? "bg-[#37352F] text-white"
                    : "bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
                )}
              >
                <Pen className="h-3.5 w-3.5" />
                画笔
              </button>
            </div>

            {/* 画笔模式下的工具 */}
            {blankMode === "draw" && (
              <>
                {/* 分隔线 */}
                <div className="h-5 w-px bg-[rgba(55,53,47,0.12)]" />

                {/* 颜色选择 */}
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
                    title={item.label}
                  >
                    <span
                      className={cn("h-3.5 w-3.5 rounded-full", item.className)}
                    />
                  </button>
                ))}

                {/* 分隔线 */}
                <div className="h-5 w-px bg-[rgba(55,53,47,0.12)]" />

                {/* 线条粗细 */}
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
                    {item.label}
                  </button>
                ))}

                {/* 分隔线 */}
                <div className="h-5 w-px bg-[rgba(55,53,47,0.12)]" />

                {/* 橡皮擦 */}
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
                  橡皮
                </button>

                {/* 撤销 */}
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={parseStrokes(question.drawingData).length === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-[rgba(55,53,47,0.12)] bg-white px-2 py-1 text-[11px] font-medium text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  撤销
                </button>

                {/* 清除 */}
                <button
                  type="button"
                  onClick={handleClearDrawing}
                  disabled={parseStrokes(question.drawingData).length === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-[rgba(55,53,47,0.12)] bg-white px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Trash className="h-3.5 w-3.5" />
                  清除
                </button>
              </>
            )}
          </div>

          {/* 内容区域 */}
          <div className="mt-3">
            {blankMode === "text" ? (
              <textarea
                value={question.blankContent ?? ""}
                placeholder="输入文字内容（可选），留空则导出为空白区域"
                onClick={(event) => { event.stopPropagation(); onFocus(); }}
                onFocus={() => onFocus()}
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    blankContent: event.target.value,
                    isModified: true,
                  }))
                }
                className="w-full min-h-[200px] resize-y rounded-lg border border-dashed border-[rgba(55,53,47,0.12)] bg-[#faf9f6] px-4 py-3 text-sm leading-7 text-[#37352F] outline-none placeholder:text-[#37352F]/30 focus:border-[rgba(55,53,47,0.28)]"
              />
            ) : (
              <div onClick={(event) => { event.stopPropagation(); onFocus(); }}>
                <DrawingCanvas
                  width={760}
                  height={400}
                  strokes={parseStrokes(question.drawingData)}
                  color={drawColor}
                  lineWidth={drawWidth}
                  isEraser={isEraser}
                  onStrokesChange={handleStrokesChange}
                />
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-worksheet-question-card
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropBefore();
      }}
      className={cn(
        "group relative overflow-visible rounded-[20px] border px-[18px] py-4 transition-[border-color,box-shadow,background-color]",
        "border-transparent bg-white hover:border-[rgba(31,31,31,0.14)]",
        isEditing && "shadow-[0_16px_36px_rgba(15,23,42,0.10)]",
      )}
      onClick={() => {
        onFocus();
        if (!expanded) {
          onToggleExpand();
        }
      }}
    >
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "absolute right-[-14px] top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#8c7e68] shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition active:cursor-grabbing",
          "pointer-events-none cursor-default opacity-0 group-hover:pointer-events-auto group-hover:cursor-grab group-hover:opacity-100",
          isEditing && "opacity-100 pointer-events-auto cursor-grab",
        )}
        aria-label="拖动排序"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {showToolbar ? (
        <div
          className={cn(
            "absolute right-[-46px] top-14 hidden flex-col gap-2 transition xl:flex",
            revealControls
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
          )}
        >
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={(event) => {
              event.stopPropagation();
              onMoveUp();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="上移"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={(event) => {
              event.stopPropagation();
              onMoveDown();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="下移"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveQuestion();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.12)] bg-white text-rose-600 transition hover:bg-rose-50"
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="min-w-0 text-left">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#37352F]/30 transition group-hover:text-[#37352F]/42">
                <span className="font-medium text-[#37352F]/52">{index + 1}.</span>
                <span>{getQuestionTypeLabel(question.questionType)}</span>
                <span>{getDifficultyLabel(question.difficulty)}</span>
                <span>{question.points} 分</span>
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFocus();
                onToggleExpand();
              }}
              className={cn(
                "mt-0.5 shrink-0 rounded-lg p-1 text-[#37352F]/45 transition hover:bg-[#f5f5f0]",
                revealControls
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
              aria-label={expanded ? "收起题目详情" : "展开题目详情"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>

          <StimulusImageEditor
            question={question}
            onUpdateQuestion={onUpdateQuestion}
          />

          <div className="mt-2.5">
            <QuestionTiptapEditor
              content={question.questionText}
              editable={editingStem}
              onFocus={onFocus}
              onEditStart={() => {
                onFocus();
                setEditingStem(true);
              }}
              onEditEnd={() => setEditingStem(false)}
              onUpdate={(text) =>
                onUpdateQuestion((current) => ({
                  ...current,
                  questionText: text,
                  isModified: true,
                }))
              }
              className="px-0"
              contentClassName="[&_.ProseMirror]:min-h-[56px]"
              placeholderText="双击编辑题干"
              editingAppearance="seamless"
            />
          </div>

          {mcOptions.length > 0 ? (
            <div className="mt-3.5 space-y-1">
              {mcOptions.map((option, optionIndex) => (
                <div
                  key={`${question.id}-${option.label}`}
                  className="flex items-start gap-3 text-[15px] leading-8 text-[#37352F]/82"
                >
                  <span className="w-6 shrink-0 font-semibold text-[#37352F]">
                    {option.label}.
                  </span>
                  <QuestionTiptapEditor
                    content={option.text}
                    editable={editingOptionLabel === option.label}
                    onFocus={onFocus}
                    onEditStart={() => {
                      onFocus();
                      setEditingOptionLabel(option.label);
                    }}
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
                    contentClassName="min-h-0 [&_.ProseMirror]:min-h-[28px] [&_.ProseMirror]:text-[15px] [&_.ProseMirror]:leading-8 [&_.ProseMirror]:text-[#37352F]/82 [&_img]:max-h-[180px] [&_.ProseMirror_p]:my-0"
                    placeholderText={`双击编辑选项 ${option.label}`}
                    editingAppearance="seamless"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {showToolbar ? (
            <div className="mt-3.5 flex flex-wrap items-center justify-end gap-1.5 border-t border-[rgba(55,53,47,0.08)] pt-3.5">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSearchSimilarQuestion();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3]"
              >
                <Search className="h-4 w-4" />
                AI 检索
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReplaceQuestion();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3]"
              >
                <Wand2 className="h-4 w-4" />
                换一题
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3]"
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {expanded ? "收起解析" : "解析"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[rgba(55,53,47,0.08)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(55,53,47,0.1)] bg-[#faf8f3] px-2 py-1.5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#8c7e68]">
                分值
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    points: Math.max(1, (Number(current.points) || 1) - 1),
                    isModified: true,
                  }))
                }
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-white"
                aria-label="减少分值"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={1}
                step={1}
                value={question.points}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const nextPoints = Math.max(1, Number(event.target.value) || 1);
                  onUpdateQuestion((current) => ({
                    ...current,
                    points: nextPoints,
                    isModified: true,
                  }));
                }}
                className="h-7 w-14 rounded-full border border-[rgba(55,53,47,0.12)] bg-white px-2 text-center text-sm text-[#37352F] outline-none"
              />
              <span className="text-sm text-[#37352F]/58">分</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    points: Math.min(99, (Number(current.points) || 0) + 1),
                    isModified: true,
                  }))
                }
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/70 transition hover:bg-white"
                aria-label="增加分值"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] uppercase tracking-[0.2em] text-[#8c7e68]">
                难度
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
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    question.difficulty === option.value
                      ? option.activeClassName
                      : "border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/64 hover:bg-[#faf8f3]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {question.questionType === "MC" ? (
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                  正确答案
                </span>
                <div className="flex flex-wrap gap-2">
                  {mcOptions.map((option, optionIndex) => {
                    const checked =
                      Boolean(option.isCorrect) || question.correctAnswer === option.label;
                    return (
                      <button
                        key={`${question.id}-${option.label}-answer`}
                        type="button"
                        onClick={() =>
                          onUpdateQuestion((current) => ({
                            ...current,
                            options: ensureMcOptions(current.options).map((item, itemIndex) => ({
                              ...item,
                              isCorrect: itemIndex === optionIndex,
                            })),
                            correctAnswer: option.label,
                            isModified: true,
                          }))
                        }
                        className={cn(
                          "inline-flex min-w-[52px] items-center justify-center rounded-full border px-3 py-2 text-sm transition",
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
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              {question.questionType !== "MC" ? (
                <div className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                    正确答案
                  </span>
                  <div className="rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-4 py-3">
                    <QuestionTiptapEditor
                      content={question.correctAnswer}
                      editable={editingCorrectAnswer}
                      onFocus={onFocus}
                      onEditStart={() => {
                        onFocus();
                        setEditingCorrectAnswer(true);
                      }}
                      onEditEnd={() => setEditingCorrectAnswer(false)}
                      onUpdate={(text) =>
                        onUpdateQuestion((current) => ({
                          ...current,
                          correctAnswer: text,
                          isModified: true,
                        }))
                      }
                      className="px-0"
                      contentClassName="[&_.ProseMirror]:min-h-[72px] [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-7 [&_p]:text-sm [&_p]:leading-7"
                      placeholderText="双击编辑正确答案"
                      editingAppearance="seamless"
                    />
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                  解析
                </span>
                <div className="rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-4 py-3">
                  <QuestionTiptapEditor
                    content={question.solutionSteps}
                    editable={editingSolutionSteps}
                    onFocus={onFocus}
                    onEditStart={() => {
                      onFocus();
                      setEditingSolutionSteps(true);
                    }}
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
                    contentClassName="[&_.ProseMirror]:min-h-[72px] [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-7 [&_p]:text-sm [&_p]:leading-7"
                    placeholderText="双击编辑解析"
                    editingAppearance="seamless"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
