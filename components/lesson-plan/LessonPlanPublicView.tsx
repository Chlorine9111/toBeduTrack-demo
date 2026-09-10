"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import katex from "katex";
import {
  AlertTriangle,
  Lightbulb,
  AlertOctagon,
  Link2,
  BookOpen,
  Image as ImageIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  List,
  Presentation,
  CheckCircle2,
  XCircle,
  Sparkles,
  BarChart,
} from "lucide-react";
import type {
  CalloutSubtype,
  LessonPlanBlock,
  LessonPlanDocument,
  LessonPlanSection,
} from "@/lib/lesson-plan/types";
import { Button } from "@heroui/react";

/* ---------- KaTeX helper ---------- */

// 基于 Context7 文档: KaTeX renderToString API
function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: "htmlAndMathml",
    });
  } catch {
    return latex;
  }
}

/* ---------- Callout config ---------- */

type CalloutConfig = {
  border: string;
  bg: string;
  iconBg: string;
  iconColor: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

const CALLOUT_STYLES: Record<CalloutSubtype, CalloutConfig> = {
  warning: {
    border: "border-l-amber-400",
    bg: "bg-amber-50/80 dark:bg-amber-950/30",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    icon: AlertTriangle,
    label: "注意",
  },
  think: {
    border: "border-l-sky-400",
    bg: "bg-sky-50/80 dark:bg-sky-950/30",
    iconBg: "bg-sky-100 dark:bg-sky-900/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    icon: Lightbulb,
    label: "思考",
  },
  misconception: {
    border: "border-l-rose-400",
    bg: "bg-rose-50/80 dark:bg-rose-950/30",
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    icon: AlertOctagon,
    label: "易错点",
  },
  connection: {
    border: "border-l-emerald-400",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/30",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    icon: Link2,
    label: "关联",
  },
};

/* ---------- Quiz state ---------- */

type QuizState = {
  selected: string | null;
  submitted: boolean;
};

/* ---------- Block renderers ---------- */

function HeadingBlock({ content }: { content: Record<string, unknown> }) {
  const level = String(content.level ?? "h2");
  const text = String(content.text ?? "");

  if (level === "h1") {
    return (
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        {text}
      </h1>
    );
  }
  if (level === "h3") {
    return (
      <h3 className="mt-4 text-xl font-medium text-slate-900 dark:text-white">
        {text}
      </h3>
    );
  }
  return (
    <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
      {text}
    </h2>
  );
}

function ParagraphBlock({ content }: { content: Record<string, unknown> }) {
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700 dark:text-slate-300">
      {String(content.text ?? "")}
    </p>
  );
}

function MathBlock({ content }: { content: Record<string, unknown> }) {
  const displayMode = Boolean(content.displayMode ?? true);
  const latex = String(content.latex ?? "");

  if (!latex) return null;

  if (displayMode) {
    return (
      <div className="my-4 overflow-x-auto rounded-2xl bg-default-100 p-6 dark:bg-slate-900/50">
        <div
          className="flex justify-center"
          dangerouslySetInnerHTML={{ __html: renderLatex(latex, true) }}
        />
      </div>
    );
  }

  return (
    <span
      className="inline"
      dangerouslySetInnerHTML={{ __html: renderLatex(latex, false) }}
    />
  );
}

