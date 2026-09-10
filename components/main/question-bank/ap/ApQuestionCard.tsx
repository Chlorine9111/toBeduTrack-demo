"use client";

import { memo, useEffect } from "react";
import QuestionContentWithImages, {
  preloadQuestionContentRender,
} from "@/components/shared/QuestionContentWithImages";
import type { ApQuestionBankSearchResultRow } from "@/lib/question-bank/ap-types";
import { cn } from "@/lib/utils";

export function apDifficultyLabel(difficulty: string) {
  switch (difficulty) {
    case "easy":
      return "Easy";
    case "medium":
      return "Medium";
    case "hard":
      return "Hard";
    default:
      return difficulty;
  }
}

export function apDifficultyTone(difficulty: string) {
  switch (difficulty) {
    case "easy":
      return "bg-emerald-50 text-emerald-700";
    case "medium":
      return "bg-amber-50 text-amber-700";
    case "hard":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function apCourseLabel(course: string) {
  const labels: Record<string, string> = {
    APES: "AP Environmental Science",
    AP_BIO: "AP Biology",
    AP_CHEM: "AP Chemistry",
    AP_CALC_AB: "AP Calculus AB",
    AP_CALC_BC: "AP Calculus BC",
    AP_PRECALC: "AP Precalculus",
    AP_STATS: "AP Statistics",
    AP_MACRO: "AP Macroeconomics",
    AP_MICRO: "AP Microeconomics",
    AP_CSA: "AP Computer Science A",
    AP_CSP: "AP Computer Science Principles",
    AP_PHYSICS_1: "AP Physics 1",
    AP_PHYSICS_2: "AP Physics 2",
    AP_PHYSICS_C_MECH: "AP Physics C Mechanics",
    AP_PHYSICS_C_EM: "AP Physics C E&M",
  };

  return labels[course] ?? course;
}

type ApQuestionCardProps = {
  item: ApQuestionBankSearchResultRow;
  onSelectItem?: (item: ApQuestionBankSearchResultRow) => void;
};

function ApQuestionCard({
  item,
  onSelectItem,
}: ApQuestionCardProps) {
  useEffect(() => {
    const schedule = (callback: () => void) => {
      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(callback, { timeout: 1200 });
        return () => window.cancelIdleCallback?.(idleId);
      }

      const timeoutId = window.setTimeout(callback, 180);
      return () => window.clearTimeout(timeoutId);
    };

    return schedule(() => {
      preloadQuestionContentRender(item.stimulus_description ?? "");
      preloadQuestionContentRender(item.explanation ?? "");

      Object.values(item.choices ?? {}).forEach((choice) => {
        if (choice?.text) {
          preloadQuestionContentRender(choice.text);
        }
      });
    });
  }, [item]);

  const choiceEntries = Object.entries(item.choices ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <article
      onClick={onSelectItem ? () => onSelectItem(item) : undefined}
      className="flex h-[360px] cursor-pointer flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
          AP Archive
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-medium",
            apDifficultyTone(item.difficulty),
          )}
        >
          {apDifficultyLabel(item.difficulty)}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
          {apCourseLabel(item.course)}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
          Unit {item.unit}
        </span>
        {item.topic_code ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {item.topic_code}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {item.stimulus_id && !item.stimulus_image_url && item.stimulus_description ? (
          <div className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5">
            <QuestionContentWithImages
              content={item.stimulus_description}
              className="space-y-1"
              textClassName="text-sm leading-6 text-amber-800"
              galleryClassName="grid gap-1"
              figureClassName="bg-white/80"
              imageClassName="max-h-[80px] w-full object-scale-down"
            />
          </div>
        ) : null}
        <div className="line-clamp-4">
          <QuestionContentWithImages
            content={item.stem}
            className="space-y-2"
            textClassName="text-[16px] font-medium leading-8 text-[#37352F]"
            galleryClassName="grid gap-2"
            figureClassName="bg-[#fafaf8]"
            imageClassName="max-h-[160px] w-full object-scale-down"
          />
        </div>
      </div>

      {choiceEntries.length > 0 ? (
        <div className="mt-4 space-y-2">
          {choiceEntries.map(([label, choice]) => (
            <div
              key={`${item.id}-${label}`}
              className={cn(
                "flex items-start gap-3 text-[15px] leading-7",
                label === item.correct_answer
                  ? "text-emerald-700"
                  : "text-[#37352F]/82",
              )}
            >
              <span
                className={cn(
                  "w-6 shrink-0 font-semibold",
                  label === item.correct_answer
                    ? "text-emerald-700"
                    : "text-[#37352F]",
                )}
              >
                {label}.
              </span>
              <div className="min-w-0 flex-1">
                {choice.image_url ? (
                  <img
                    src={choice.image_url}
                    alt={`Choice ${label}`}
                    className="h-10 rounded border border-slate-200 bg-white object-contain"
                    loading="lazy"
                  />
                ) : (
                  <div className="line-clamp-1">
                    <QuestionContentWithImages
                      content={choice.text}
                      className="space-y-0"
                      textClassName="text-[15px] leading-7 text-[#37352F]/82"
                      galleryClassName="grid gap-1"
                      figureClassName="bg-[#fafaf8]"
                      imageClassName="max-h-[80px] w-full object-scale-down"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4 text-xs text-slate-500">
        {item.source_assessment ? (
          <span className="rounded-full border border-slate-200 px-2.5 py-1">
            {item.source_assessment}
            {item.question_number ? ` · Q${item.question_number}` : ""}
          </span>
        ) : null}
        {item.key_concepts?.slice(0, 2).map((concept) => (
          <span
            key={concept}
            className="rounded-full border border-slate-200 px-2.5 py-1"
          >
            {concept}
          </span>
        ))}
        {typeof item.similarity === "number" && item.similarity > 0 ? (
          <span className="text-slate-400">
            {(item.similarity * 100).toFixed(0)}% match
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default memo(ApQuestionCard, (prevProps, nextProps) => (
  prevProps.item === nextProps.item &&
  prevProps.onSelectItem === nextProps.onSelectItem
));
