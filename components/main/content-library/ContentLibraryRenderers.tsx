"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { Download, MessageSquare } from "lucide-react";
import MathText from "@/components/main/chatflow/MathText";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import RichMarkdown from "@/components/shared/RichMarkdown";
import { EditableContentLibraryDocument } from "@/components/main/content-library/EditableContentLibraryDocument";
import { MarkdownDocumentView } from "@/components/main/content-library/MarkdownDocumentView";
import {
  buildLessonPlanDocumentFromStructured,
  buildRubricDocumentFromDetail,
} from "@/lib/doc-engine/adapters";
import {
  buildDocumentArticleHtml,
  buildMarkdownArticleHtml,
} from "@/lib/doc-engine/document-article-html";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { sanitizeDocHtml } from "@/lib/doc-engine/sanitize";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ContentLibraryDetail } from "@/lib/content-library/types";
import { isPblUiEnabled } from "@/lib/pbl/feature";

import "@/lib/doc-engine/academic-print.css";

function formatLocalizedDateTime(value: string, locale: "zh" | "en") {
  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatWorksheetCount(
  value: number,
  noun: "question" | "group",
  isZh: boolean,
) {
  if (isZh) {
    return noun === "question" ? `${value} 题` : `${value} 个分组`;
  }

  const label =
    noun === "question"
      ? value === 1
        ? "question"
        : "questions"
      : value === 1
        ? "group"
        : "groups";
  return `${value} ${label}`;
}

function formatWorksheetTotalPoints(value: number, isZh: boolean) {
  if (isZh) {
    return `总分 ${value} 分`;
  }
  return `Total ${value} ${value === 1 ? "pt" : "pts"}`;
}

const ProjectPlanView = dynamic(
  () => import("@/components/pbl/ProjectPlanView").then((module) => module.ProjectPlanView),
  {
    loading: () => (
      <div className="rounded-2xl border border-divider bg-white px-6 py-10">
        <div className="flex items-center gap-3 text-sm text-foreground/60">
          <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          正在加载项目详情...
        </div>
      </div>
    ),
  },
);

function RubricDetailView({
  item,
  onItemChange,
}: {
  item: ContentLibraryDetail;
  onItemChange?: (item: ContentLibraryDetail) => void;
}) {
  const rubric = item.snapshot.kind === "rubric" ? item.snapshot.rubric : null;
  if (!rubric) return null;
  const editedHtml =
    typeof item.metadata?.documentHtml === "string" ? item.metadata.documentHtml : "";
  const initialHtml =
    editedHtml || buildDocumentArticleHtml(buildRubricDocumentFromDetail(rubric)) || "";

  return (
    <EditableContentLibraryDocument
      item={item}
      html={initialHtml}
      onItemChange={onItemChange}
    />
  );
}

function LessonPlanDocumentView({
  item,
  onItemChange,
}: {
  item: ContentLibraryDetail;
  onItemChange?: (item: ContentLibraryDetail) => void;
}) {
  const lessonPlan =
    item.snapshot.kind === "lesson_plan_document" ? item.snapshot.lessonPlan : null;
  if (!lessonPlan) return null;
  const editedHtml =
    typeof item.metadata?.documentHtml === "string" ? item.metadata.documentHtml : "";
  const initialHtml =
    editedHtml || buildDocumentArticleHtml(buildLessonPlanDocumentFromStructured(lessonPlan)) || "";

  return (
    <EditableContentLibraryDocument
      item={item}
      html={initialHtml}
      onItemChange={onItemChange}
    />
  );
}

function LessonPlanMarkdownView({
  item,
  onItemChange,
}: {
  item: ContentLibraryDetail;
  onItemChange?: (item: ContentLibraryDetail) => void;
}) {
  const { isZh } = useAppI18n();
  const snapshot =
    item.snapshot.kind === "lesson_plan_markdown" ? item.snapshot : null;
  if (!snapshot) return null;
  const editedHtml =
    typeof item.metadata?.documentHtml === "string" ? item.metadata.documentHtml : "";
  const html =
    editedHtml ||
    buildMarkdownArticleHtml({
      documentType: "lesson-plan",
      markdown: snapshot.markdown,
      title: item.displayTitle,
      eyebrow: "Lesson Plan",
    });

  if (html) {
    return <EditableContentLibraryDocument item={item} html={html} onItemChange={onItemChange} />;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Agent Snapshot</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">{item.displayTitle}</h2>
        {snapshot.sources.length > 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            {isZh ? `参考来源 ${snapshot.sources.length} 条` : `${snapshot.sources.length} source(s)`}
          </p>
        ) : null}
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5">
        <RichMarkdown
          content={snapshot.markdown}
          className="prose-headings:scroll-mt-24 prose-p:my-2 prose-ul:my-2 prose-ol:my-2"
        />
      </article>

      {snapshot.sources.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {isZh ? "参考来源" : "Sources"}
          </h3>
          <div className="mt-3 space-y-2">
            {snapshot.sources.map((source, index) => (
              <a
                key={`${source.url}-${index}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-slate-200 p-3 text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <p className="font-medium text-slate-900">{source.title || source.url}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{source.url}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ExerciseDetailView({ item }: { item: ContentLibraryDetail }) {
  const { isZh } = useAppI18n();
  const exercise = item.snapshot.kind === "exercise" ? item.snapshot.exercise : null;
  if (!exercise) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Question</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">{item.displayTitle}</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">{exercise.type}</span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            {isZh ? `难度 ${exercise.difficulty}` : `Difficulty ${exercise.difficulty}`}
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            {exercise.verificationStatus}
          </span>
          {exercise.knowledgeCluster ? (
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
              {isZh ? `大类 · ${exercise.knowledgeCluster}` : `Cluster · ${exercise.knowledgeCluster}`}
            </span>
          ) : null}
          {exercise.knowledgeSubskillLabel ? (
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
              {isZh ? `小类 · ${exercise.knowledgeSubskillLabel}` : `Subskill · ${exercise.knowledgeSubskillLabel}`}
            </span>
          ) : null}
          {exercise.classificationUpdatedByTeacher ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200">
              {isZh ? "老师确认" : "Teacher confirmed"}
            </span>
          ) : null}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">{isZh ? "题干" : "Question"}</h3>
        <QuestionContentWithImages
          content={exercise.questionText}
          className="mt-3"
          textClassName="text-sm leading-7 text-slate-700"
          galleryClassName="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          figureClassName="bg-slate-50"
          imageClassName="max-h-[240px] w-full object-scale-down"
        />
      </section>

      {Array.isArray(exercise.options) && exercise.options.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">{isZh ? "选项" : "Options"}</h3>
          <div className="mt-3 space-y-3">
            {exercise.options.map((option) => (
              <div
                key={`${option.label}-${option.text}`}
                className={`rounded-xl border p-3 text-sm ${
                  option.isCorrect
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <p className="font-medium">{option.label}.</p>
                <QuestionContentWithImages
                  content={option.text}
                  className="mt-2"
                  textClassName="text-sm leading-7 text-inherit"
                  galleryClassName="mt-3 grid gap-2"
                  figureClassName="bg-white"
                  imageClassName="max-h-[180px] w-full object-scale-down"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">
          {isZh ? "答案与解析" : "Answer & explanation"}
        </h3>
        <p className="mt-3 text-sm font-medium text-slate-800">
          {isZh ? "正确答案：" : "Correct answer: "}
          <MathText text={exercise.correctAnswer} />
        </p>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
          <MathText text={exercise.solutionSteps} />
        </div>
      </section>

      {exercise.commonMistakes.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            {isZh ? "常见误区" : "Common mistakes"}
          </h3>
          <ul className="mt-3 space-y-2">
            {exercise.commonMistakes.map((mistake, index) => (
              <li key={`${mistake}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <MathText text={mistake} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {exercise.source ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            {isZh ? "来源信息" : "Source"}
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <p className="text-xs text-slate-500">{isZh ? "来源类型" : "Source type"}</p>
              <p className="mt-1">
                {exercise.source.kind === "pdf_scan"
                  ? isZh
                    ? "PDF 拆题"
                    : "PDF Scan"
                  : exercise.source.kind === "knowledge_document"
                    ? isZh
                      ? "资料库文档"
                      : "Knowledge Document"
                    : exercise.source.kind === "agent_generated"
                      ? isZh
                        ? "AI 生成"
                        : "AI Generated"
                      : isZh
                        ? "手动录入"
                        : "Manual"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <p className="text-xs text-slate-500">{isZh ? "来源文件" : "Source file"}</p>
              <p className="mt-1">{exercise.source.fileName || (isZh ? "暂无" : "N/A")}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <p className="text-xs text-slate-500">{isZh ? "页码" : "Page"}</p>
              <p className="mt-1">
                {exercise.source.pageStart || exercise.source.pageEnd
                  ? exercise.source.pageStart && exercise.source.pageEnd && exercise.source.pageStart !== exercise.source.pageEnd
                    ? isZh
                      ? `第 ${exercise.source.pageStart}-${exercise.source.pageEnd} 页`
                      : `Page ${exercise.source.pageStart}-${exercise.source.pageEnd}`
                    : isZh
                      ? `第 ${exercise.source.pageStart ?? exercise.source.pageEnd} 页`
                      : `Page ${exercise.source.pageStart ?? exercise.source.pageEnd}`
                  : isZh
                    ? "暂无"
                    : "N/A"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <p className="text-xs text-slate-500">{isZh ? "导入批次" : "Import batch"}</p>
              <p className="mt-1">{exercise.importBatchLabel || (isZh ? "暂无" : "N/A")}</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PblProjectPlanView({ item }: { item: ContentLibraryDetail }) {
  const { isZh } = useAppI18n();
  const plan = item.snapshot.kind === "pbl_project_plan" ? item.snapshot.pblPlan : null;
  if (!plan) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-orange-500">PBL Project</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">{plan.title}</h2>
        <p className="mt-2 text-sm italic text-slate-700">{plan.drivingQuestion}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-orange-200">{plan.primarySubject}</span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-orange-200">{plan.grade}</span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-orange-200">
            {isZh ? `${plan.totalPeriods} 课时` : `${plan.totalPeriods} periods`}
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-orange-200">{plan.difficulty}</span>
        </div>
        {isPblUiEnabled() ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/main/agent?pblPlanId=${encodeURIComponent(plan.id)}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <MessageSquare className="h-4 w-4" />
              {isZh ? "在主工作台继续修改" : "Open in workspace"}
            </a>
            <a
              href={`/api/pbl/projects/${encodeURIComponent(plan.id)}/export?format=md`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              {isZh ? "导出 Markdown" : "Export Markdown"}
            </a>
          </div>
        ) : null}
      </div>

      <ProjectPlanView plan={plan} showStudentVersion={false} />
    </div>
  );
}

function WorksheetProjectSnapshotView({ item }: { item: ContentLibraryDetail }) {
  const { isZh, locale } = useAppI18n();
  const snapshot = item.snapshot.kind === "worksheet_project" ? item.snapshot : null;
  if (!snapshot) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#D8D3C7] bg-[#F7F3EA] p-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#8A6A2D]">
          {isZh ? "组卷工程" : "Worksheet Project"}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[#37352F]">{item.displayTitle}</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#37352F]/72">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[rgba(55,53,47,0.08)]">
            {formatWorksheetCount(snapshot.stats.questionCount, "question", isZh)}
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[rgba(55,53,47,0.08)]">
            {formatWorksheetTotalPoints(snapshot.stats.totalPoints, isZh)}
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[rgba(55,53,47,0.08)]">
            {formatWorksheetCount(snapshot.stats.sectionCount, "group", isZh)}
          </span>
          {snapshot.primaryCourse ? (
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[rgba(55,53,47,0.08)]">
              {snapshot.primaryCourse}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/main/question-bank/builder?projectId=${encodeURIComponent(item.id)}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#37352F] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#37352F]/90"
          >
            <MessageSquare className="h-4 w-4" />
            {isZh ? "在组卷编辑台打开" : "Open in worksheet builder"}
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">
          {isZh ? "工程概览" : "Project overview"}
        </h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs text-slate-500">{isZh ? "标题" : "Title"}</p>
            <p className="mt-1">{snapshot.draft.title || item.displayTitle}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs text-slate-500">{isZh ? "保存时间" : "Saved at"}</p>
            <p className="mt-1">{formatLocalizedDateTime(snapshot.savedAt, locale)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs text-slate-500">{isZh ? "说明" : "Description"}</p>
            <p className="mt-1 whitespace-pre-wrap">{snapshot.draft.description || (isZh ? "无" : "None")}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs text-slate-500">{isZh ? "标签" : "Tags"}</p>
            <p className="mt-1">{snapshot.questionTags.join(" · ") || (isZh ? "无" : "None")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Skill HTML 文档渲染：使用 DOMPurify 清洗 + academic-print.css 样式 */
function HtmlSnapshotView({
  item,
  onItemChange,
}: {
  item: ContentLibraryDetail;
  onItemChange?: (item: ContentLibraryDetail) => void;
}) {
  const editedHtml =
    typeof item.metadata?.documentHtml === "string" ? item.metadata.documentHtml : "";
  const snapshotHtml = item.snapshot.kind === "html" ? item.snapshot.html : "";
  const safeHtml = useMemo(() => {
    const normalized = normalizeDocumentHtml(editedHtml || snapshotHtml);
    return sanitizeDocHtml(normalized);
  }, [editedHtml, snapshotHtml]);
  return (
    <EditableContentLibraryDocument
      item={item}
      html={safeHtml}
      onItemChange={onItemChange}
    />
  );
}

export function ContentLibrarySnapshotView({
  item,
  onItemChange,
}: {
  item: ContentLibraryDetail;
  onItemChange?: (item: ContentLibraryDetail) => void;
}) {
  const { isZh } = useAppI18n();
  if (item.snapshot.kind === "rubric") {
    return <RubricDetailView item={item} onItemChange={onItemChange} />;
  }
  if (item.snapshot.kind === "lesson_plan_document") {
    return <LessonPlanDocumentView item={item} onItemChange={onItemChange} />;
  }
  if (item.snapshot.kind === "lesson_plan_markdown") {
    return <LessonPlanMarkdownView item={item} onItemChange={onItemChange} />;
  }
  if (item.snapshot.kind === "exercise") {
    return <ExerciseDetailView item={item} />;
  }
  if (item.snapshot.kind === "pbl_project_plan") {
    return <PblProjectPlanView item={item} />;
  }
  if (item.snapshot.kind === "worksheet_project") {
    return <WorksheetProjectSnapshotView item={item} />;
  }
  if (item.snapshot.kind === "html") {
    return <HtmlSnapshotView item={item} onItemChange={onItemChange} />;
  }
  if (item.snapshot.kind === "markdown") {
    return <MarkdownDocumentView item={item} onItemChange={onItemChange} />;
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      {isZh
        ? "当前内容暂不支持专用渲染。"
        : "This content type does not have a dedicated renderer yet."}
    </div>
  );
}
