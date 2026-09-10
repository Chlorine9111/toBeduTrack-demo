"use client";

import type { LessonPlanBlock, CalloutSubtype } from "@/lib/lesson-plan/types";
import {
  AlertTriangle,
  Lightbulb,
  AlertOctagon,
  Link2,
  Image as ImageIcon,
  BookOpen,
  HelpCircle,
  BarChart,
  CheckCircle2,
} from "lucide-react";

type Props = {
  block: LessonPlanBlock;
};

const str = (val: unknown, fallback = ""): string =>
  typeof val === "string" ? val : fallback;

const strArr = (val: unknown): string[] =>
  Array.isArray(val) ? val.filter((v): v is string => typeof v === "string") : [];

const bool = (val: unknown, fallback = false): boolean =>
  typeof val === "boolean" ? val : fallback;

type OptionItem = { id: string; text: string };

const optionsArr = (val: unknown): OptionItem[] => {
  if (!Array.isArray(val)) return [];
  return val.filter(
    (v): v is OptionItem =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as Record<string, unknown>).id === "string" &&
      typeof (v as Record<string, unknown>).text === "string",
  );
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const CALLOUT_STYLES: Record<
  CalloutSubtype,
  { border: string; bg: string; darkBg: string; icon: React.ReactNode; label: string }
> = {
  warning: {
    border: "border-l-amber-400",
    bg: "bg-amber-50",
    darkBg: "dark:bg-amber-950/30",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
    label: "Warning",
  },
  think: {
    border: "border-l-sky-400",
    bg: "bg-sky-50",
    darkBg: "dark:bg-sky-950/30",
    icon: <Lightbulb className="h-4 w-4 text-sky-600 dark:text-sky-400" />,
    label: "Think",
  },
  misconception: {
    border: "border-l-rose-400",
    bg: "bg-rose-50",
    darkBg: "dark:bg-rose-950/30",
    icon: <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
    label: "Misconception",
  },
  connection: {
    border: "border-l-emerald-400",
    bg: "bg-emerald-50",
    darkBg: "dark:bg-emerald-950/30",
    icon: <Link2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
    label: "Connection",
  },
};

function HeadingPreview({ content }: { content: Record<string, unknown> }) {
  const level = str(content.level, "h2");
  const text = str(content.text, "无标题");

  if (level === "h1") {
    return (
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{text}</h1>
    );
  }
  if (level === "h3") {
    return (
      <h3 className="text-lg font-medium text-slate-900 dark:text-white">{text}</h3>
    );
  }
  return (
    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{text}</h2>
  );
}

function ParagraphPreview({ content }: { content: Record<string, unknown> }) {
  const text = str(content.text);
  if (!text) {
    return (
      <p className="text-sm italic text-slate-400 dark:text-slate-500">空段落</p>
    );
  }
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700 dark:text-slate-300">
      {text}
    </p>
  );
}

function MathPreview({ content }: { content: Record<string, unknown> }) {
  const latex = str(content.latex);
  const displayMode = bool(content.displayMode);

  return (
    <div className={displayMode ? "flex justify-center" : ""}>
      <code className="inline-block rounded-xl bg-slate-50 p-4 font-mono text-sm text-slate-800 dark:bg-slate-900 dark:text-slate-200">
        {latex || "\\text{empty}"}
      </code>
    </div>
  );
}

function ImagePreview({ content }: { content: Record<string, unknown> }) {
  const url = str(content.url);
  const alt = str(content.alt, "图片");

  if (!url) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
          <ImageIcon className="h-8 w-8" />
          <span className="text-xs">点击编辑添加图片</span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="max-h-64 w-full object-contain" />
    </div>
  );
}

function CalloutPreview({ block }: { block: LessonPlanBlock }) {
  const subtype = block.subtype ?? "think";
  const style = CALLOUT_STYLES[subtype];
  const title = str(block.content.title);
  const text = str(block.content.text);

  return (
    <div
      className={`rounded-r-xl border-l-4 ${style.border} ${style.bg} ${style.darkBg} px-4 py-3 transition-all duration-200`}
    >
      <div className="flex items-center gap-2">
        {style.icon}
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          {title || style.label}
        </span>
      </div>
      {text && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {text}
        </p>
      )}
    </div>
  );
}

