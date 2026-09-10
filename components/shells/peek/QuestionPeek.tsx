"use client";

import { Check } from "lucide-react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import { cn } from "@/lib/utils";
import type {
  SearchPeekMeta,
  SearchPeekQuestionPayload,
} from "@/lib/search/peek-types";

type QuestionPeekProps = {
  item: SearchPeekMeta;
  preview: SearchPeekQuestionPayload;
};

const TYPE_LABEL: Record<string, string> = {
  MC: "选择题",
  FR: "问答题",
  fill_in: "填空题",
};

const TYPE_STYLE: Record<string, string> = {
  MC: "bg-[#EAE4F2]/50 text-[#6940A5]",
  FR: "bg-[#DDEBF1]/50 text-primary",
  fill_in: "bg-[#FAEBDD]/50 text-[#D9730D]",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: "bg-[#DDEDEA]/50 text-success",
  medium: "bg-[#FBF3DB]/50 text-[#DFAB01]",
  hard: "bg-[#FBE4E4]/50 text-danger",
};

function formatRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export default function QuestionPeek({ item, preview }: QuestionPeekProps) {
  const correctOption = preview.options.find((opt) => opt.isCorrect);
  const correctLabel = correctOption?.label ?? preview.correctAnswer;

  return (
    <div className="px-10 py-8 space-y-8">
      {/* Header info */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium",
              TYPE_STYLE[preview.questionType] ?? TYPE_STYLE.MC,
            )}
          >
            {TYPE_LABEL[preview.questionType] ?? preview.questionType}
          </span>
          <span
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium",
              DIFFICULTY_STYLE[preview.difficulty] ?? DIFFICULTY_STYLE.medium,
            )}
          >
            {DIFFICULTY_LABEL[preview.difficulty] ?? "Medium"}
          </span>
        </div>
        <h2 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {item.title}
        </h2>
        {item.subtitle ? (
          <p className="text-sm text-default-400">{item.subtitle}</p>
        ) : null}
      </section>

      {/* Question body */}
      <section className="space-y-6">
        <QuestionContentWithImages
          content={preview.questionText}
          className="text-lg leading-relaxed"
          textClassName="font-medium text-default-500"
        />

        {/* Options (MC only) */}
        {preview.options.length > 0 ? (
          <div className="space-y-3">
            {preview.options.map((option) => {
              const isCorrect = option.isCorrect;
              return (
                <div
                  key={option.label}
                  className={cn(
                    "flex items-center gap-4 rounded-lg p-4 transition-colors",
                    isCorrect
                      ? "border border-[#0F7B6C]/10 bg-[#DDEDEA] text-success"
                      : "bg-default-100 hover:bg-default-200",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isCorrect
                        ? "bg-[#0F7B6C] text-white"
                        : "border border-divider text-default-500",
                    )}
                  >
                    {option.label}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      isCorrect ? "font-semibold" : "font-medium",
                    )}
                  >
                    {option.text}
                  </span>
                  {isCorrect ? (
                    <Check
                      className="ml-auto h-5 w-5 shrink-0 text-success"
                      strokeWidth={2.5}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Correct answer + Explanation */}
      <section className="space-y-4">
        {correctLabel ? (
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <Check className="h-4 w-4" strokeWidth={2.5} />
            <span>正确答案：{correctLabel}</span>
          </div>
        ) : null}

        {preview.explanation ? (
          <div className="space-y-3 rounded-xl bg-default-100/50 p-6">
            <h3 className="text-[11px] font-medium text-foreground/40">
              解析
            </h3>
            <QuestionContentWithImages
              content={preview.explanation}
              className="text-sm leading-relaxed"
              textClassName="text-default-500"
            />
          </div>
        ) : null}
      </section>

      {/* Meta info */}
      <section className="grid grid-cols-1 gap-4 border-t border-default-100 pt-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground/40">
            知识点
          </span>
          <span className="text-sm font-medium text-primary hover:underline cursor-pointer">
            {preview.knowledgeClusterLabel || "未分类"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground/40">
            来源
          </span>
          <span
            className="truncate text-sm text-default-500"
            title={preview.sourceFileName ?? undefined}
          >
            {preview.sourceFileName ?? "暂无来源"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground/40">
            更新时间
          </span>
          <span className="text-sm text-default-500">
            {formatRelativeTime(item.updatedAt)}
          </span>
        </div>
      </section>
    </div>
  );
}
