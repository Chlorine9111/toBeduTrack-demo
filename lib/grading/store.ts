import { randomUUID } from "node:crypto";
import type { Json } from "@/types/database";
import { buildSessionStats } from "@/lib/grading/report-builder";
import type { LessonPlanContext } from "@/lib/lesson-plan/context";
import type {
  AnswerKeyItem,
  GradingAnswer,
  GradingSession,
  GradingStats,
  GradingSubmission,
} from "@/lib/grading/types";

type SessionPatch = Partial<
  Pick<GradingSession, "title" | "courseId" | "unitId" | "topicId" | "status">
>;

type MockStore = {
  sessions: Map<string, GradingSession>;
  submissions: Map<string, GradingSubmission>;
  answers: Map<string, GradingAnswer[]>;
};

const GRADING_SESSION_SELECT = [
  "id",
  "teacher_id",
  "title",
  "course_id",
  "unit_id",
  "topic_id",
  "answer_key_source",
  "answer_key",
  "rubric_id",
  "status",
  "student_count",
  "question_count",
  "stats",
  "created_at",
  "updated_at",
].join(", ");

const GRADING_SUBMISSION_SELECT = [
  "id",
  "session_id",
  "student_name",
  "file_url",
  "storage_path",
  "page_count",
  "ocr_result",
  "status",
  "total_score",
  "max_score",
  "graded_at",
  "created_at",
].join(", ");

const GRADING_SUBMISSION_WITH_SESSION_SELECT = [
  GRADING_SUBMISSION_SELECT,
  "grading_sessions!inner(id, teacher_id)",
].join(", ");

const GRADING_ANSWER_SELECT = [
  "id",
  "submission_id",
  "question_number",
  "student_answer",
  "correct_answer",
  "score",
  "max_score",
  "ai_feedback",
  "confidence",
  "question_type",
  "scoring_breakdown",
  "needs_review",
  "teacher_override_score",
  "teacher_override_feedback",
  "created_at",
].join(", ");

function getMockStore(): MockStore {
  if (!globalThis.__gradingMockStore) {
    globalThis.__gradingMockStore = {
      sessions: new Map(),
      submissions: new Map(),
      answers: new Map(),
    };
  }
  return globalThis.__gradingMockStore;
}

function shouldUseMockStore(context: Pick<LessonPlanContext, "isMock" | "supabase">) {
  if (context.isMock) return true;
  if (!context.supabase) {
    throw new Error("Grading 存储未配置 Supabase 客户端");
  }
  return false;
}

function parseAnswerKey(value: Json): AnswerKeyItem[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as AnswerKeyItem[];
}

function parseStats(value: Json | null): GradingStats | null {
  if (!value || typeof value !== "object") return null;
  return value as unknown as GradingStats;
}

function asRow(record: unknown): Record<string, unknown> {
  return record as Record<string, unknown>;
}

function asRows(records: unknown[] | null | undefined): Record<string, unknown>[] {
  return (records ?? []) as unknown as Record<string, unknown>[];
}

function toSession(record: Record<string, unknown>): GradingSession {
  return {
    id: String(record.id),
    teacherId: String(record.teacher_id),
    title: String(record.title),
    courseId: (record.course_id as string | null) ?? null,
    unitId: (record.unit_id as string | null) ?? null,
    topicId: (record.topic_id as string | null) ?? null,
    answerKeySource: String(record.answer_key_source) as GradingSession["answerKeySource"],
    answerKey: parseAnswerKey(record.answer_key as Json),
    rubricId: (record.rubric_id as string | null) ?? null,
    status: String(record.status) as GradingSession["status"],
    studentCount: Number(record.student_count ?? 0),
    questionCount: Number(record.question_count ?? 0),
    stats: parseStats((record.stats as Json | null) ?? null),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  };
}

function toSubmission(record: Record<string, unknown>): GradingSubmission {
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    studentName: String(record.student_name ?? ""),
    fileUrl: (record.file_url as string | null) ?? null,
    storagePath: (record.storage_path as string | null) ?? null,
    pageCount: Number(record.page_count ?? 0),
    ocrResult: (record.ocr_result as GradingSubmission["ocrResult"]) ?? null,
    status: String(record.status) as GradingSubmission["status"],
    totalScore: record.total_score === null ? null : Number(record.total_score),
    maxScore: record.max_score === null ? null : Number(record.max_score),
    gradedAt: (record.graded_at as string | null) ?? null,
    createdAt: String(record.created_at),
  };
}