function DividerPreview() {
  return <hr className="my-2 border-slate-200 dark:border-slate-700" />;
}

function DefinitionPreview({ content }: { content: Record<string, unknown> }) {
  const term = str(content.term);
  const explanation = str(content.explanation);

  return (
    <div className="rounded-r-xl border-l-4 border-l-indigo-500 bg-indigo-50 px-4 py-3 dark:bg-indigo-950/30">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          {term || "未命名术语"}
        </p>
      </div>
      {explanation && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {explanation}
        </p>
      )}
    </div>
  );
}

function ExamplePreview({ content }: { content: Record<string, unknown> }) {
  const prompt = str(content.prompt);
  const steps = strArr(content.steps);

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs dark:border-slate-700 dark:bg-slate-800/50">
      <span className="absolute right-3 top-3 rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
        例题
      </span>
      {prompt && (
        <p className="pr-14 text-sm font-medium text-slate-900 dark:text-white">
          {prompt}
        </p>
      )}
      {steps.length > 0 && (
        <ol className="mt-3 space-y-2 pl-0">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-200 dark:text-slate-900">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepsPreview({ content }: { content: Record<string, unknown> }) {
  const title = str(content.title);
  const items = strArr(content.items);

  return (
    <div>
      {title && (
        <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
          {title}
        </p>
      )}
      {items.length > 0 ? (
        <ol className="space-y-2 pl-0">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-200 dark:text-slate-900">
                {i + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">暂无步骤</p>
      )}
    </div>
  );
}

function QuizPreview({ content }: { content: Record<string, unknown> }) {
  const question = str(content.question);
  const options = optionsArr(content.options);
  const correctId = str(content.correctOptionId);
  const explanation = str(content.explanation);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
          Quiz
        </span>
      </div>
      <p className="text-sm font-medium text-slate-900 dark:text-white">
        {question || "暂无题目"}
      </p>
      {options.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {options.map((opt, i) => {
            const isCorrect = opt.id === correctId;
            return (
              <li
                key={opt.id}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  isCorrect
                    ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    isCorrect
                      ? "border-green-400 bg-green-100 text-green-700 dark:border-green-600 dark:bg-green-900/50 dark:text-green-300"
                      : "border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"
                  }`}
                >
                  {OPTION_LABELS[i] ?? String(i + 1)}
                </span>
                <span className="flex-1">{opt.text}</span>
                {isCorrect && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {explanation && (
        <p className="mt-2.5 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span className="font-semibold">解析:</span> {explanation}
        </p>
      )}
    </div>
  );
}

function PollPreview({ content }: { content: Record<string, unknown> }) {
  const question = str(content.question);
  const options = optionsArr(content.options);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center gap-2">
        <BarChart className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
          Poll
        </span>
      </div>
      <p className="text-sm font-medium text-slate-900 dark:text-white">
        {question || "暂无问题"}
      </p>
      {options.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {options.map((opt, i) => (
            <li
              key={opt.id}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-300"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                {OPTION_LABELS[i] ?? String(i + 1)}
              </span>
              <span className="flex-1">{opt.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BlockPreview({ block }: Props) {
  switch (block.type) {
    case "heading":
      return <HeadingPreview content={block.content} />;
    case "paragraph":
      return <ParagraphPreview content={block.content} />;
    case "math":
      return <MathPreview content={block.content} />;
    case "image":
      return <ImagePreview content={block.content} />;
    case "callout":
      return <CalloutPreview block={block} />;
    case "divider":
      return <DividerPreview />;
    case "definition":
      return <DefinitionPreview content={block.content} />;
    case "example":
      return <ExamplePreview content={block.content} />;
    case "steps":
      return <StepsPreview content={block.content} />;
    case "quiz":
      return <QuizPreview content={block.content} />;
    case "poll":
      return <PollPreview content={block.content} />;
    default:
      return (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">
          未知区块类型
        </p>
      );
  }
}
