"use client";

import RichMarkdown from "@/components/shared/RichMarkdown";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import BlockPreview from "@/components/lesson-plan/blocks/BlockPreview";
import type { LessonPlanBlock } from "@/lib/lesson-plan/types";
import type {
  AnswerSpaceBlock,
  DividerBlock,
  DocumentBlock,
  HeaderBlock,
  InstructionBlock,
  LessonStepBlock,
  PageBreakBlock,
  QuestionBlock,
  RubricRowBlock,
  SectionTitleBlock,
  TableBlock,
} from "@/lib/doc-engine/block-types";
import { cn } from "@/lib/utils";

type DocumentBlockRendererProps = {
  block: DocumentBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
};

function BlockCard({
  blockId,
  className,
  selected,
  editing,
  changed,
  children,
}: {
  blockId: string;
  className?: string;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-doc-block-id={blockId}
      className={cn(
        "doc-engine-node relative mb-4 rounded-2xl border border-transparent transition",
        selected ? "doc-engine-node--selected" : "",
        editing ? "doc-engine-node--editing" : "",
        changed ? "doc-engine-node--changed" : "",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MarkdownBlock({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <RichMarkdown
      content={content}
      className={cn(
        "max-w-none text-sm leading-6",
        "[&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_ul:first-child]:mt-0 [&_ul:last-child]:mb-0",
        "[&_ol:first-child]:mt-0 [&_ol:last-child]:mb-0",
        "[&_blockquote:first-child]:mt-0 [&_blockquote:last-child]:mb-0",
        "[&_hr]:my-3 [&_table]:my-3",
        "[&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold",
        "[&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold",
        "[&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold",
        className,
      )}
    />
  );
}

function renderQuestionOptions(question: QuestionBlock["data"]) {
  if (question.questionType !== "mc" || question.options.length === 0) {
    return null;
  }

  const isCompact = question.options.every((option) => option.text.length <= 48);
  return (
    <div className={cn("mt-4 grid gap-2", isCompact ? "md:grid-cols-2" : "grid-cols-1")}>
      {question.options.map((option) => (
        <div
          key={`${option.label}-${option.text}`}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
        >
          <span className="font-medium text-neutral-900">{option.label}.</span>{" "}
          <QuestionContentWithImages
            content={option.text}
            className="inline"
            textClassName="inline text-sm"
            galleryClassName="mt-1"
            imageClassName="max-h-[100px] object-scale-down"
          />
        </div>
      ))}
    </div>
  );
}

function HeaderBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: HeaderBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const data = block.data;
  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
      className="mb-6 border-b border-neutral-200 pb-6"
    >
      {data.eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">
          {data.eyebrow}
        </p>
      ) : null}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
        {data.title}
      </h1>
      {data.subtitle ? (
        <p className="mt-3 text-sm leading-6 text-neutral-600">{data.subtitle}</p>
      ) : null}
    </BlockCard>
  );
}

function SectionTitleBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: SectionTitleBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const data = block.data;
  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
      className="mb-3 mt-6"
    >
      <div className="flex items-center gap-3">
        {data.numbering ? (
          <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
            {data.numbering}
          </span>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900">{data.title}</h2>
      </div>
      {data.subtitle ? (
        <p className="mt-2 text-sm leading-6 text-neutral-600">{data.subtitle}</p>
      ) : null}
    </BlockCard>
  );
}

function InstructionBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: InstructionBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
    >
      <div className="rounded-2xl bg-white/80 px-1 py-1">
        <RichMarkdown
          content={block.data.text}
          className={cn(
            "max-w-none text-sm leading-7 text-neutral-700",
            "[&_p]:my-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1.5",
            "[&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold",
          )}
        />
      </div>
    </BlockCard>
  );
}

function QuestionBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: QuestionBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const data = block.data;
  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
    >
      <div className="rounded-[24px] border border-neutral-200 bg-white px-5 py-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {data.number ? (
            <span className="rounded-full bg-neutral-900 px-2.5 py-1 font-semibold text-white">
              第 {data.number} 题
            </span>
          ) : null}
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium uppercase tracking-[0.15em] text-neutral-500">
            {data.questionType === "mc"
              ? "MC"
              : data.questionType === "frq"
                ? "FRQ"
                : data.questionType === "fill"
                  ? "FILL"
                  : "TF"}
          </span>
          {typeof data.difficulty === "number" ? (
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium text-neutral-600">
              难度 {data.difficulty}
            </span>
          ) : null}
          {data.sourceLabel ? (
            <span className="text-neutral-400">{data.sourceLabel}</span>
          ) : null}
        </div>
        <QuestionContentWithImages
          content={data.stem}
          className="mt-3"
          textClassName="text-[15px] leading-7 text-neutral-900"
          galleryClassName="mt-3 grid gap-3 sm:grid-cols-2"
          figureClassName="bg-neutral-50"
          imageClassName="max-h-[220px] w-full object-scale-down"
        />
        {renderQuestionOptions(data)}
        {"correctAnswer" in data && data.correctAnswer ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            答案：
            {typeof data.correctAnswer === "boolean"
              ? data.correctAnswer
                ? "True"
                : "False"
              : data.correctAnswer}
          </div>
        ) : null}
        {"sampleAnswer" in data && data.sampleAnswer ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            参考答案：{data.sampleAnswer}
          </div>
        ) : null}
        {data.explanation ? (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm leading-6 text-neutral-700">
            <p className="mb-1 font-medium text-neutral-900">解析</p>
            <QuestionContentWithImages
              content={data.explanation}
              textClassName="text-sm leading-6 text-neutral-700"
              galleryClassName="mt-2 grid gap-2 sm:grid-cols-2"
              figureClassName="bg-white"
              imageClassName="max-h-[180px] w-full object-scale-down"
            />
          </div>
        ) : null}
      </div>
    </BlockCard>
  );
}

function RubricRowBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: RubricRowBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const data = block.data;
  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
    >
      <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-xs">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">{data.dimension}</h3>
            {data.description ? (
              <p className="mt-1 text-sm leading-6 text-neutral-600">{data.description}</p>
            ) : null}
          </div>
          {typeof data.weight === "number" && data.weight > 0 ? (
            <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white">
              {data.weight} 分
            </span>
          ) : null}
        </div>
        <div className="grid gap-px bg-neutral-200 md:grid-cols-2 xl:grid-cols-4">
          {data.levels.map((level) => (
            <div key={`${level.label}-${level.score ?? ""}`} className="bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-900">{level.label}</p>
                {level.score != null ? (
                  <span className="text-xs font-medium text-neutral-500">{level.score}</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-700">{level.description}</p>
            </div>
          ))}
        </div>
      </div>
    </BlockCard>
  );
}

function LessonStepBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: LessonStepBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const data = block.data;
  const hasStructuredBlocks = Array.isArray(data.blocks) && data.blocks.length > 0;

  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
    >
      <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-xs">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            {data.phase ? (
              <span className="rounded-full bg-neutral-900 px-2.5 py-1 font-semibold uppercase tracking-[0.15em] text-white">
                {data.phase}
              </span>
            ) : null}
            {typeof data.duration === "number" && data.duration > 0 ? (
              <span>{data.duration} 分钟</span>
            ) : null}
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-neutral-900">
            {data.title}
          </h3>
          {data.summary ? (
            <MarkdownBlock
              content={data.summary}
              className="mt-2 text-neutral-600 [&_p]:text-inherit [&_li]:text-inherit [&_blockquote]:text-neutral-700"
            />
          ) : null}
        </div>
        <div className="space-y-4 px-4 py-4">
          {data.objectives?.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">目标</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-700">
                {data.objectives.map((item) => (
                  <li key={item} className="rounded-xl bg-neutral-50 px-3 py-2">
                    <MarkdownBlock
                      content={item}
                      className="text-neutral-700 [&_p]:text-inherit [&_li]:text-inherit"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.activities?.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">活动</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-700">
                {data.activities.map((item) => (
                  <li key={item} className="rounded-xl bg-neutral-50 px-3 py-2">
                    <MarkdownBlock
                      content={item}
                      className="text-neutral-700 [&_p]:text-inherit [&_li]:text-inherit"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.materials?.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">材料</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.materials.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {data.teacherNotes ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                教师提示
              </p>
              <MarkdownBlock
                content={data.teacherNotes}
                className="mt-2 text-amber-900 [&_p]:text-inherit [&_li]:text-inherit [&_blockquote]:border-amber-300 [&_blockquote]:bg-amber-100/70"
              />
            </div>
          ) : null}

          {hasStructuredBlocks ? (
            <div className="space-y-3 border-t border-neutral-100 pt-3">
              {(data.blocks as LessonPlanBlock[]).map((childBlock, index) => (
                <BlockPreview key={`${childBlock.id}-${index}`} block={childBlock} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </BlockCard>
  );
}

function DividerBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: DividerBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const borderClass =
    block.data.style === "dashed"
      ? "border-dashed"
      : block.data.style === "dotted"
        ? "border-dotted"
        : "border-solid";

  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
      className="mb-6 mt-6"
    >
      <div className={cn("border-t border-neutral-200", borderClass)} />
    </BlockCard>
  );
}

function AnswerSpaceBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: AnswerSpaceBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const lines =
    block.data.lines ?? (block.data.size === "large" ? 8 : block.data.size === "medium" ? 5 : 3);

  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
    >
      <div className="rounded-[20px] border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Answer Space
        </p>
        <div className="mt-2 space-y-3">
          {Array.from({ length: lines }).map((_, index) => (
            <div key={index} className="border-b border-neutral-300" />
          ))}
        </div>
      </div>
    </BlockCard>
  );
}

function TableBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: TableBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  const data = block.data;
  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
    >
      <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-xs">
        {data.caption ? (
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
            {data.caption}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                {data.headers.map((header) => (
                  <th key={header} className="border-b border-neutral-200 px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIndex) => (
                <tr
                  key={`${rowIndex}-${row.join("|")}`}
                  className="border-b border-neutral-100 last:border-b-0"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${rowIndex}-${cellIndex}`}
                      className="px-4 py-3 align-top text-neutral-700"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BlockCard>
  );
}

function PageBreakBlockView({
  block,
  selected,
  editing,
  changed,
}: {
  block: PageBreakBlock;
  selected?: boolean;
  editing?: boolean;
  changed?: boolean;
}) {
  return (
    <BlockCard
      blockId={block.id}
      selected={selected}
      editing={editing}
      changed={changed}
      className="my-6"
    >
      <div
        data-doc-page-break="true"
        className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3"
      >
        <div className="doc-engine-page-break-marker justify-center text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
          Page Break
        </div>
      </div>
    </BlockCard>
  );
}

export default function DocumentBlockRenderer({
  block,
  selected,
  editing,
  changed,
}: DocumentBlockRendererProps) {
  switch (block.type) {
    case "header":
      return <HeaderBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    case "section-title":
      return (
        <SectionTitleBlockView
          block={block}
          selected={selected}
          editing={editing}
          changed={changed}
        />
      );
    case "instruction":
      return (
        <InstructionBlockView
          block={block}
          selected={selected}
          editing={editing}
          changed={changed}
        />
      );
    case "question":
      return <QuestionBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    case "rubric-row":
      return <RubricRowBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    case "lesson-step":
      return <LessonStepBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    case "divider":
      return <DividerBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    case "answer-space":
      return <AnswerSpaceBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    case "table":
      return <TableBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    case "page-break":
      return <PageBreakBlockView block={block} selected={selected} editing={editing} changed={changed} />;
    default:
      return null;
  }
}