function ImageBlock({ content }: { content: Record<string, unknown> }) {
  const url = String(content.url ?? "");
  const alt = String(content.alt ?? "");
  const caption = String(content.caption ?? alt);

  if (!url) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed border-divider bg-default-100 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-default-400 dark:text-slate-500">暂无图片</p>
        </div>
      </div>
    );
  }

  return (
    <figure className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="w-full rounded-2xl shadow-md shadow-slate-200/50 dark:shadow-slate-950/50"
      />
      {caption ? (
        <figcaption className="text-center text-sm italic text-default-500 dark:text-slate-400">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function CalloutBlock({
  block,
}: {
  block: LessonPlanBlock;
}) {
  const content = block.content as Record<string, unknown>;
  const subtype = (block.subtype ?? "think") as CalloutSubtype;
  const config = CALLOUT_STYLES[subtype] ?? CALLOUT_STYLES.think;
  const Icon = config.icon;
  const title = String(content.title ?? config.label);
  const text = String(content.text ?? "");

  return (
    <div
      className={`relative rounded-xl border-l-4 ${config.border} ${config.bg} px-5 py-4`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}
        >
          <Icon className={`h-4 w-4 ${config.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {title}
          </p>
          <p className="mt-1 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

function DividerBlock() {
  return <hr className="my-8 border-t border-divider dark:border-slate-800" />;
}

function DefinitionBlock({ content }: { content: Record<string, unknown> }) {
  const term = String(content.term ?? "定义");
  const explanation = String(content.explanation ?? "");

  return (
    <div className="rounded-xl border-l-4 border-l-indigo-500 bg-indigo-50/80 px-5 py-4 dark:bg-indigo-950/30">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
          <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">
            {term}
          </p>
          <p className="mt-1 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
            {explanation}
          </p>
        </div>
      </div>
    </div>
  );
}

function ExampleBlock({
  content,
  index,
}: {
  content: Record<string, unknown>;
  index: number;
}) {
  const prompt = String(content.prompt ?? "");
  const steps = Array.isArray(content.steps) ? content.steps : [];

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-white shadow-xs dark:border-slate-700 dark:bg-slate-900">
      <div className="h-1 bg-linear-to-r from-indigo-500 to-purple-500" />
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-lg bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
            例题 {index + 1}
          </span>
        </div>
        {prompt ? (
          <p className="mb-4 font-medium text-slate-900 dark:text-white">
            {prompt}
          </p>
        ) : null}
        {steps.length > 0 ? (
          <ol className="space-y-3">
            {steps.map((step, stepIdx) => (
              <li key={`${stepIdx}-${String(step)}`} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                  {stepIdx + 1}
                </span>
                <span className="text-[15px] leading-7 text-slate-700 dark:text-slate-300">
                  {String(step)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

function StepsBlock({ content }: { content: Record<string, unknown> }) {
  const title = String(content.title ?? "步骤");
  const items = Array.isArray(content.items) ? content.items : [];

  return (
    <div className="rounded-xl border border-divider bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
        {title}
      </p>
      <ol className="space-y-2.5">
        {items.map((item, idx) => (
          <li key={`${idx}-${String(item)}`} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {idx + 1}
            </span>
            <span className="text-[15px] leading-7 text-slate-700 dark:text-slate-300">
              {String(item)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function QuizBlock({
  block,
  showCedCodes,
}: {
  block: LessonPlanBlock;
  showCedCodes: boolean;
}) {
  const content = block.content as Record<string, unknown>;
  const question = String(content.question ?? "");
  const explanation = String(content.explanation ?? "");
  const correctOptionId = String(content.correctOptionId ?? "");
  const options = Array.isArray(content.options)
    ? (content.options as Array<Record<string, unknown>>)
    : [];

  const [state, setState] = useState<QuizState>({
    selected: null,
    submitted: false,
  });

  const handleSelect = useCallback((optionId: string) => {
    setState((prev) =>
      prev.submitted ? prev : { ...prev, selected: optionId }
    );
  }, []);

  const handleSubmit = useCallback(() => {
    setState((prev) => ({ ...prev, submitted: true }));
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-indigo-200 bg-linear-to-br from-indigo-50 to-white dark:border-indigo-800 dark:from-indigo-950/50 dark:to-slate-900">
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white">
            <Sparkles className="h-3 w-3" />
            Quiz
          </span>
          {showCedCodes && block.cedCodes.length > 0 ? (
            <span className="text-[11px] text-default-500 dark:text-slate-400">
              CED: {block.cedCodes.join(", ")}
            </span>
          ) : null}
        </div>

        <p className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          {question}
        </p>

        <div className="space-y-2">
          {options.map((option) => {
            const optionId = String(option.id ?? "");
            const optionText = String(option.text ?? "");
            const isSelected = state.selected === optionId;
            const isCorrect = state.submitted && optionId === correctOptionId;
            const isWrong =
              state.submitted && isSelected && optionId !== correctOptionId;

            let optionClasses =
              "w-full rounded-xl border px-4 py-3 text-left text-sm transition-all ";

            if (isCorrect) {
              optionClasses +=
                "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40";
            } else if (isWrong) {
              optionClasses +=
                "border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40";
            } else if (isSelected) {
              optionClasses +=
                "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40";
            } else {
              optionClasses +=
                "border-divider bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-600";
            }

            return (
              <Button
                key={optionId}
                variant="ghost"
                className={optionClasses}
                onPress={() => handleSelect(optionId)}
                isDisabled={state.submitted}
              >
                <div className="flex items-center justify-between">
                  <span>
                    <span className="mr-2 font-semibold text-default-500 dark:text-slate-400">
                      {optionId}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {optionText}
                    </span>
                  </span>
                  {isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  ) : null}
                  {isWrong ? (
                    <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
                  ) : null}
                </div>
              </Button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {!state.submitted ? (
            <Button
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              onPress={handleSubmit}
              isDisabled={!state.selected}
            >
              提交
            </Button>
          ) : null}
        </div>

        {state.submitted && explanation ? (
          <div className="mt-4 rounded-xl border border-divider bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              解析
            </p>
            <p className="mt-1 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
              {explanation}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PollBlock({
  block,
  showCedCodes,
}: {
  block: LessonPlanBlock;
  showCedCodes: boolean;
}) {
  const content = block.content as Record<string, unknown>;
  const question = String(content.question ?? "");
  const options = Array.isArray(content.options)
    ? (content.options as Array<Record<string, unknown>>)
    : [];
  const [selected, setSelected] = useState<string | null>(null);

  const distributionMap = useMemo(() => {
    const distribution = Array.isArray(content.presetDistribution)
      ? (content.presetDistribution as Array<Record<string, unknown>>)
      : [];
    const map = new Map<string, number>();
    for (const item of distribution) {
      map.set(String(item.optionId ?? ""), Number(item.percent ?? 0));
    }
    return map;
  }, [content.presetDistribution]);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-violet-200 bg-linear-to-br from-violet-50 to-white dark:border-violet-800 dark:from-violet-950/50 dark:to-slate-900">
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white">
            <BarChart className="h-3 w-3" />
            Poll
          </span>
          {showCedCodes && block.cedCodes.length > 0 ? (
            <span className="text-[11px] text-default-500 dark:text-slate-400">
              CED: {block.cedCodes.join(", ")}
            </span>
          ) : null}
        </div>

        <p className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          {question}
        </p>

        <div className="space-y-2">
          {options.map((option) => {
            const optionId = String(option.id ?? "");
            const optionText = String(option.text ?? "");
            const isSelected = selected === optionId;
            const percent = distributionMap.get(optionId) ?? 0;

            return (
              <Button
                key={optionId}
                variant="ghost"
                className={`relative w-full overflow-hidden rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                  isSelected
                    ? "border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/40"
                    : "border-divider bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-violet-600"
                }`}
                onPress={() => setSelected(optionId)}
              >
                {selected && distributionMap.size > 0 ? (
                  <div
                    className="absolute inset-y-0 left-0 bg-violet-100/50 dark:bg-violet-900/20"
                    style={{ width: `${percent}%` }}
                  />
                ) : null}
                <div className="relative flex items-center justify-between">
                  <span>
                    <span className="mr-2 font-semibold text-default-500 dark:text-slate-400">
                      {optionId}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {optionText}
                    </span>
                  </span>
                  {selected && distributionMap.size > 0 ? (
                    <span className="ml-2 shrink-0 text-xs font-medium text-violet-600 dark:text-violet-400">
                      {percent}%
                    </span>
                  ) : null}
                </div>
              </Button>
            );
          })}
        </div>

        {selected ? (
          <p className="mt-3 text-sm text-default-500 dark:text-slate-400">
            你的选择: {selected}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Block dispatcher ---------- */

function BlockView({
  block,
  showCedCodes,
  exampleIndex,
}: {
  block: LessonPlanBlock;
  showCedCodes: boolean;
  exampleIndex: number;
}) {
  const content =
    block.content && typeof block.content === "object"
      ? (block.content as Record<string, unknown>)
      : {};

  switch (block.type) {
    case "heading":
      return <HeadingBlock content={content} />;
    case "paragraph":
      return <ParagraphBlock content={content} />;
    case "math":
      return <MathBlock content={content} />;
    case "image":
      return <ImageBlock content={content} />;
    case "callout":
      return <CalloutBlock block={block} />;
    case "divider":
      return <DividerBlock />;
    case "definition":
      return <DefinitionBlock content={content} />;
    case "example":
      return <ExampleBlock content={content} index={exampleIndex} />;
    case "steps":
      return <StepsBlock content={content} />;
    case "quiz":
      return <QuizBlock block={block} showCedCodes={showCedCodes} />;
    case "poll":
      return <PollBlock block={block} showCedCodes={showCedCodes} />;
    default:
      return null;
  }
}

/* ---------- Section renderer ---------- */

function SectionView({
  section,
  showCedCodes,
  isPresentation,
}: {
  section: LessonPlanSection;
  showCedCodes: boolean;
  isPresentation: boolean;
}) {
  const sortedBlocks = useMemo(
    () => [...section.blocks].sort((a, b) => a.sortOrder - b.sortOrder),
    [section.blocks]
  );

  let exampleCounter = 0;

  return (
    <article
      id={`section-${section.id}`}
      className={isPresentation ? "min-h-[70vh]" : ""}
    >
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {section.title}
          </h2>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <Clock className="h-3 w-3" />
            {section.durationMinutes} 分钟
          </span>
        </div>
        {section.summary ? (
          <p className="mt-2 text-[15px] leading-7 text-slate-600 dark:text-slate-400">
            {section.summary}
          </p>
        ) : null}
        <div className="mt-4 h-px w-full bg-slate-200 dark:bg-slate-800" />
      </header>

      <div className="space-y-5">
        {sortedBlocks.map((block) => {
          const currentExampleIndex =
            block.type === "example" ? exampleCounter++ : 0;
          return (
            <BlockView
              key={block.id}
              block={block}
              showCedCodes={showCedCodes}
              exampleIndex={currentExampleIndex}
            />
          );
        })}
      </div>
    </article>
  );
}

/* ---------- Table of Contents ---------- */

function TableOfContents({
  sections,
  onSelect,
}: {
  sections: LessonPlanSection[];
  onSelect?: (sectionId: string) => void;
}) {
  return (
    <nav className="rounded-xl border border-divider bg-default-100/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-default-500 dark:text-slate-400">
        目录
      </p>
      <ol className="space-y-1.5">
        {sections.map((section, idx) => (
          <li key={section.id}>
            <Button
              variant="ghost"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onPress={() => {
                if (onSelect) {
                  onSelect(section.id);
                } else {
                  const el = document.getElementById(`section-${section.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                {idx + 1}
              </span>
              <span className="truncate">{section.title}</span>
              <span className="ml-auto shrink-0 text-[11px] text-default-400 dark:text-slate-500">
                {section.durationMinutes}min
              </span>
            </Button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ---------- Presentation navigation ---------- */

function PresentationNav({
  currentIndex,
  total,
  onPrev,
  onNext,
}: {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        className="flex items-center gap-1.5 rounded-xl border border-divider px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-default-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        isDisabled={currentIndex <= 0}
        onPress={onPrev}
      >
        <ChevronLeft className="h-4 w-4" />
        上一节
      </Button>

      <div className="flex items-center gap-2">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === currentIndex
                ? "w-6 bg-indigo-500"
                : "w-1.5 bg-slate-300 dark:bg-slate-600"
            }`}
          />
        ))}
        <span className="ml-2 text-sm font-medium text-default-500 dark:text-slate-400">
          {currentIndex + 1} / {total}
        </span>
      </div>

      <Button
        variant="ghost"
        className="flex items-center gap-1.5 rounded-xl border border-divider px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-default-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        isDisabled={currentIndex >= total - 1}
        onPress={onNext}
      >
        下一节
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/* ---------- Main component ---------- */

export default function LessonPlanPublicView({
  lessonPlan,
}: {
  lessonPlan: LessonPlanDocument;
}) {
  const [mode, setMode] = useState<"scroll" | "presentation">("scroll");
  const [slideIndex, setSlideIndex] = useState(0);

  const sections = useMemo(
    () => [...lessonPlan.sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [lessonPlan.sections]
  );

  const totalDuration = useMemo(
    () => sections.reduce((sum, s) => sum + s.durationMinutes, 0),
    [sections]
  );

  const goNext = useCallback(() => {
    setSlideIndex((prev) => Math.min(prev + 1, sections.length - 1));
  }, [sections.length]);

  const goPrev = useCallback(() => {
    setSlideIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    if (mode !== "presentation") return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        goNext();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        goPrev();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, goNext, goPrev]);

  const handleTocSelect = useCallback(
    (sectionId: string) => {
      if (mode === "presentation") {
        const idx = sections.findIndex((s) => s.id === sectionId);
        if (idx >= 0) setSlideIndex(idx);
      } else {
        const el = document.getElementById(`section-${sectionId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [mode, sections]
  );

  const publishedDate = lessonPlan.publishedAt
    ? new Date(lessonPlan.publishedAt).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6 md:py-12">
      {/* Header */}
      <header className="mb-10">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
            {lessonPlan.subjectLabel}
          </span>
          {publishedDate ? (
            <span className="text-xs text-default-500 dark:text-slate-400">
              {publishedDate}
            </span>
          ) : null}
          <span className="text-xs text-default-400 dark:text-slate-500">
            {totalDuration} 分钟
          </span>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          {lessonPlan.title}
        </h1>

        {/* Mode toggle */}
        <div className="mt-6 flex items-center gap-2">
          <Button
            variant="ghost"
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              mode === "scroll"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
            onPress={() => setMode("scroll")}
          >
            <List className="h-4 w-4" />
            阅读模式
          </Button>
          <Button
            variant="ghost"
            className={`hidden items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors md:inline-flex ${
              mode === "presentation"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
            onPress={() => {
              setMode("presentation");
              setSlideIndex(0);
            }}
          >
            <Presentation className="h-4 w-4" />
            演示模式
          </Button>
        </div>

        {/* Table of Contents */}
        <div className="mt-6">
          <TableOfContents sections={sections} onSelect={handleTocSelect} />
        </div>
      </header>

      {/* Content */}
      {mode === "scroll" ? (
        <div className="space-y-12">
          {sections.map((section) => (
            <SectionView
              key={section.id}
              section={section}
              showCedCodes={lessonPlan.preferences.showCedCodes}
              isPresentation={false}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <PresentationNav
            currentIndex={slideIndex}
            total={sections.length}
            onPrev={goPrev}
            onNext={goNext}
          />

          {sections[slideIndex] ? (
            <div className="rounded-2xl border border-divider bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 md:p-8">
              <SectionView
                key={sections[slideIndex].id}
                section={sections[slideIndex]}
                showCedCodes={lessonPlan.preferences.showCedCodes}
                isPresentation={true}
              />
            </div>
          ) : null}

          <PresentationNav
            currentIndex={slideIndex}
            total={sections.length}
            onPrev={goPrev}
            onNext={goNext}
          />
        </div>
      )}
    </main>
  );
}