function toAnswer(record: Record<string, unknown>): GradingAnswer {
  return {
    id: String(record.id),
    submissionId: String(record.submission_id),
    questionNumber: Number(record.question_number),
    studentAnswer: String(record.student_answer ?? ""),
    correctAnswer: String(record.correct_answer ?? ""),
    score: Number(record.score ?? 0),
    maxScore: Number(record.max_score ?? 0),
    aiFeedback: String(record.ai_feedback ?? ""),
    confidence: Number(record.confidence ?? 0),
    questionType: String(record.question_type) as GradingAnswer["questionType"],
    scoringBreakdown: (record.scoring_breakdown as GradingAnswer["scoringBreakdown"]) ?? null,
    needsReview: Boolean(record.needs_review),
    teacherOverrideScore: record.teacher_override_score === null ? null : Number(record.teacher_override_score),
    teacherOverrideFeedback: (record.teacher_override_feedback as string | null) ?? null,
    createdAt: String(record.created_at),
  };
}

function getEffectiveAnswerScore(answer: Pick<GradingAnswer, "score" | "teacherOverrideScore">) {
  return answer.teacherOverrideScore ?? answer.score;
}

function toEffectiveAnswer(answer: GradingAnswer): GradingAnswer {
  const score = getEffectiveAnswerScore(answer);
  if (score === answer.score) return answer;
  return {
    ...answer,
    score,
  };
}

function withEffectiveTotals(submission: GradingSubmission, answers: GradingAnswer[]) {
  if (answers.length === 0) return submission;
  const totalScore = answers.reduce((sum, answer) => sum + getEffectiveAnswerScore(answer), 0);
  const maxScore = answers.reduce((sum, answer) => sum + answer.maxScore, 0);
  return {
    ...submission,
    totalScore,
    maxScore,
  };
}

async function recalculateSessionStatsForSubmission(
  context: LessonPlanContext,
  submissionId: string,
) {
  if (shouldUseMockStore(context)) {
    const store = getMockStore();
    const currentSubmission = store.submissions.get(submissionId);
    if (!currentSubmission) return;

    const session = store.sessions.get(currentSubmission.sessionId);
    if (!session || session.teacherId !== context.teacherId) return;

    const submissions = Array.from(store.submissions.values()).filter(
      (item) => item.sessionId === currentSubmission.sessionId,
    );
    const answersBySubmission = new Map<string, GradingAnswer[]>();
    const effectiveSubmissions = submissions.map((item) => {
      const effectiveAnswers = (store.answers.get(item.id) ?? []).map(toEffectiveAnswer);
      answersBySubmission.set(item.id, effectiveAnswers);
      const nextSubmission = withEffectiveTotals(item, effectiveAnswers);
      store.submissions.set(item.id, nextSubmission);
      return nextSubmission;
    });

    const stats = buildSessionStats({
      submissions: effectiveSubmissions,
      answersBySubmission,
      answerKey: session.answerKey,
    });

    await setSessionStats(
      context,
      session.id,
      stats,
      effectiveSubmissions.filter((item) => item.status === "completed").length,
    );
    return;
  }

  const { data: submissionRow, error: submissionError } = await context.supabase!
    .from("grading_submissions")
    .select(GRADING_SUBMISSION_WITH_SESSION_SELECT)
    .eq("id", submissionId)
    .eq("grading_sessions.teacher_id", context.teacherId)
    .maybeSingle();

  if (submissionError) throw new Error("读取答卷失败");
  if (!submissionRow) return;

  const submission = toSubmission(asRow(submissionRow));
  const session = await getGradingSession(context, submission.sessionId);
  if (!session) return;

  const submissions = await listSessionSubmissions(context, submission.sessionId);
  if (submissions.length === 0) {
    await setSessionStats(context, session.id, buildSessionStats({
      submissions: [],
      answersBySubmission: new Map<string, GradingAnswer[]>(),
      answerKey: session.answerKey,
    }), 0);
    return;
  }

  const submissionIds = submissions.map((item) => item.id);
  const { data: answerRows, error: answersError } = await context.supabase!
    .from("grading_answers")
    .select(GRADING_ANSWER_SELECT)
    .in("submission_id", submissionIds)
    .order("question_number", { ascending: true });

  if (answersError) throw new Error("读取判卷明细失败");

  const answersBySubmission = new Map<string, GradingAnswer[]>();
  submissionIds.forEach((id) => answersBySubmission.set(id, []));
  for (const row of asRows(answerRows)) {
    const answer = toEffectiveAnswer(toAnswer(row));
    const list = answersBySubmission.get(answer.submissionId) ?? [];
    list.push(answer);
    answersBySubmission.set(answer.submissionId, list);
  }

  const effectiveSubmissions = submissions.map((item) =>
    withEffectiveTotals(item, answersBySubmission.get(item.id) ?? []),
  );

  const effectiveSubmission = effectiveSubmissions.find((item) => item.id === submissionId);
  if (effectiveSubmission) {
    const { error: updateError } = await context.supabase!
      .from("grading_submissions")
      .update({
        total_score: effectiveSubmission.totalScore,
        max_score: effectiveSubmission.maxScore,
      })
      .eq("id", submissionId)
      .eq("session_id", submission.sessionId);

    if (updateError) throw new Error("更新答卷总分失败");
  }

  const stats = buildSessionStats({
    submissions: effectiveSubmissions,
    answersBySubmission,
    answerKey: session.answerKey,
  });

  await setSessionStats(
    context,
    session.id,
    stats,
    effectiveSubmissions.filter((item) => item.status === "completed").length,
  );
}

