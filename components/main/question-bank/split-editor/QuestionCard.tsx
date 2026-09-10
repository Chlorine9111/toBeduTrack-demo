"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import QuestionTiptapEditor from "@/components/main/question-bank/shared/QuestionTiptapEditor";
import { QUESTION_EDITOR_EXERCISE_TYPE_OPTIONS } from "@/lib/question-bank/editor-constants";
import { cn } from "@/lib/utils";
import type { QuestionBankSplitQuestion } from "@/components/main/question-bank/split-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
  normalizeTagList,
} from "@/components/main/question-bank/split-editor/utils";

function ensureMcOptions(
  options: QuestionBankSplitQuestion["options"],
): NonNullable<QuestionBankSplitQuestion["options"]> {
  const base = options?.slice(0, 4) ?? [];
  const labels = ["A", "B", "C", "D"];

  return labels.map((label, index) => ({
    label,
    text: base[index]?.text ?? "",
    isCorrect: base[index]?.isCorrect ?? index === 0,
  }));
}

const DIFFICULTY_OPTIONS = [1, 2, 3, 4] as const;

export default function QuestionCard({
  question,
  index,
  expanded,
  documentDefaults,
  busy,
  onToggleExpand,
  onUpdateQuestion,
  onReplaceRequest,
  onRewriteQuestion,
  onRemoveQuestion,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: {
  question: QuestionBankSplitQuestion;
  index: number;
  expanded: boolean;
  busy: boolean;
  documentDefaults: {
    courseLabel: string;
    unitLabel: string;
  };
  onToggleExpand: () => void;
  onUpdateQuestion: (
    updater: (question: QuestionBankSplitQuestion) => QuestionBankSplitQuestion,
  ) => void;
  onReplaceRequest: () => void;
  onRewriteQuestion: () => void;
  onRemoveQuestion: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
}) {
  const [editingStem, setEditingStem] = useState(false);
  const [editingOptionLabel, setEditingOptionLabel] = useState<string | null>(null);
  const mcOptions = question.exerciseType === "MC" ? ensureMcOptions(question.options) : [];
  const isEditing = editingStem || editingOptionLabel !== null;
  const revealControls = expanded || isEditing;
  const isKeyQuestion = question.tags?.includes("重点题") ?? false;
  const isDisputed = question.reviewFlag === "disputed";
  const isSuspicious = isDisputed || question.isLowConfidence;

  return (
    <article
      data-question-id={question.id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropBefore();
      }}
      className={cn(
        "group relative overflow-visible rounded-[20px] border px-[18px] py-4 transition-[border-color,box-shadow,background-color]",
        "border-transparent bg-white hover:border-[rgba(31,31,31,0.14)]",
        isEditing && "shadow-[0_16px_36px_rgba(15,23,42,0.10)]",
        isSuspicious && "bg-amber-50/40",
      )}
    >
      <button
        type="button"
        draggable={!busy}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "absolute right-[-14px] top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white text-[#8c7e68] shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition active:cursor-grabbing",
          "pointer-events-none cursor-default opacity-0 group-hover:pointer-events-auto group-hover:cursor-grab group-hover:opacity-100",
          isEditing && "pointer-events-auto cursor-grab opacity-100",
        )}
        aria-label="拖动排序"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#37352F]/30 transition group-hover:text-[#37352F]/42">
              <span className="font-medium text-[#37352F]/52">{index + 1}.</span>
              <span>{getQuestionTypeLabel(question.exerciseType)}</span>
              <span>{getDifficultyLabel(question.difficulty)}</span>
              {question.sourcePageStart ? <span>页码 {question.sourcePageStart}</span> : null}
              {isDisputed ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium tracking-normal text-amber-700">
                  存疑
                </span>
              ) : null}
              {!isDisputed && question.isLowConfidence ? (
                <span className="text-amber-700">低置信度</span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleExpand}
            className={cn(
              "mt-0.5 shrink-0 rounded-lg p-1 text-[#37352F]/45 transition hover:bg-[#f5f5f0]",
              revealControls ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label={expanded ? "收起题目详情" : "展开题目详情"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-2.5">
          <QuestionTiptapEditor
            content={question.questionText}
            editable={editingStem}
            onEditStart={() => setEditingStem(true)}
            onEditEnd={() => setEditingStem(false)}
            onUpdate={(text) =>
              onUpdateQuestion((current) => ({
                ...current,
                questionText: text,
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
                      };
                    })
                  }
                  className="min-w-0 flex-1 px-0"
                  contentClassName="min-h-0 [&_.ProseMirror]:min-h-[28px] [&_.ProseMirror]:text-[15px] [&_.ProseMirror]:leading-8 [&_.ProseMirror]:text-[#37352F]/82 [&_img]:max-h-[180px]"
                  placeholderText={`双击编辑选项 ${option.label}`}
                  editingAppearance="seamless"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[rgba(55,53,47,0.08)] pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[#8c7e68]">
              编辑区
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={onRewriteQuestion}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              AI 修案
            </button>
            <button
              type="button"
              onClick={onReplaceRequest}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3]"
            >
              <Wand2 className="h-4 w-4" />
              换一题
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateQuestion((current) => ({
                  ...current,
                  tags: isKeyQuestion
                    ? (current.tags ?? []).filter((item) => item !== "重点题")
                    : Array.from(new Set([...(current.tags ?? []), "重点题"])),
                }))
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
                isKeyQuestion
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
              )}
            >
              <Star className="h-4 w-4" />
              关键
            </button>
            <button
              type="button"
              onClick={onRemoveQuestion}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-rose-600 transition hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                题型
              </span>
              <select
                value={question.exerciseType}
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    exerciseType: event.target.value as QuestionBankSplitQuestion["exerciseType"],
                    options:
                      event.target.value === "MC"
                        ? ensureMcOptions(current.options)
                        : null,
                    correctAnswer:
                      event.target.value === "MC"
                        ? current.correctAnswer || "A"
                        : current.correctAnswer,
                  }))
                }
                className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
              >
                {QUESTION_EDITOR_EXERCISE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                难度
              </span>
              <select
                value={question.difficulty}
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    difficulty: Number(event.target.value),
                  }))
                }
                className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
              >
                {DIFFICULTY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} · {getDifficultyLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {question.exerciseType === "MC" ? (
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                正确答案
              </span>
              <div className="flex flex-wrap gap-2">
                {mcOptions.map((option, optionIndex) => {
                  const checked = Boolean(option.isCorrect) || question.correctAnswer === option.label;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() =>
                        onUpdateQuestion((current) => {
                          const nextOptions = ensureMcOptions(current.options).map((item, itemIndex) => ({
                            ...item,
                            isCorrect: itemIndex === optionIndex,
                          }));
                          return {
                            ...current,
                            options: nextOptions,
                            correctAnswer: option.label,
                          };
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition",
                        checked
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/70 hover:bg-[#faf8f3]",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                参考答案
              </span>
              <input
                value={question.correctAnswer ?? ""}
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    correctAnswer: event.target.value,
                  }))
                }
                className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
                placeholder="填写答案或评分要点"
              />
            </label>
          )}

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
              解析
            </span>
            <textarea
              value={question.solutionSteps ?? ""}
              onChange={(event) =>
                onUpdateQuestion((current) => ({
                  ...current,
                  solutionSteps: event.target.value,
                  showSolution: true,
                }))
              }
              rows={4}
              className="rounded-2xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm leading-6 text-[#37352F] outline-none"
              placeholder="补充解析、评分逻辑或关键步骤"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                知识点 / AP 标签
              </span>
              <input
                value={(question.knowledgePoints ?? []).join("、")}
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    knowledgePoints: normalizeTagList(event.target.value),
                  }))
                }
                className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
                placeholder="例如 equilibrium、stoichiometry、Unit 6"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c7e68]">
                补充标签
              </span>
              <input
                value={(question.tags ?? []).join("、")}
                onChange={(event) =>
                  onUpdateQuestion((current) => ({
                    ...current,
                    tags: normalizeTagList(event.target.value),
                  }))
                }
                className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
                placeholder="例如 data analysis、lab、重点题"
              />
            </label>
          </div>

          {(documentDefaults.courseLabel || documentDefaults.unitLabel) ? (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-4 py-3 text-sm text-[#37352F]/72">
              {documentDefaults.courseLabel ? (
                <span className="rounded-full bg-white px-3 py-1">
                  {documentDefaults.courseLabel}
                </span>
              ) : null}
              {documentDefaults.unitLabel ? (
                <span className="rounded-full bg-white px-3 py-1">
                  {documentDefaults.unitLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
