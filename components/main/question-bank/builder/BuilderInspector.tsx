"use client";

import { ArrowDown, ArrowUp, Copy, GripVertical, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  BuilderManualQuestionType,
  BuilderStructureInsertionMode,
  BuilderQuestionContentTargetRef,
  BuilderQuestionImageRef,
  BuilderQuestionTextBlockRef,
} from "@/lib/worksheet/builder-manipulation";
import { formatBuilderQuestionTypeLabel } from "@/lib/worksheet/builder-manipulation";
import type { WorksheetBuilderQuestionInstance } from "@/lib/worksheet/builder-types";

type BuilderInspectorProps = {
  items: WorksheetBuilderQuestionInstance[];
  activeItem?: WorksheetBuilderQuestionInstance | null;
  activeImages?: BuilderQuestionImageRef[];
  activeTextBlocks?: BuilderQuestionTextBlockRef[];
  activeContentTargets?: BuilderQuestionContentTargetRef[];
  activeInstanceId?: string | null;
  busyInstanceId?: string | null;
  aiLoading?: boolean;
  aiTextBlockLeafId?: string | null;
  aiTextBlockLoading?: boolean;
  newQuestionType?: BuilderManualQuestionType;
  structureInsertMode?: BuilderStructureInsertionMode;
  onSelect?: (instanceId: string) => void;
  onNewQuestionTypeChange?: (questionType: BuilderManualQuestionType) => void;
  onStructureInsertModeChange?: (mode: BuilderStructureInsertionMode) => void;
  onInsertQuestion?: () => Promise<void> | void;
  onInsertSectionTitle?: (title: string) => Promise<void> | void;
  onInsertInstruction?: (text: string) => Promise<void> | void;
  onInsertPageBreak?: () => Promise<void> | void;
  onInsertImage?: (file: File, targetKey: string) => Promise<void> | void;
  onReplaceImage?: (imageIndex: number, file: File) => Promise<void> | void;
  onRemoveImage?: (imageIndex: number) => Promise<void> | void;
  onUpdateTextBlock?: (leafId: string, text: string) => Promise<void> | void;
  onInsertTextBlock?: (targetKey: string, text: string) => Promise<void> | void;
  onUpdateDifficulty?: (difficulty: 1 | 2 | 3 | 4) => Promise<void> | void;
  onConvertQuestionType?: (questionType: BuilderManualQuestionType) => Promise<void> | void;
  onSetFrqAnswerSpace?: (answerSpace: "small" | "medium" | "large") => Promise<void> | void;
  onSetTfCorrectAnswer?: (correctAnswer: boolean) => Promise<void> | void;
  onSetMcCorrectOption?: (optionLabel: string) => Promise<void> | void;
  onAddMcOption?: () => Promise<void> | void;
  onRemoveMcOption?: (optionLabel: string) => Promise<void> | void;
  onOpenAiEdit?: () => void;
  onOpenTextBlockAiEdit?: (leafId: string) => void;
  onMoveUp: (instanceId: string) => Promise<void> | void;
  onMoveDown: (instanceId: string) => Promise<void> | void;
  onDuplicate: (instanceId: string) => Promise<void> | void;
  onDelete: (instanceId: string) => Promise<void> | void;
};

function TextBlockEditor({
  block,
  disabled,
  aiLoading,
  onOpenAiEdit,
  onSave,
}: {
  block: BuilderQuestionTextBlockRef;
  disabled: boolean;
  aiLoading?: boolean;
  onOpenAiEdit?: (leafId: string) => Promise<void> | void;
  onSave?: (leafId: string, text: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(block.text);

  useEffect(() => {
    setValue(block.text);
  }, [block.leafId, block.text]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-600">{block.label}</p>
        {onOpenAiEdit ? (
          <button
            type="button"
            disabled={disabled || aiLoading}
            onClick={() => void onOpenAiEdit(block.leafId)}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",
              disabled || aiLoading
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white hover:bg-slate-800",
            )}
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI 改写
          </button>
        ) : null}
      </div>
      <textarea
        value={value}
        disabled={disabled || aiLoading}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value !== block.text) {
            void onSave?.(block.leafId, value);
          }
        }}
        className={cn(
          "mt-2 min-h-[96px] w-full rounded-xl border px-3 py-2 text-sm leading-6 outline-hidden transition",
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-slate-200 bg-white text-slate-700 focus:border-slate-400",
        )}
      />
    </div>
  );
}