export async function listGradingSessions(context: LessonPlanContext) {
  if (shouldUseMockStore(context)) {
    const items = Array.from(getMockStore().sessions.values())
      .filter((item) => item.teacherId === context.teacherId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return items;
  }

  const { data, error } = await context.supabase!
    .from("grading_sessions")
    .select(GRADING_SESSION_SELECT)
    .eq("teacher_id", context.teacherId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error("读取判卷任务失败");
  return asRows(data).map((row) => toSession(row));
}

export async function createGradingSession(
  context: LessonPlanContext,
  input: { title: string; courseId?: string; unitId?: string; topicId?: string },
) {
  if (shouldUseMockStore(context)) {
    const now = new Date().toISOString();
    const session: GradingSession = {
      id: randomUUID(),
      teacherId: context.teacherId,
      title: input.title,
      courseId: input.courseId ?? null,
      unitId: input.unitId ?? null,
      topicId: input.topicId ?? null,
      answerKeySource: "manual",
      answerKey: [],
      rubricId: null,
      status: "draft",
      studentCount: 0,
      questionCount: 0,
      stats: null,
      createdAt: now,
      updatedAt: now,
    };
    getMockStore().sessions.set(session.id, session);
    return session;
  }

  const { data, error } = await context.supabase!
    .from("grading_sessions")
    .insert({
      teacher_id: context.teacherId,
      title: input.title,
      course_id: input.courseId ?? null,
      unit_id: input.unitId ?? null,
      topic_id: input.topicId ?? null,
    })
    .select(GRADING_SESSION_SELECT)
    .single();

  if (error || !data) throw new Error("创建判卷任务失败");
  return toSession(asRow(data));
}

export async function getGradingSession(context: LessonPlanContext, sessionId: string) {
  if (shouldUseMockStore(context)) {
    const session = getMockStore().sessions.get(sessionId);
    return session && session.teacherId === context.teacherId ? session : null;
  }

  const { data, error } = await context.supabase!
    .from("grading_sessions")
    .select(GRADING_SESSION_SELECT)
    .eq("id", sessionId)
    .eq("teacher_id", context.teacherId)
    .maybeSingle();

  if (error) throw new Error("读取判卷任务失败");
  return data ? toSession(asRow(data)) : null;
}

export async function updateGradingSession(
  context: LessonPlanContext,
  sessionId: string,
  patch: SessionPatch,
) {
  if (shouldUseMockStore(context)) {
    const session = await getGradingSession(context, sessionId);
    if (!session) return null;
    const next: GradingSession = { ...session, ...patch, updatedAt: new Date().toISOString() };
    getMockStore().sessions.set(sessionId, next);
    return next;
  }

  const { data, error } = await context.supabase!
    .from("grading_sessions")
    .update({
      title: patch.title,
      course_id: patch.courseId,
      unit_id: patch.unitId,
      topic_id: patch.topicId,
      status: patch.status,
    })
    .eq("id", sessionId)
    .eq("teacher_id", context.teacherId)
    .select(GRADING_SESSION_SELECT)
    .maybeSingle();

  if (error) throw new Error("更新判卷任务失败");
  return data ? toSession(asRow(data)) : null;
}

export async function deleteGradingSession(context: LessonPlanContext, sessionId: string) {
  if (shouldUseMockStore(context)) {
    const session = await getGradingSession(context, sessionId);
    if (!session) return false;
    getMockStore().sessions.delete(sessionId);
    Array.from(getMockStore().submissions.values())
      .filter((item) => item.sessionId === sessionId)
      .forEach((item) => {
        getMockStore().submissions.delete(item.id);
        getMockStore().answers.delete(item.id);
      });
    return true;
  }

  const { data, error } = await context.supabase!
    .from("grading_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("teacher_id", context.teacherId)
    .select("id");

  if (error) throw new Error("删除判卷任务失败");
  return (data ?? []).length > 0;
}

export async function setSessionAnswerKey(
  context: LessonPlanContext,
  sessionId: string,
  payload: {
    answerKeySource: GradingSession["answerKeySource"];
    answerKey: AnswerKeyItem[];
    rubricId?: string;
  },
) {
  const questionCount = payload.answerKey.length;
  const patch: SessionPatch = { status: "draft" };

  if (shouldUseMockStore(context)) {
    const session = await getGradingSession(context, sessionId);
    if (!session) return null;
    const next: GradingSession = {
      ...session,
      ...patch,
      answerKeySource: payload.answerKeySource,
      answerKey: payload.answerKey,
      rubricId: payload.rubricId ?? null,
      questionCount,
      updatedAt: new Date().toISOString(),
    };
    getMockStore().sessions.set(sessionId, next);
    return next;
  }

  const { data, error } = await context.supabase!
    .from("grading_sessions")
    .update({
      answer_key_source: payload.answerKeySource,
      answer_key: payload.answerKey as unknown as Json,
      rubric_id: payload.rubricId ?? null,
      question_count: questionCount,
      status: "draft",
    })
    .eq("id", sessionId)
    .eq("teacher_id", context.teacherId)
    .select(GRADING_SESSION_SELECT)
    .maybeSingle();

  if (error) throw new Error("保存答案键失败");
  return data ? toSession(asRow(data)) : null;
}

export async function listSessionSubmissions(context: LessonPlanContext, sessionId: string) {
  if (shouldUseMockStore(context)) {
    const session = await getGradingSession(context, sessionId);
    if (!session) return [];
    return Array.from(getMockStore().submissions.values()).filter((item) => item.sessionId === sessionId);
  }

  const { data, error } = await context.supabase!
    .from("grading_submissions")
    .select(GRADING_SUBMISSION_WITH_SESSION_SELECT)
    .eq("session_id", sessionId)
    .eq("grading_sessions.teacher_id", context.teacherId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("读取学生答卷失败");
  return asRows(data).map((row) => toSubmission(row));
}

export async function createSubmission(
  context: LessonPlanContext,
  input: {
    sessionId: string;
    studentName?: string;
    fileUrl?: string;
    storagePath?: string;
    pageCount?: number;
  },
) {
  if (shouldUseMockStore(context)) {
    const id = randomUUID();
    const submission: GradingSubmission = {
      id,
      sessionId: input.sessionId,
      studentName: input.studentName ?? "",
      fileUrl: input.fileUrl ?? null,
      storagePath: input.storagePath ?? null,
      pageCount: input.pageCount ?? 0,
      ocrResult: null,
      status: "pending",
      totalScore: null,
      maxScore: null,
      gradedAt: null,
      createdAt: new Date().toISOString(),
    };
    getMockStore().submissions.set(id, submission);
    return submission;
  }

  const { data, error } = await context.supabase!
    .from("grading_submissions")
    .insert({
      session_id: input.sessionId,
      student_name: input.studentName ?? "",
      file_url: input.fileUrl ?? null,
      storage_path: input.storagePath ?? null,
      page_count: input.pageCount ?? 0,
    })
    .select(GRADING_SUBMISSION_SELECT)
    .single();

  if (error || !data) throw new Error("创建学生答卷失败");
  return toSubmission(asRow(data));
}

export async function getSubmission(context: LessonPlanContext, sessionId: string, submissionId: string) {
  if (shouldUseMockStore(context)) {
    const session = await getGradingSession(context, sessionId);
    const submission = getMockStore().submissions.get(submissionId);
    if (!session || !submission || submission.sessionId !== sessionId) return null;
    return submission;
  }

  const { data, error } = await context.supabase!
    .from("grading_submissions")
    .select(GRADING_SUBMISSION_WITH_SESSION_SELECT)
    .eq("id", submissionId)
    .eq("session_id", sessionId)
    .eq("grading_sessions.teacher_id", context.teacherId)
    .maybeSingle();

  if (error) throw new Error("读取学生答卷失败");
  return data ? toSubmission(asRow(data)) : null;
}

export async function updateSubmission(
  context: LessonPlanContext,
  sessionId: string,
  submissionId: string,
  patch: Partial<GradingSubmission>,
) {
  if (shouldUseMockStore(context)) {
    const current = await getSubmission(context, sessionId, submissionId);
    if (!current) return null;
    const next = { ...current, ...patch };
    getMockStore().submissions.set(submissionId, next);
    return next;
  }

  const { data, error } = await context.supabase!
    .from("grading_submissions")
    .update({
      student_name: patch.studentName,
      file_url: patch.fileUrl,
      storage_path: patch.storagePath,
      page_count: patch.pageCount,
      ocr_result: patch.ocrResult as unknown as Json,
      status: patch.status,
      total_score: patch.totalScore,
      max_score: patch.maxScore,
      graded_at: patch.gradedAt,
    })
    .eq("id", submissionId)
    .eq("session_id", sessionId)
    .select(GRADING_SUBMISSION_SELECT)
    .maybeSingle();

  if (error) throw new Error("更新答卷失败");
  return data ? toSubmission(asRow(data)) : null;
}

export async function deleteSubmission(
  context: LessonPlanContext,
  sessionId: string,
  submissionId: string,
) {
  if (shouldUseMockStore(context)) {
    const submission = await getSubmission(context, sessionId, submissionId);
    if (!submission) return false;
    getMockStore().submissions.delete(submissionId);
    getMockStore().answers.delete(submissionId);
    return true;
  }

  const { data, error } = await context.supabase!
    .from("grading_submissions")
    .delete()
    .eq("id", submissionId)
    .eq("session_id", sessionId)
    .select("id");

  if (error) throw new Error("删除答卷失败");
  return (data ?? []).length > 0;
}

export async function replaceSubmissionAnswers(
  context: LessonPlanContext,
  submissionId: string,
  answers: Omit<GradingAnswer, "id" | "createdAt">[],
) {
  if (shouldUseMockStore(context)) {
    const createdAt = new Date().toISOString();
    const rows = answers.map((item) => ({ ...item, id: randomUUID(), createdAt }));
    getMockStore().answers.set(submissionId, rows);
    return rows;
  }

  if (answers.length === 0) {
    const { error } = await context.supabase!
      .from("grading_answers")
      .delete()
      .eq("submission_id", submissionId);

    if (error) throw new Error("清空判卷结果失败");
    return [];
  }
  const payload = answers.map((item) => ({
    submission_id: submissionId,
    question_number: item.questionNumber,
    student_answer: item.studentAnswer,
    correct_answer: item.correctAnswer,
    score: item.score,
    max_score: item.maxScore,
    ai_feedback: item.aiFeedback,
    confidence: item.confidence,
    question_type: item.questionType,
    scoring_breakdown: item.scoringBreakdown as unknown as Json,
    needs_review: item.needsReview,
    teacher_override_score: item.teacherOverrideScore,
    teacher_override_feedback: item.teacherOverrideFeedback,
  }));

  const { data, error } = await context.supabase!
    .from("grading_answers")
    .insert(payload)
    .select(GRADING_ANSWER_SELECT);

  if (error) throw new Error("写入判卷结果失败");

  const insertedRows = asRows(data);
  const insertedIds = insertedRows.map((row) => String(row.id)).filter(Boolean);
  if (insertedIds.length > 0) {
    const { error: cleanupError } = await context.supabase!
      .from("grading_answers")
      .delete()
      .eq("submission_id", submissionId)
      .not("id", "in", `(${insertedIds.map((id) => `"${id}"`).join(",")})`);

    if (cleanupError) throw new Error("清理旧判卷结果失败");
  }

  return insertedRows.map((row) => toAnswer(row));
}

export async function listSubmissionAnswers(context: LessonPlanContext, submissionId: string) {
  if (shouldUseMockStore(context)) {
    return getMockStore().answers.get(submissionId) ?? [];
  }

  const { data, error } = await context.supabase!
    .from("grading_answers")
    .select(GRADING_ANSWER_SELECT)
    .eq("submission_id", submissionId)
    .order("question_number", { ascending: true });

  if (error) throw new Error("读取判卷明细失败");
  return asRows(data).map((row) => toAnswer(row));
}

export async function setSessionStats(
  context: LessonPlanContext,
  sessionId: string,
  stats: GradingStats,
  studentCount: number,
) {
  if (shouldUseMockStore(context)) {
    const session = getMockStore().sessions.get(sessionId);
    if (!session) return null;
    const next = {
      ...session,
      stats,
      studentCount,
      status: "completed" as const,
      updatedAt: new Date().toISOString(),
    };
    getMockStore().sessions.set(sessionId, next);
    return next;
  }

  const { data, error } = await context.supabase!
    .from("grading_sessions")
    .update({
      stats: stats as unknown as Json,
      student_count: studentCount,
      status: "completed",
    })
    .eq("id", sessionId)
    .eq("teacher_id", context.teacherId)
    .select(GRADING_SESSION_SELECT)
    .maybeSingle();

  if (error) throw new Error("更新统计失败");
  return data ? toSession(asRow(data)) : null;
}

export async function overrideGradingAnswer(
  context: LessonPlanContext,
  answerId: string,
  payload: { score: number; feedback?: string },
) {
  if (shouldUseMockStore(context)) {
    for (const [submissionId, answers] of getMockStore().answers.entries()) {
      const index = answers.findIndex((item) => item.id === answerId);
      if (index >= 0) {
        const current = answers[index];
        const next: GradingAnswer = {
          ...current,
          teacherOverrideScore: payload.score,
          teacherOverrideFeedback: payload.feedback ?? null,
        };
        answers[index] = next;
        getMockStore().answers.set(submissionId, answers);
        try {
          await recalculateSessionStatsForSubmission(context, submissionId);
        } catch (error) {
          console.warn("人工改分后重算统计失败", { answerId, submissionId, error });
        }
        return next;
      }
    }
    return null;
  }

  const { data: answerRow, error: answerQueryError } = await context.supabase!
    .from("grading_answers")
    .select("id, submission_id")
    .eq("id", answerId)
    .maybeSingle();

  if (answerQueryError) throw new Error("读取判卷明细失败");
  if (!answerRow) return null;

  const { data: submission, error: submissionError } = await context.supabase!
    .from("grading_submissions")
    .select("id, grading_sessions!inner(id, teacher_id)")
    .eq("id", answerRow.submission_id)
    .eq("grading_sessions.teacher_id", context.teacherId)
    .maybeSingle();

  if (submissionError) throw new Error("校验教师权限失败");
  if (!submission) return null;

  const { data, error } = await context.supabase!
    .from("grading_answers")
    .update({
      teacher_override_score: payload.score,
      teacher_override_feedback: payload.feedback ?? null,
      needs_review: false,
    })
    .eq("id", answerId)
    .select(GRADING_ANSWER_SELECT)
    .maybeSingle();

  if (error) throw new Error("更新判卷明细失败");
  if (!data) return null;

  const answer = toAnswer(asRow(data));
  try {
    await recalculateSessionStatsForSubmission(context, answer.submissionId);
  } catch (error) {
    console.warn("人工改分后重算统计失败", { answerId, submissionId: answer.submissionId, error });
  }

  return answer;
}

declare global {
  var __gradingMockStore: MockStore | undefined;
}
