"use client";

import { Check, Pencil } from "lucide-react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import RichMarkdown from "@/components/shared/RichMarkdown";
import { cn } from "@/lib/utils";
import type {
  SearchPeekMeta,
  SearchPeekContentLibraryPayload,
} from "@/lib/search/peek-types";

type ContentLibraryPeekProps = {
  item: SearchPeekMeta;
  preview: SearchPeekContentLibraryPayload;
};

const CONTENT_TYPE_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  rubric: { label: "评分标准", bg: "bg-[#DDEDEA]/50", text: "text-success" },
  lesson_plan: { label: "教案", bg: "bg-[#EAE4F2]/50", text: "text-[#6940A5]" },
  question: { label: "题目", bg: "bg-[#DDEBF1]/50", text: "text-primary" },
  pbl: { label: "PBL", bg: "bg-[#F4DFEB]/50", text: "text-[#AD1A72]" },
  other: { label: "文档", bg: "bg-[#EBECED]/50", text: "text-default-400" },
};

function RubricBody({
  body,
}: {
  body: Extract<SearchPeekContentLibraryPayload["body"], { kind: "rubric" }>;
}) {
  return (
    <div className="space-y-4">
      {body.dimensions.map((dim) => (
        <div key={dim.id} className="rounded-xl border border-divider p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">{dim.name}</h4>
            <span className="text-xs text-default-400">
              权重 {dim.weight}%
            </span>
          </div>
          {dim.description ? (
            <p className="mb-3 text-xs text-default-500">{dim.description}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {dim.levels.map((level) => (
              <div
                key={level.id}
                className="rounded-lg bg-default-100 p-2.5"
              >
                <div className="mb-1 text-[10px] font-bold text-default-400">
                  {level.score} pts
                </div>
                <p className="text-[11px] leading-snug text-default-500">
                  {level.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {body.dimensionCount > body.dimensions.length ? (
        <p className="text-center text-xs text-default-400">
          还有 {body.dimensionCount - body.dimensions.length} 个维度
        </p>
      ) : null}
    </div>
  );
}

function ExerciseBody({
  body,
}: {
  body: Extract<SearchPeekContentLibraryPayload["body"], { kind: "exercise" }>;
}) {
  const correctOption = body.options.find((opt) => opt.isCorrect);
  const correctLabel = correctOption?.label ?? body.correctAnswer;

  return (
    <div className="space-y-4">
      <QuestionContentWithImages
        content={body.questionText}
        className="text-sm leading-relaxed"
        textClassName="text-default-500"
      />
      {body.options.length > 0 ? (
        <div className="space-y-2">
          {body.options.map((option) => (
            <div
              key={option.label}
              className={cn(
                "flex items-center gap-3 rounded-lg p-3",
                option.isCorrect
                  ? "border border-[#0F7B6C]/10 bg-[#DDEDEA]"
                  : "bg-default-100",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  option.isCorrect
                    ? "bg-[#0F7B6C] text-white"
                    : "border border-divider text-default-500",
                )}
              >
                {option.label}
              </span>
              <span className="text-xs">{option.text}</span>
              {option.isCorrect ? (
                <Check className="ml-auto h-4 w-4 text-success" strokeWidth={2.5} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {body.explanation ? (
        <div className="rounded-xl bg-default-100/50 p-4">
          <h4 className="mb-1 text-[11px] font-medium text-foreground/40">
            解析
          </h4>
          <p className="text-xs leading-relaxed text-default-500">
            {body.explanation}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function LessonPlanBody({
  body,
}: {
  body: Extract<SearchPeekContentLibraryPayload["body"], { kind: "lesson_plan" }>;
}) {
  return (
    <div className="space-y-1">
      {body.sections.map((section, index) => (
        <div key={section.id} className="flex gap-3 rounded-lg px-3 py-3 hover:bg-default-100">
          <span className="mt-0.5 text-[11px] font-bold tabular-nums text-default-400">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{section.title}</p>
            {section.summary ? (
              <p className="mt-0.5 text-xs text-default-500">{section.summary}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-default-400">
            {section.durationMinutes}m
          </span>
        </div>
      ))}
    </div>
  );
}

function PblBody({
  body,
}: {
  body: Extract<SearchPeekContentLibraryPayload["body"], { kind: "pbl_project" }>;
}) {
  return (
    <div className="space-y-4">
      {body.drivingQuestion ? (
        <div className="rounded-xl border-l-[3px] border-[#AD1A72] bg-default-100/50 px-4 py-3">
          <p className="text-sm italic text-foreground">{body.drivingQuestion}</p>
        </div>
      ) : null}
      {body.overviewText ? (
        <p className="text-sm text-default-500">{body.overviewText}</p>
      ) : null}
      {body.stages.length > 0 ? (
        <div className="space-y-2">
          {body.stages.map((stage) => (
            <div key={stage.stageNumber} className="flex gap-3 rounded-lg px-3 py-2.5 hover:bg-default-100">
              <span className="text-xs font-bold text-default-400">
                S{stage.stageNumber}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{stage.name}</p>
                {stage.objective ? (
                  <p className="text-xs text-default-500">{stage.objective}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextBody({
  body,
}: {
  body: Extract<SearchPeekContentLibraryPayload["body"], { kind: "text" }>;
}) {
  if (!body.excerpt.trim()) {
    return (
      <p className="text-sm text-default-400">
        暂无可预览内容
      </p>
    );
  }

  return (
    <RichMarkdown
      content={body.excerpt}
      className="prose-headings:mt-5 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-blockquote:border-l-[3px] prose-blockquote:border-divider prose-blockquote:pl-4 prose-blockquote:text-default-500"
    />
  );
}

function BodyRenderer({ body }: { body: SearchPeekContentLibraryPayload["body"] }) {
  switch (body.kind) {
    case "rubric":
      return <RubricBody body={body} />;
    case "exercise":
      return <ExerciseBody body={body} />;
    case "lesson_plan":
      return <LessonPlanBody body={body} />;
    case "pbl_project":
      return <PblBody body={body} />;
    case "text":
      return <TextBody body={body} />;
    default:
      return null;
  }
}

export default function ContentLibraryPeek({
  item,
  preview,
}: ContentLibraryPeekProps) {
  const typeInfo = CONTENT_TYPE_LABEL[preview.contentType] ?? CONTENT_TYPE_LABEL.other;
  const showSummary = preview.summaryText && preview.body.kind !== "text";

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero meta */}
      <div className="px-10 pt-10 pb-6 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium",
              typeInfo.bg,
              typeInfo.text,
            )}
          >
            {typeInfo.label}
          </span>
          {preview.courseName ? (
            <span className="text-xs text-default-400">
              {preview.courseName}
              {preview.unitName ? ` · ${preview.unitName}` : ""}
            </span>
          ) : null}
        </div>
        <h1 className="text-[1.75rem] font-semibold tracking-tight leading-tight text-foreground">
          {item.title}
        </h1>
        {showSummary ? (
          <p className="text-sm text-default-500">{preview.summaryText}</p>
        ) : null}
        {preview.sourceConversationTitle ? (
          <p className="text-xs text-default-400">
            来源对话：{preview.sourceConversationTitle}
          </p>
        ) : null}
      </div>

      {/* Body content */}
      <div className="px-10 pb-12">
        <BodyRenderer body={preview.body} />
      </div>

      {/* Note */}
      {preview.note ? (
        <div className="mx-10 mb-8 rounded-xl bg-[#FBF3DB]/30 px-5 py-4">
          <h3 className="mb-1 text-[11px] font-medium text-foreground/40">
            备注
          </h3>
          <p className="text-sm text-default-500">{preview.note}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ContentLibraryPeekFooter({ onEdit }: { onEdit?: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-all hover:bg-accent/90 active:scale-95"
    >
      <Pencil className="h-4 w-4" />
      <span>打开详情</span>
    </button>
  );
}