export default function BuilderInspector({
  items,
  activeItem,
  activeImages = [],
  activeTextBlocks = [],
  activeContentTargets = [],
  activeInstanceId,
  busyInstanceId,
  aiLoading = false,
  aiTextBlockLeafId,
  aiTextBlockLoading = false,
  newQuestionType = "fill",
  structureInsertMode = "append-end",
  onSelect,
  onNewQuestionTypeChange,
  onStructureInsertModeChange,
  onInsertQuestion,
  onInsertSectionTitle,
  onInsertInstruction,
  onInsertPageBreak,
  onInsertImage,
  onReplaceImage,
  onRemoveImage,
  onUpdateTextBlock,
  onInsertTextBlock,
  onUpdateDifficulty,
  onConvertQuestionType,
  onSetFrqAnswerSpace,
  onSetTfCorrectAnswer,
  onSetMcCorrectOption,
  onAddMcOption,
  onRemoveMcOption,
  onOpenAiEdit,
  onOpenTextBlockAiEdit,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: BuilderInspectorProps) {
  const [insertTargetKey, setInsertTargetKey] = useState("");
  const [insertTextValue, setInsertTextValue] = useState("");
  const [sectionTitleValue, setSectionTitleValue] = useState("");
  const [instructionValue, setInstructionValue] = useState("");

  useEffect(() => {
    if (activeContentTargets.length === 0) {
      setInsertTargetKey("");
      return;
    }

    if (!activeContentTargets.some((target) => target.key === insertTargetKey)) {
      setInsertTargetKey(activeContentTargets[0]?.key ?? "");
    }
  }, [activeContentTargets, insertTargetKey]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Question Controls
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-900">题目控制</h2>
        <p className="mt-1 text-sm text-slate-500">
          对当前组卷稿里的题目实例做重排、复制和删除，不影响题库原题。
        </p>
        <div className="mt-4 grid gap-2">
          <select
            value={newQuestionType}
            disabled={Boolean(busyInstanceId)}
            onChange={(event) =>
              onNewQuestionTypeChange?.(event.target.value as BuilderManualQuestionType)
            }
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
              busyInstanceId
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : "border-slate-200 bg-white text-slate-700",
            )}
          >
            <option value="fill">新增填空题</option>
            <option value="mc">新增选择题</option>
            <option value="frq">新增问答题</option>
            <option value="tf">新增判断题</option>
          </select>

          <button
            type="button"
            onClick={() => void onInsertQuestion?.()}
            disabled={Boolean(busyInstanceId)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
              busyInstanceId
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white hover:bg-slate-800",
            )}
          >
            {busyInstanceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            插入空白题模板
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">插入位置</p>
          <select
            value={structureInsertMode}
            disabled={Boolean(busyInstanceId)}
            onChange={(event) =>
              onStructureInsertModeChange?.(
                event.target.value as BuilderStructureInsertionMode,
              )
            }
            className={cn(
              "mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
              busyInstanceId
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : "border-slate-200 bg-white text-slate-700",
            )}
          >
            <option value="before-active">插入到当前题前</option>
            <option value="after-active">插入到当前题后</option>
            <option value="append-end">插入到文末</option>
          </select>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            未选中题目时会自动回落到文末。
          </p>

          <input
            value={sectionTitleValue}
            disabled={Boolean(busyInstanceId)}
            onChange={(event) => setSectionTitleValue(event.target.value)}
            placeholder="输入分组标题，例如 Part A"
            className={cn(
              "mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
              busyInstanceId
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : "border-slate-200 bg-white text-slate-700",
            )}
          />
          <button
            type="button"
            disabled={Boolean(busyInstanceId) || !sectionTitleValue.trim()}
            onClick={() => {
              void onInsertSectionTitle?.(sectionTitleValue.trim());
              setSectionTitleValue("");
            }}
            className={cn(
              "mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
              busyInstanceId || !sectionTitleValue.trim()
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white hover:bg-slate-800",
            )}
          >
            <Plus className="h-4 w-4" />
            插入分组标题
          </button>

          <textarea
            value={instructionValue}
            disabled={Boolean(busyInstanceId)}
            onChange={(event) => setInstructionValue(event.target.value)}
            placeholder="输入说明文字，例如本部分为基础题"
            className={cn(
              "mt-2 min-h-[88px] w-full rounded-xl border px-3 py-2 text-sm leading-6 outline-hidden transition",
              busyInstanceId
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : "border-slate-200 bg-white text-slate-700",
            )}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={Boolean(busyInstanceId) || !instructionValue.trim()}
              onClick={() => {
                void onInsertInstruction?.(instructionValue.trim());
                setInstructionValue("");
              }}
              className={cn(
                "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition",
                busyInstanceId || !instructionValue.trim()
                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                  : "bg-slate-900 text-white hover:bg-slate-800",
              )}
            >
              插入说明块
            </button>
            <button
              type="button"
              disabled={Boolean(busyInstanceId)}
              onClick={() => void onInsertPageBreak?.()}
              className={cn(
                "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition",
                busyInstanceId
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              插入分页
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {activeItem ? (
          <section className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Active Question
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              第 {activeItem.number} 题
            </p>
            <p className="mt-1 text-sm text-slate-600">{activeItem.title}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{formatBuilderQuestionTypeLabel(activeItem.block.data.questionType)}</span>
              <span>难度 {activeItem.difficulty}</span>
              {activeItem.sourceLabel ? <span>{activeItem.sourceLabel}</span> : null}
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              {onOpenAiEdit ? (
                <button
                  type="button"
                  onClick={() => void onOpenAiEdit()}
                  disabled={Boolean(busyInstanceId) || aiLoading}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                    busyInstanceId || aiLoading
                      ? "cursor-not-allowed bg-slate-100 text-slate-400"
                      : "bg-slate-900 text-white hover:bg-slate-800",
                  )}
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  AI 修改当前题
                </button>
              ) : null}

              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-600">题目设置</p>
                <div className="mt-3 grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs text-slate-500">题型</span>
                    <select
                      value={activeItem.block.data.questionType}
                      disabled={Boolean(busyInstanceId)}
                      onChange={(event) =>
                        void onConvertQuestionType?.(
                          event.target.value as BuilderManualQuestionType,
                        )
                      }
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
                        busyInstanceId
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-slate-200 bg-white text-slate-700",
                      )}
                    >
                      <option value="fill">填空题</option>
                      <option value="mc">选择题</option>
                      <option value="frq">问答题</option>
                      <option value="tf">判断题</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs text-slate-500">难度</span>
                    <select
                      value={String(activeItem.difficulty)}
                      disabled={Boolean(busyInstanceId)}
                      onChange={(event) =>
                        void onUpdateDifficulty?.(Number(event.target.value) as 1 | 2 | 3 | 4)
                      }
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
                        busyInstanceId
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-slate-200 bg-white text-slate-700",
                      )}
                    >
                      <option value="1">1 - 基础</option>
                      <option value="2">2 - 常规</option>
                      <option value="3">3 - 进阶</option>
                      <option value="4">4 - 挑战</option>
                    </select>
                  </label>

                  {activeItem.block.data.questionType === "frq"
                    ? (() => {
                        const frqData = activeItem.block.data;
                        return (
                          <label className="grid gap-1.5">
                            <span className="text-xs text-slate-500">答题区大小</span>
                            <select
                              value={frqData.answerSpace ?? "medium"}
                              disabled={Boolean(busyInstanceId)}
                              onChange={(event) =>
                                void onSetFrqAnswerSpace?.(
                                  event.target.value as "small" | "medium" | "large",
                                )
                              }
                              className={cn(
                                "w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
                                busyInstanceId
                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                  : "border-slate-200 bg-white text-slate-700",
                              )}
                            >
                              <option value="small">小</option>
                              <option value="medium">中</option>
                              <option value="large">大</option>
                            </select>
                          </label>
                        );
                      })()
                    : null}

                  {activeItem.block.data.questionType === "tf"
                    ? (() => {
                        const tfData = activeItem.block.data;
                        return (
                          <label className="grid gap-1.5">
                            <span className="text-xs text-slate-500">正确答案</span>
                            <select
                              value={
                                tfData.correctAnswer === true
                                  ? "true"
                                  : tfData.correctAnswer === false
                                    ? "false"
                                    : ""
                              }
                              disabled={Boolean(busyInstanceId)}
                              onChange={(event) => {
                                if (!event.target.value) return;
                                void onSetTfCorrectAnswer?.(event.target.value === "true");
                              }}
                              className={cn(
                                "w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
                                busyInstanceId
                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                  : "border-slate-200 bg-white text-slate-700",
                              )}
                            >
                              <option value="">请选择</option>
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          </label>
                        );
                      })()
                    : null}

                  {activeItem.block.data.questionType === "mc"
                    ? (() => {
                        const mcData = activeItem.block.data;
                        return (
                          <div className="grid gap-3">
                            <label className="grid gap-1.5">
                              <span className="text-xs text-slate-500">正确选项</span>
                              <select
                                value={mcData.correctAnswer ?? ""}
                                disabled={Boolean(busyInstanceId)}
                                onChange={(event) => {
                                  if (!event.target.value) return;
                                  void onSetMcCorrectOption?.(event.target.value);
                                }}
                                className={cn(
                                  "w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
                                  busyInstanceId
                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                    : "border-slate-200 bg-white text-slate-700",
                                )}
                              >
                                {mcData.options.map((option) => (
                                  <option key={option.label} value={option.label}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-medium text-slate-600">选项结构</p>
                                <button
                                  type="button"
                                  onClick={() => void onAddMcOption?.()}
                                  disabled={Boolean(busyInstanceId)}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition",
                                    busyInstanceId
                                      ? "cursor-not-allowed bg-slate-200 text-slate-500"
                                      : "bg-slate-900 text-white hover:bg-slate-800",
                                  )}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  新增选项
                                </button>
                              </div>

                              <div className="mt-3 space-y-2">
                                {mcData.options.map((option) => (
                                  <div
                                    key={option.label}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-slate-700">
                                        选项 {option.label}
                                        {option.label === mcData.correctAnswer ? " · 正确答案" : ""}
                                      </p>
                                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                        {option.text || "空白选项"}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void onRemoveMcOption?.(option.label)}
                                      disabled={Boolean(busyInstanceId) || mcData.options.length <= 2}
                                      className={cn(
                                        "inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs transition",
                                        busyInstanceId || mcData.options.length <= 2
                                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                          : "border-rose-200 text-rose-600 hover:bg-rose-50",
                                      )}
                                    >
                                      删除
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    : null}
                </div>
              </div>

              <p className="mt-3 text-xs font-medium text-slate-600">结构化文本块</p>
              {activeTextBlocks.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                  当前题目还没有独立文本块可编辑。
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {activeTextBlocks.map((block) => (
                    <TextBlockEditor
                      key={block.leafId}
                      block={block}
                      disabled={Boolean(busyInstanceId)}
                      aiLoading={aiTextBlockLoading && aiTextBlockLeafId === block.leafId}
                      onOpenAiEdit={onOpenTextBlockAiEdit}
                      onSave={onUpdateTextBlock}
                    />
                  ))}
                </div>
              )}

              {activeContentTargets.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium text-slate-600">新增文本块</p>
                  <select
                    value={insertTargetKey}
                    disabled={Boolean(busyInstanceId)}
                    onChange={(event) => setInsertTargetKey(event.target.value)}
                    className={cn(
                      "mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
                      busyInstanceId
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {activeContentTargets.map((target) => (
                      <option key={target.key} value={target.key}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={insertTextValue}
                    disabled={Boolean(busyInstanceId)}
                    onChange={(event) => setInsertTextValue(event.target.value)}
                    placeholder="输入要插入的新文本块内容"
                    className={cn(
                      "mt-2 min-h-[96px] w-full rounded-xl border px-3 py-2 text-sm leading-6 outline-hidden transition",
                      busyInstanceId
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "border-slate-200 bg-white text-slate-700 focus:border-slate-400",
                    )}
                  />
                  <button
                    type="button"
                    disabled={Boolean(busyInstanceId) || !insertTargetKey || !insertTextValue.trim()}
                    onClick={() => {
                      void onInsertTextBlock?.(insertTargetKey, insertTextValue.trim());
                      setInsertTextValue("");
                    }}
                    className={cn(
                      "mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                      busyInstanceId || !insertTargetKey || !insertTextValue.trim()
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800",
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    添加文本块
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-600">题目图片</p>
                  {activeContentTargets.length > 0 ? (
                    <select
                      value={insertTargetKey}
                      disabled={Boolean(busyInstanceId)}
                      onChange={(event) => setInsertTargetKey(event.target.value)}
                      className={cn(
                        "mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-hidden",
                        busyInstanceId
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-slate-200 bg-white text-slate-700",
                      )}
                    >
                      {activeContentTargets.map((target) => (
                        <option key={target.key} value={target.key}>
                          插入到{target.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                    busyInstanceId
                      ? "cursor-not-allowed bg-slate-200 text-slate-500"
                      : "bg-slate-900 text-white hover:bg-slate-800",
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加图片
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={Boolean(busyInstanceId)}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file && insertTargetKey) {
                        void onInsertImage?.(file, insertTargetKey);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {activeImages.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                  当前题目还没有图片。可以上传新图片插入到这道题中。
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {activeImages.map((image) => (
                    <div
                      key={`${image.src}-${image.imageIndex}`}
                      className="rounded-2xl border border-slate-200 bg-white p-3"
                    >
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        <img
                          src={image.src}
                          alt={image.alt || image.label}
                          className="h-36 w-full object-contain"
                        />
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-700">
                        {image.label}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {image.alt || `图片 ${image.imageIndex + 1}`}
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label
                          className={cn(
                            "inline-flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-xs transition",
                            busyInstanceId
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          替换
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            disabled={Boolean(busyInstanceId)}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                void onReplaceImage?.(image.imageIndex, file);
                              }
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => void onRemoveImage?.(image.imageIndex)}
                          disabled={Boolean(busyInstanceId)}
                          className={cn(
                            "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs transition",
                            busyInstanceId
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : "border-rose-200 text-rose-600 hover:bg-rose-50",
                          )}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            还没有导入题目。先从左侧题库导入几道题。
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => {
              const busy = busyInstanceId === item.instanceId;
              const active = activeInstanceId === item.instanceId;

              return (
                <section
                  key={item.instanceId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect?.(item.instanceId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(item.instanceId);
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded-2xl border px-4 py-4 text-left transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900/20",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-semibold",
                            active
                              ? "bg-white/10 text-white"
                              : "bg-slate-100 text-slate-700",
                          )}
                        >
                          {item.number}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]",
                            active
                              ? "bg-white/10 text-slate-100"
                              : "bg-slate-100 text-slate-500",
                          )}
                        >
                          <GripVertical className="h-3 w-3" />
                          {formatBuilderQuestionTypeLabel(item.block.data.questionType)}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm font-medium">{item.title}</p>
                      <div
                        className={cn(
                          "mt-2 flex flex-wrap gap-2 text-xs",
                          active ? "text-slate-200" : "text-slate-500",
                        )}
                      >
                        <span>难度 {item.difficulty}</span>
                        {item.sourceLabel ? <span>{item.sourceLabel}</span> : null}
                      </div>
                    </div>
                    {busy ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void onMoveUp(item.instanceId)}
                      disabled={busy || index === 0}
                      className={cn(
                        "inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs transition",
                        active
                          ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                        (busy || index === 0) && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                      上移
                    </button>

                    <button
                      type="button"
                      onClick={() => void onMoveDown(item.instanceId)}
                      disabled={busy || index === items.length - 1}
                      className={cn(
                        "inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs transition",
                        active
                          ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                        (busy || index === items.length - 1) && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                      下移
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDuplicate(item.instanceId)}
                      disabled={busy}
                      className={cn(
                        "inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs transition",
                        active
                          ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                        busy && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDelete(item.instanceId)}
                      disabled={busy}
                      className={cn(
                        "inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs transition",
                        active
                          ? "border-rose-200/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
                          : "border-rose-200 text-rose-600 hover:bg-rose-50",
                        busy && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
