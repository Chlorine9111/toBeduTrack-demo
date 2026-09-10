"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import QuestionImagePreview from "@/components/shared/QuestionImagePreview";
import type { ApQuestionBankSearchResultRow } from "@/lib/question-bank/ap-types";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import {
  apCourseLabel,
  apDifficultyLabel,
  apDifficultyTone,
} from "./ApQuestionCard";

export default function ApQuestionDetailModal({
  item,
  onClose,
}: {
  item: ApQuestionBankSearchResultRow;
  onClose: () => void;
}) {
  const { isZh } = useAppI18n();
  const [showDeferredSections, setShowDeferredSections] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setShowDeferredSections(false);

    let frameA = 0;
    let frameB = 0;

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        startTransition(() => {
          setShowDeferredSections(true);
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
    };
  }, [item.id]);

  const choiceEntries = useMemo(
    () =>
      Object.entries(item.choices ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    [item.choices],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_32px_80px_rgba(15,23,42,0.12)] md:mx-0 md:p-8">
        <div className="pointer-events-none sticky top-0 z-20 -mx-6 -mt-6 mb-1 flex h-12 items-start justify-end px-6 pt-4 md:-mx-8 md:-mt-8 md:h-14 md:px-8 md:pt-6">
          <button
            type="button"
            onClick={onClose}
            aria-label={isZh ? "关闭题目详情" : "Close question details"}
            className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/95 text-slate-400 shadow-sm transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pr-12 text-xs md:pr-14">
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
          {item.cognitive_task ? (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-700">
              {item.cognitive_task}
            </span>
          ) : null}
        </div>

        {item.stimulus_id && item.stimulus_image_url ? (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Stimulus
            </h3>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-7 text-[#37352F]">
              <QuestionImagePreview
                src={item.stimulus_image_url}
                alt="Stimulus"
                className="max-h-[280px] w-full rounded-lg object-contain"
              />
              {item.stimulus_description ? (
                <p className="mt-2 text-sm text-slate-500">{item.stimulus_description}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Stem
          </h3>
          <div className="mt-3">
            {item.stimulus_id && !item.stimulus_image_url && item.stimulus_description ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <QuestionContentWithImages
                  content={item.stimulus_description}
                  className="space-y-2"
                  textClassName="text-[15px] leading-7 text-amber-900"
                  galleryClassName="grid gap-2"
                  figureClassName="bg-white/70"
                  imageClassName="max-h-[220px] w-full object-scale-down"
                  enableImagePreview
                />
              </div>
            ) : null}
            <QuestionContentWithImages
              content={item.stem}
              className="space-y-3"
              textClassName="text-[16px] font-medium leading-8 text-[#37352F]"
              galleryClassName="grid gap-3 sm:grid-cols-2"
              figureClassName="bg-[#fafaf8]"
              imageClassName="max-h-[300px] w-full object-scale-down"
              enableImagePreview
            />
          </div>
        </div>

        {showDeferredSections && choiceEntries.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Choices
            </h3>
            <div className="mt-3 space-y-3">
              {choiceEntries.map(([label, choice]) => {
                const isCorrect = label === item.correct_answer;
                return (
                  <div
                    key={`${item.id}-${label}`}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-[15px] leading-7",
                      isCorrect
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-slate-50 text-[#37352F]/82",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "w-6 shrink-0 font-semibold",
                          isCorrect ? "text-emerald-700" : "text-[#37352F]",
                        )}
                      >
                        {label}.
                      </span>
                      <div className="min-w-0 flex-1">
                        {choice.image_url ? (
                          <QuestionImagePreview
                            src={choice.image_url}
                            alt={`Choice ${label}`}
                            className="max-h-40 rounded-lg border border-slate-200 bg-white object-contain"
                          />
                        ) : null}
                        {choice.text ? (
                          <QuestionContentWithImages
                            content={choice.text}
                            className="space-y-1"
                            textClassName="text-[15px] leading-7"
                            galleryClassName="grid gap-2"
                            figureClassName="bg-white"
                            imageClassName="max-h-[160px] w-full object-scale-down"
                            enableImagePreview
                          />
                        ) : null}
                        {choice.misconception ? (
                          <p className="mt-1 text-xs font-medium text-orange-600">
                            Misconception: {choice.misconception}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Correct Answer
          </h3>
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] font-semibold leading-7 text-emerald-800">
            {item.correct_answer}
          </div>
        </div>

        {showDeferredSections ? (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Explanation
            </h3>
            <div
              className={cn(
                "mt-3 rounded-2xl border px-4 py-3 text-[15px] leading-7",
                item.explanation
                  ? "border-slate-200 bg-slate-50 text-[#37352F]"
                  : "border-dashed border-slate-200 bg-slate-50/50 italic text-slate-400",
              )}
            >
              {item.explanation ? (
                <QuestionContentWithImages
                  content={item.explanation}
                  className="space-y-2"
                  textClassName="text-[15px] leading-7 text-[#37352F]"
                  galleryClassName="grid gap-2"
                  figureClassName="bg-white"
                  imageClassName="max-h-[220px] w-full object-scale-down"
                  enableImagePreview
                />
              ) : (
                "No explanation available"
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Key Concepts
          </h3>
          {item.key_concepts && item.key_concepts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.key_concepts.map((concept) => (
                <span
                  key={concept}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                >
                  {concept}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm italic text-slate-400">
              No key concepts tagged
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-4 rounded-[20px] bg-slate-50 p-4 text-sm md:grid-cols-2">
          <div>
            <span className="text-slate-400">Course</span>
            <span className="ml-2 font-medium text-slate-700">
              {apCourseLabel(item.course)}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Unit</span>
            <span className="ml-2 font-medium text-slate-700">{item.unit}</span>
          </div>
          {item.topic_code ? (
            <div>
              <span className="text-slate-400">Topic Code</span>
              <span className="ml-2 font-medium text-slate-700">
                {item.topic_code}
              </span>
            </div>
          ) : null}
          {item.cognitive_task ? (
            <div>
              <span className="text-slate-400">Cognitive Task</span>
              <span className="ml-2 font-medium text-slate-700">
                {item.cognitive_task}
              </span>
            </div>
          ) : null}
          {typeof item.similarity === "number" && item.similarity > 0 ? (
            <div>
              <span className="text-slate-400">Match Score</span>
              <span className="ml-2 font-medium text-slate-700">
                {(item.similarity * 100).toFixed(1)}%
              </span>
            </div>
          ) : null}
          {item.source_assessment ? (
            <div className="md:col-span-2">
              <span className="text-slate-400">Source</span>
              <span className="ml-2 font-medium text-slate-700">
                {item.source_assessment}
                {item.question_number ? ` · Q${item.question_number}` : ""}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
