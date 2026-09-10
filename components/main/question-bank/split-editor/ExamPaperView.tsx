"use client";

import type {
  CourseOption,
  UnitOption,
} from "@/components/main/question-bank/helpers";
import { formatUnitOptionLabel } from "@/components/main/question-bank/helpers";
import type {
  QuestionBankSplitDocument,
  QuestionBankSplitQuestion,
} from "@/components/main/question-bank/split-editor/types";
import QuestionCard from "@/components/main/question-bank/split-editor/QuestionCard";

export default function ExamPaperView({
  document,
  courses,
  units,
  questionRefs,
  commitLoading,
  rewriteLoadingQuestionId,
  draggingQuestionId,
  onUpdateDocument,
  onToggleQuestion,
  onUpdateQuestion,
  onReplaceRequest,
  onRewriteQuestion,
  onRemoveQuestion,
  onDragStartQuestion,
  onDragEndQuestion,
  onDropQuestionBefore,
  onDropQuestionAtEnd,
}: {
  document: QuestionBankSplitDocument | null;
  courses: CourseOption[];
  units: UnitOption[];
  questionRefs: Record<string, HTMLDivElement | null>;
  commitLoading: boolean;
  rewriteLoadingQuestionId: string | null;
  draggingQuestionId: string | null;
  onUpdateDocument: (updater: (document: QuestionBankSplitDocument) => QuestionBankSplitDocument) => void;
  onToggleQuestion: (questionId: string) => void;
  onUpdateQuestion: (
    questionId: string,
    updater: (question: QuestionBankSplitQuestion) => QuestionBankSplitQuestion,
  ) => void;
  onReplaceRequest: (questionId: string) => void;
  onRewriteQuestion: (questionId: string) => void;
  onRemoveQuestion: (questionId: string) => void;
  onDragStartQuestion: (questionId: string) => void;
  onDragEndQuestion: () => void;
  onDropQuestionBefore: (questionId: string) => void;
  onDropQuestionAtEnd: () => void;
}) {
  if (!document) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
        <div className="flex min-h-[520px] flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a6947a]">
            Split Editor
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#37352F]">
            先上传一份文档
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[#37352F]/55">
            上传 PDF 后，这里会变成试卷编辑台。每道题默认折叠展示，展开后就能直接修改题型、答案、解析和 AP 标签。
          </p>
        </div>
      </section>
    );
  }

  const filteredUnits = units.filter((unit) => !document.courseId || unit.course_id === document.courseId);
  const activeCourse = courses.find((course) => course.id === document.courseId) ?? null;
  const activeUnit = filteredUnits.find((unit) => unit.id === document.unitId) ?? null;
  const courseLabel = activeCourse?.name ?? document.curriculumHint;
  const unitLabel = activeUnit ? formatUnitOptionLabel(activeUnit) : "";

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-5 py-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={document.courseId}
            onChange={(event) =>
              onUpdateDocument((current) => {
                const nextCourse = courses.find((course) => course.id === event.target.value) ?? null;
                return {
                  ...current,
                  courseId: event.target.value,
                  unitId: "",
                  curriculumHint: nextCourse?.name ?? current.curriculumHint,
                };
              })
            }
            className="rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
          >
            <option value="">选择 AP 课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>

          <select
            value={document.unitId}
            onChange={(event) =>
              onUpdateDocument((current) => ({
                ...current,
                unitId: event.target.value,
              }))
            }
            disabled={!document.courseId || filteredUnits.length === 0}
            className="rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none disabled:bg-slate-100"
          >
            <option value="">{document.courseId ? "选择单元" : "先选课程"}</option>
            {filteredUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {formatUnitOptionLabel(unit)}
              </option>
            ))}
          </select>

          <input
            value={document.curriculumHint}
            onChange={(event) =>
              onUpdateDocument((current) => ({
                ...current,
                curriculumHint: event.target.value,
              }))
            }
            placeholder="课程范围 / 章节提示"
            className="rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
          />

          <select
            value={document.visibility}
            onChange={(event) =>
              onUpdateDocument((current) => ({
                ...current,
                visibility: event.target.value as QuestionBankSplitDocument["visibility"],
              }))
            }
            className="rounded-lg border border-[rgba(55,53,47,0.08)] bg-white px-3 py-2 text-sm text-[#37352F] outline-none"
          >
            <option value="school">校本共享</option>
            <option value="private">仅自己可见</option>
          </select>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#37352F]/45">
          {courseLabel ? <span>{courseLabel}</span> : null}
          {unitLabel ? <span>{unitLabel}</span> : null}
          {document.questionCount > 0 ? <span>{document.questionCount} 道题</span> : null}
          {document.rejectedCount > 0 ? <span>{document.rejectedCount} 段文本未入题</span> : null}
          {document.analysis ? <span>识别置信度 {document.analysis.confidence}</span> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none bg-[#f2f2ee] px-4 py-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[880px] flex-col border border-[rgba(55,53,47,0.08)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <div className="border-b border-[rgba(55,53,47,0.08)] px-8 py-8">
            <input
              value={document.label}
              onChange={(event) =>
                onUpdateDocument((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
              className="w-full bg-transparent text-center text-[36px] font-semibold tracking-[-0.03em] text-[#37352F] outline-none"
              placeholder="试卷标题"
            />
          </div>

          <div className="space-y-0 px-8 py-8">
            {document.questions.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[rgba(55,53,47,0.12)] bg-white px-6 py-14 text-center text-sm text-[#37352F]/45">
                这份文档还没有拆出可编辑题目。
              </div>
            ) : (
              document.questions.map((question, index) => (
                <div
                  key={question.id}
                  ref={(node) => {
                    questionRefs[question.id] = node;
                  }}
                >
                  <QuestionCard
                    question={question}
                    index={index}
                    expanded={document.activeQuestionId === question.id}
                    busy={commitLoading || rewriteLoadingQuestionId === question.id}
                    documentDefaults={{
                      courseLabel,
                      unitLabel,
                    }}
                    onToggleExpand={() => onToggleQuestion(question.id)}
                    onUpdateQuestion={(updater) => onUpdateQuestion(question.id, updater)}
                    onReplaceRequest={() => onReplaceRequest(question.id)}
                    onRewriteQuestion={() => onRewriteQuestion(question.id)}
                    onRemoveQuestion={() => onRemoveQuestion(question.id)}
                    onDragStart={() => onDragStartQuestion(question.id)}
                    onDragEnd={onDragEndQuestion}
                    onDropBefore={() => onDropQuestionBefore(question.id)}
                  />
                </div>
              ))
            )}
            {document.questions.length > 0 ? (
              <div
                onDragOver={(event) => {
                  if (draggingQuestionId) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropQuestionAtEnd();
                }}
                className="mt-4 rounded-xl border border-dashed border-[rgba(55,53,47,0.12)] px-3 py-3 text-center text-xs text-[#37352F]/38"
              >
                拖到这里可移动到末尾
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
