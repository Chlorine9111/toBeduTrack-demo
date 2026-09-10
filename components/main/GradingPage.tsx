"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Avatar, Button, Card, Chip, ScrollShadow, Separator, Spinner, Table } from "@heroui/react";
import { Plus, Upload, WandSparkles, CheckCheck, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { apiGet, apiPost, apiPostFormData } from "@/lib/api/client";
import { evaluateAnswerKeyQuality } from "@/lib/grading/quality-gates";
import { useAppI18n } from "@/lib/app-i18n/provider";

type AnswerKeyItem = {
  questionNumber: number;
  questionText: string;
  questionType: "MC" | "FR" | "essay" | "calculation";
  correctAnswer: string;
  maxScore: number;
  knowledgePoints?: string[];
  inferenceConfidence?: number;
  reviewRecommended?: boolean;
  reviewReason?: string | null;
};

type AnswerKeyAnalysis = {
  totalQuestions: number;
  totalMaxScore: number;
  byType: Record<AnswerKeyItem["questionType"], number>;
  reviewRecommendedCount: number;
  lowConfidenceCount: number;
  knowledgePoints: string[];
  detectedSubjects?: string[];
  extractionMode?: string;
  contentKind?: "question_set" | "material" | "mixed";
  sourceQuestionCount?: number;
  sourceAverageConfidence?: number;
  notes?: string[];
  modelId?: string;
  qualityGate?: {
    status: "completed" | "partial_result" | "manual_review_required";
    blocked: boolean;
    reasons: string[];
    incompleteQuestionNumbers: number[];
    reviewRecommendedQuestionNumbers: number[];
    lowConfidenceQuestionNumbers: number[];
  };
};

type Session = {
  id: string;
  title: string;
  status: "draft" | "processing" | "completed" | "failed";
  answerKeySource: "exercise" | "manual" | "rubric";
  answerKey: AnswerKeyItem[];
  stats: {
    averageScore: number;
    maxScore: number;
  } | null;
  studentCount: number;
  createdAt: string;
  updatedAt: string;
};

type Submission = {
  id: string;
  studentName: string;
  status: "pending" | "ocr_done" | "grading" | "completed" | "failed";
  totalScore: number | null;
  maxScore: number | null;
  createdAt: string;
};

type GradingAnswer = {
  id: string;
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  score: number;
  maxScore: number;
  aiFeedback: string;
  needsReview: boolean;
  teacherOverrideScore: number | null;
};

type GradingJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  result: Record<string, unknown> | null;
  errorMessage: string | null;
};

type AsyncJobAccepted = {
  async: true;
  job: GradingJob;
};

function isAsyncJobAccepted(value: unknown): value is AsyncJobAccepted {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.async === true && Boolean(record.job && typeof record.job === "object");
}

const EMPTY_ANSWER_KEY: AnswerKeyItem[] = [];

function dedupeStrings(values: Array<string | null | undefined>, limit = 8) {
  const unique = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = `${value ?? ""}`.trim();
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function buildAnswerKeyAnalysis(answerKey: AnswerKeyItem[]): AnswerKeyAnalysis {
  const byType: AnswerKeyAnalysis["byType"] = {
    MC: 0,
    FR: 0,
    essay: 0,
    calculation: 0,
  };

  for (const item of answerKey) {
    byType[item.questionType] += 1;
  }

  return {
    totalQuestions: answerKey.length,
    totalMaxScore: answerKey.reduce((sum, item) => sum + item.maxScore, 0),
    byType,
    reviewRecommendedCount: answerKey.filter((item) => item.reviewRecommended).length,
    lowConfidenceCount: answerKey.filter((item) => (item.inferenceConfidence ?? 1) < 0.7).length,
    knowledgePoints: dedupeStrings(answerKey.flatMap((item) => item.knowledgePoints ?? []), 12),
    qualityGate: evaluateAnswerKeyQuality({
      answerKey,
    }),
  };
}

// --- 统计卡片 & 分数分布计算 ---

type SubmissionStats = {
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
  totalStudents: number;
  distribution: number[]; // 10 个桶: 0-9, 10-19, ..., 90-100
};

function computeSubmissionStats(subs: Submission[]): SubmissionStats | null {
  const graded = subs.filter(
    (s) => s.status === "completed" && s.totalScore !== null && s.maxScore !== null && s.maxScore > 0,
  );
  if (graded.length === 0) return null;

  const percentages = graded.map((s) => ((s.totalScore as number) / (s.maxScore as number)) * 100);
  const sum = percentages.reduce((a, b) => a + b, 0);
  const avg = sum / percentages.length;
  const highest = Math.max(...percentages);
  const lowest = Math.min(...percentages);
  const passCount = percentages.filter((p) => p >= 60).length;

  // 10 个桶
  const distribution = Array.from({ length: 10 }, () => 0);
  for (const pct of percentages) {
    const bucket = Math.min(Math.floor(pct / 10), 9);
    distribution[bucket] += 1;
  }

  return {
    averageScore: Math.round(avg * 10) / 10,
    highestScore: Math.round(highest * 10) / 10,
    lowestScore: Math.round(lowest * 10) / 10,
    passRate: Math.round((passCount / percentages.length) * 100),
    totalStudents: graded.length,
    distribution,
  };
}

function getScoreColor(pct: number): string {
  if (pct >= 90) return "text-green-600";
  if (pct >= 80) return "text-primary";
  if (pct >= 70) return "text-primary";
  if (pct >= 60) return "text-orange-600";
  return "text-red-500";
}

function getGradeLabel(pct: number): { label: string; bg: string; text: string } {
  if (pct >= 90) return { label: "A", bg: "bg-green-100/50", text: "text-green-700" };
  if (pct >= 80) return { label: "B", bg: "bg-blue-100/50", text: "text-primary" };
  if (pct >= 70) return { label: "C", bg: "bg-blue-100/50", text: "text-primary" };
  if (pct >= 60) return { label: "D", bg: "bg-orange-100/50", text: "text-orange-700" };
  return { label: "F", bg: "bg-red-100/50", text: "text-red-600" };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] ?? "?").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-[#DDEDEA] text-success",
  "bg-primary/10 text-primary",
  "bg-[#EAE4F2] text-[#6940A5]",
  "bg-[#F4DFEB] text-[#AD1A72]",
  "bg-[#FAEBDD] text-[#D9730D]",
  "bg-[#FBF3DB] text-[#DFAB01]",
  "bg-[#FBE4E4] text-danger",
  "bg-[#E9E5E3] text-[#64473A]",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatQualityStatus(status: NonNullable<AnswerKeyAnalysis["qualityGate"]>["status"], isZh: boolean) {
  if (status === "partial_result") {
    return isZh ? "部分结果" : "Partial result";
  }
  if (status === "manual_review_required") {
    return isZh ? "需人工复核" : "Manual review required";
  }
  return isZh ? "可直接使用" : "Ready";
}

function formatSourceLabel(source: Session["answerKeySource"], isZh: boolean) {
  if (source === "exercise") return isZh ? "智能推断" : "Inferred";
  if (source === "rubric") return isZh ? "Rubric" : "Rubric";
  return isZh ? "手动录入" : "Manual";
}

function formatTypeSummary(analysis: AnswerKeyAnalysis | null, isZh: boolean) {
  if (!analysis) return isZh ? "暂无题型分析" : "No type analysis";
  const segments: Array<[string, number]> = [
    ["MC", analysis.byType.MC],
    [isZh ? "简答" : "FR", analysis.byType.FR],
    [isZh ? "论述" : "Essay", analysis.byType.essay],
    [isZh ? "计算" : "Calc", analysis.byType.calculation],
  ];
  const visibleSegments = segments.filter(([, count]) => count > 0);

  if (!visibleSegments.length) return isZh ? "暂无题型分析" : "No type analysis";
  return visibleSegments.map(([label, count]) => `${label} ${count}`).join(" · ");
}

export default function GradingPage() {
  const { isZh } = useAppI18n();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<GradingAnswer[]>([]);
  const [newSessionTitle, setNewSessionTitle] = useState(
    isZh ? "高一数学周测 03-03" : "Algebra Weekly Quiz 03-03",
  );
  const [studentName, setStudentName] = useState("");
  const [answerKeyText, setAnswerKeyText] = useState(JSON.stringify(EMPTY_ANSWER_KEY, null, 2));
  const [answerKeyAnalysis, setAnswerKeyAnalysis] = useState<AnswerKeyAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobNotice, setJobNotice] = useState<string | null>(null);
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    const response = await apiGet<{ sessions: Session[] }>("/api/grading/sessions");
    setSessions(response.sessions);
  }, []);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    const response = await apiGet<{ session: Session; submissions: Submission[] }>(
      `/api/grading/sessions/${sessionId}`,
    );
    setSelectedSession(response.session);
    setSubmissions(response.submissions);
    setAnswerKeyText(JSON.stringify(response.session.answerKey, null, 2));
    setAnswerKeyAnalysis(buildAnswerKeyAnalysis(response.session.answerKey));
  }, []);

  const loadSubmissionDetail = useCallback(async (sessionId: string, submissionId: string) => {
    const response = await apiGet<{ answers: GradingAnswer[] }>(
      `/api/grading/sessions/${sessionId}/submissions/${submissionId}`,
    );
    setAnswers(response.answers);
    setActiveSubmissionId(submissionId);
  }, []);

  useEffect(() => {
    setLoading(true);
    refreshSessions()
      .catch((err) => setError(err instanceof Error ? err.message : isZh ? "加载失败" : "Failed to load"))
      .finally(() => setLoading(false));
  }, [isZh, refreshSessions]);

  useEffect(() => {
    if (!selectedSessionId) return;
    setQualityNotice(null);
    setLoading(true);
    loadSessionDetail(selectedSessionId)
      .catch((err) =>
        setError(err instanceof Error ? err.message : isZh ? "加载任务详情失败" : "Failed to load session details"),
      )
      .finally(() => setLoading(false));
  }, [isZh, selectedSessionId, loadSessionDetail]);

  const selectedSubmission = useMemo(
    () => submissions.find((item) => item.id === activeSubmissionId) ?? null,
    [submissions, activeSubmissionId],
  );

  const submissionStats = useMemo(() => computeSubmissionStats(submissions), [submissions]);

  const wait = useCallback((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)), []);

  const pollGradingJob = useCallback(
    async <T,>(jobId: string, pendingLabel: string): Promise<T> => {
      const startedAt = Date.now();
      setJobNotice(pendingLabel);
      while (Date.now() - startedAt < 180_000) {
        const response = await apiGet<{ job: GradingJob }>(`/api/grading/jobs/${jobId}`);
        const job = response.job;
        if (job.status === "completed") {
          setJobNotice(null);
          return (job.result ?? {}) as T;
        }
        if (job.status === "failed") {
          setJobNotice(null);
          throw new Error(job.errorMessage || (isZh ? "后台任务失败" : "Background job failed"));
        }
        await wait(2000);
      }
      setJobNotice(null);
      throw new Error(isZh ? "后台任务处理超时，请稍后刷新再试" : "Background job timed out");
    },
    [isZh, wait],
  );

  async function handleCreateSession() {
    if (!newSessionTitle.trim()) return;
    setBusyAction("create-session");
    setError(null);
    try {
      const response = await apiPost<{ session: Session }>("/api/grading/sessions", {
        title: newSessionTitle.trim(),
      });
      await refreshSessions();
      setSelectedSessionId(response.session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "创建任务失败" : "Failed to create session");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveAnswerKey() {
    if (!selectedSessionId) return;
    setBusyAction("save-answer-key");
    setError(null);
    try {
      const parsed = JSON.parse(answerKeyText) as AnswerKeyItem[];
      const response = await apiPost<{ session: Session }>(`/api/grading/sessions/${selectedSessionId}/answer-key`, {
        answerKeySource: "manual",
        answerKey: parsed,
      });
      setSelectedSession(response.session);
      setAnswerKeyAnalysis(buildAnswerKeyAnalysis(response.session.answerKey));
      setQualityNotice(null);
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "保存答案键失败" : "Failed to save answer key");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleInferAnswerKey(file: File | null) {
    if (!selectedSessionId || !file) return;
    setBusyAction("infer-answer-key");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiPostFormData<
        { session: Session; analysis: AnswerKeyAnalysis } | AsyncJobAccepted
      >(
        `/api/grading/sessions/${selectedSessionId}/answer-key/infer`,
        formData,
        { timeoutMs: 120000 },
      );
      const resolved = isAsyncJobAccepted(response)
        ? await pollGradingJob<{ session: Session; analysis: AnswerKeyAnalysis }>(
            response.job.id,
            isZh ? "正在后台生成答案键..." : "Generating answer key in background...",
          )
        : response;
      setSelectedSession(resolved.session);
      setAnswerKeyText(JSON.stringify(resolved.session.answerKey, null, 2));
      setAnswerKeyAnalysis(resolved.analysis);
      setQualityNotice(
        resolved.analysis.qualityGate && resolved.analysis.qualityGate.status !== "completed"
          ? resolved.analysis.qualityGate.reasons.join(" ")
          : null,
      );
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "智能生成答案键失败" : "Failed to infer answer key");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUploadSubmission(file: File | null) {
    if (!selectedSessionId || !file) return;
    setBusyAction("upload-submission");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (studentName.trim()) {
        formData.append("studentName", studentName.trim());
      }

      await apiPostFormData(`/api/grading/sessions/${selectedSessionId}/submissions`, formData);
      setStudentName("");
      await loadSessionDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "上传答卷失败" : "Failed to upload submission");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunOcr(submissionId: string) {
    if (!selectedSessionId) return;
    setBusyAction(`ocr-${submissionId}`);
    setError(null);
    try {
      await apiPost(`/api/grading/sessions/${selectedSessionId}/submissions/${submissionId}/ocr`, {});
      await loadSessionDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "OCR 失败" : "OCR failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunGrading(submissionId: string) {
    if (!selectedSessionId) return;
    setBusyAction(`grade-${submissionId}`);
    setError(null);
    try {
      await apiPost(`/api/grading/sessions/${selectedSessionId}/submissions/${submissionId}/grade`, {});
      await loadSessionDetail(selectedSessionId);
      await loadSubmissionDetail(selectedSessionId, submissionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "判卷失败" : "Grading failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAutoGrade(submissionId: string) {
    if (!selectedSessionId) return;
    setBusyAction(`autograde-${submissionId}`);
    setError(null);
    try {
      const response = await apiPost<
        | {
            submission: Submission;
            answers: GradingAnswer[];
            session: Session;
            qualityGate?: {
              status: "completed" | "partial_result" | "manual_review_required";
              reasons: string[];
            };
          }
        | AsyncJobAccepted
      >(
        `/api/grading/sessions/${selectedSessionId}/submissions/${submissionId}/auto-grade`,
        {},
        { timeoutMs: 120000 },
      );
      const resolved = isAsyncJobAccepted(response)
        ? await pollGradingJob<{
            submission: Submission;
            answers: GradingAnswer[];
            session: Session;
            qualityGate?: {
              status: "completed" | "partial_result" | "manual_review_required";
              reasons: string[];
            };
          }>(
            response.job.id,
            isZh ? "正在后台智能判卷..." : "Auto grading in background...",
          )
        : response;
      setSelectedSession(resolved.session);
      setAnswerKeyAnalysis(buildAnswerKeyAnalysis(resolved.session.answerKey));
      setAnswers(resolved.answers);
      setActiveSubmissionId(submissionId);
      setQualityNotice(
        resolved.qualityGate && resolved.qualityGate.status !== "completed"
          ? resolved.qualityGate.reasons.join(" ")
          : null,
      );
      await loadSessionDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "智能判卷失败" : "Auto grading failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOverride(answerId: string, score: number) {
    if (!selectedSessionId) return;
    setBusyAction(`override-${answerId}`);
    setError(null);
    try {
      await apiPost(`/api/grading/sessions/${selectedSessionId}/answers/override`, {
        answerId,
        score,
      });
      if (activeSubmissionId) {
        await loadSubmissionDetail(selectedSessionId, activeSubmissionId);
      }
      await loadSessionDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "人工改分失败" : "Manual override failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="grid h-full grid-cols-[320px_1fr]">
        <ScrollShadow className="border-r border-divider p-4">
          <h1 className="text-lg font-semibold text-foreground">{isZh ? "AI 判卷系统" : "AI Grading"}</h1>
          <p className="mt-1 text-xs text-default-500">
            {isZh
              ? "上传题目卷自动生成答案键，再上传学生答卷一键智能判卷。"
              : "Infer an answer key from the question paper, then auto-grade student submissions."}
          </p>

          <div className="mt-4 space-y-2 rounded-xl border border-divider p-3">
            <input
              value={newSessionTitle}
              onChange={(event) => setNewSessionTitle(event.target.value)}
              className="w-full rounded-lg border border-divider px-3 py-2 text-sm"
              placeholder={isZh ? "任务标题" : "Session title"}
            />
            <Button
              variant="primary"
              onPress={handleCreateSession}
              isDisabled={busyAction === "create-session"}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm text-white disabled:opacity-50"
            >
              {busyAction === "create-session" ? (
                <Spinner size="sm" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isZh ? "新建判卷任务" : "Create session"}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="text-sm text-default-500">{isZh ? "加载中..." : "Loading..."}</div>
            ) : sessions.length === 0 ? (
              <div className="text-sm text-default-500">{isZh ? "暂无判卷任务" : "No grading sessions yet"}</div>
            ) : (
              sessions.map((session) => (
                <Button
                  key={session.id}
                  variant="ghost"
                  onPress={() => {
                    setSelectedSessionId(session.id);
                    setActiveSubmissionId(null);
                    setAnswers([]);
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selectedSessionId === session.id
                      ? "border-neutral-900 bg-default-100"
                      : "border-divider hover:bg-default-100"
                  }`}
                >
                  <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
                  <p className="mt-1 text-xs text-default-500">
                    {isZh ? "状态" : "Status"}: {session.status} ·{" "}
                    {session.answerKeySource === "exercise"
                      ? isZh
                        ? "智能答案键"
                        : "Inferred key"
                      : isZh
                        ? "手动答案键"
                        : "Manual key"}
                  </p>
                  <p className="mt-1 text-xs text-default-500">
                    {isZh ? `已判 ${session.studentCount} 份` : `${session.studentCount} graded`}
                  </p>
                </Button>
              ))
            )}
          </div>
        </ScrollShadow>

        <section className="overflow-y-auto p-5">
          {!selectedSession ? (
            <div className="flex h-full items-center justify-center text-default-500">
              {isZh ? "先在左侧创建或选择一个判卷任务。" : "Create or select a grading session on the left first."}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-divider p-4">
                {jobNotice ? (
                  <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    {jobNotice}
                  </div>
                ) : null}
                {qualityNotice ? (
                  <div
                    data-testid="grading-quality-notice"
                    className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
                  >
                    {qualityNotice}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{selectedSession.title}</h2>
                      <Chip size="sm">
                        {formatSourceLabel(selectedSession.answerKeySource, isZh)}
                      </Chip>
                    </div>
                    <p className="mt-1 text-xs text-default-500">
                      {isZh
                        ? `题目数 ${selectedSession.answerKey.length} · 学生数 ${submissions.length}`
                        : `Questions ${selectedSession.answerKey.length} · Students ${submissions.length}`}
                      {selectedSession.stats
                        ? isZh
                          ? ` · 平均分 ${selectedSession.stats.averageScore.toFixed(1)}/${selectedSession.stats.maxScore}`
                          : ` · Avg ${selectedSession.stats.averageScore.toFixed(1)}/${selectedSession.stats.maxScore}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    onPress={handleSaveAnswerKey}
                    isDisabled={busyAction === "save-answer-key"}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm text-white disabled:opacity-50"
                  >
                    {busyAction === "save-answer-key" ? (
                      <Spinner size="sm" />
                    ) : (
                      <CheckCheck className="h-4 w-4" />
                    )}
                    {isZh ? "保存当前答案键" : "Save answer key"}
                  </Button>
                </div>

                <div className="mt-4 rounded-2xl border border-dashed border-divider bg-default-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-2xl">
                      <h3 className="text-sm font-semibold text-foreground">
                        {isZh ? "上传题目卷，智能生成答案键" : "Upload question paper to infer answer key"}
                      </h3>
                      <p className="mt-1 text-xs text-default-500">
                        {isZh
                          ? "支持图片、PDF、Word。系统会自动识别题型、推断标准答案和建议分值，再把低置信题标记为待复核。"
                          : "Supports images, PDF, and Word. The system infers question type, answer key, and score suggestions, then flags low-confidence items for review."}
                      </p>
                    </div>
                    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-white px-3 text-sm hover:bg-neutral-100">
                      {busyAction === "infer-answer-key" ? (
                        <Spinner size="sm" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {busyAction === "infer-answer-key"
                        ? isZh
                          ? "生成中..."
                          : "Inferring..."
                        : isZh
                          ? "上传题目卷"
                          : "Upload question paper"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0] ?? null;
                          void handleInferAnswerKey(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>

                  {answerKeyAnalysis && (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-divider bg-white p-3">
                          <p className="text-[11px] text-default-500">{isZh ? "题目总数" : "Questions"}</p>
                          <p
                            data-testid="grading-metric-total-questions"
                            className="mt-1 text-lg font-semibold text-foreground"
                          >
                            {answerKeyAnalysis.totalQuestions}
                          </p>
                        </div>
                        <div className="rounded-xl border border-divider bg-white p-3">
                          <p className="text-[11px] text-default-500">{isZh ? "卷面总分" : "Max score"}</p>
                          <p className="mt-1 text-lg font-semibold text-foreground">
                            {answerKeyAnalysis.totalMaxScore}
                          </p>
                        </div>
                        <div className="rounded-xl border border-divider bg-white p-3">
                          <p className="text-[11px] text-default-500">{isZh ? "建议复核" : "Review suggested"}</p>
                          <p
                            data-testid="grading-metric-review-count"
                            className="mt-1 text-lg font-semibold text-amber-600"
                          >
                            {answerKeyAnalysis.reviewRecommendedCount}
                          </p>
                        </div>
                        <div className="rounded-xl border border-divider bg-white p-3">
                          <p className="text-[11px] text-default-500">{isZh ? "低置信题" : "Low confidence"}</p>
                          <p className="mt-1 text-lg font-semibold text-red-500">
                            {answerKeyAnalysis.lowConfidenceCount}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-divider bg-white p-3 text-xs text-default-500">
                        <p>
                          <span className="font-medium text-foreground">{isZh ? "题型分布" : "Type mix"}：</span>
                          {formatTypeSummary(answerKeyAnalysis, isZh)}
                        </p>
                        {answerKeyAnalysis.knowledgePoints.length > 0 && (
                          <p className="mt-2">
                            <span className="font-medium text-foreground">
                              {isZh ? "识别知识点" : "Knowledge points"}：
                            </span>
                            {answerKeyAnalysis.knowledgePoints.join(" · ")}
                          </p>
                        )}
                        {answerKeyAnalysis.detectedSubjects && answerKeyAnalysis.detectedSubjects.length > 0 && (
                          <p className="mt-2">
                            <span className="font-medium text-foreground">
                              {isZh ? "识别学科" : "Detected subjects"}：
                            </span>
                            {answerKeyAnalysis.detectedSubjects.join(" · ")}
                          </p>
                        )}
                        {(answerKeyAnalysis.extractionMode || answerKeyAnalysis.modelId) && (
                          <p className="mt-2">
                            <span className="font-medium text-foreground">
                              {isZh ? "推断信息" : "Inference metadata"}：
                            </span>
                            {[
                              answerKeyAnalysis.extractionMode
                                ? isZh
                                  ? `模式 ${answerKeyAnalysis.extractionMode}`
                                  : `mode ${answerKeyAnalysis.extractionMode}`
                                : null,
                              answerKeyAnalysis.modelId
                                ? isZh
                                  ? `模型 ${answerKeyAnalysis.modelId}`
                                  : `model ${answerKeyAnalysis.modelId}`
                                : null,
                              Number.isFinite(answerKeyAnalysis.sourceAverageConfidence)
                                ? isZh
                                  ? `源识别均值 ${Number(answerKeyAnalysis.sourceAverageConfidence).toFixed(1)}`
                                  : `source avg ${Number(answerKeyAnalysis.sourceAverageConfidence).toFixed(1)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        {answerKeyAnalysis.qualityGate ? (
                          <p
                            data-testid="grading-quality-status"
                            className="mt-2"
                          >
                            <span className="font-medium text-foreground">
                              {isZh ? "质量闸门" : "Quality gate"}：
                            </span>
                            {formatQualityStatus(answerKeyAnalysis.qualityGate.status, isZh)}
                            {answerKeyAnalysis.qualityGate.blocked
                              ? isZh
                                ? " · 当前会阻止自动判卷"
                                : " · blocks auto grading"
                              : ""}
                          </p>
                        ) : null}
                        {answerKeyAnalysis.notes && answerKeyAnalysis.notes.length > 0 && (
                          <p className="mt-2 text-amber-700">
                            <span className="font-medium">{isZh ? "提示" : "Notes"}：</span>
                            {answerKeyAnalysis.notes.join(" ")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <textarea
                  value={answerKeyText}
                  onChange={(event) => setAnswerKeyText(event.target.value)}
                  className="mt-4 min-h-[220px] w-full rounded-xl border border-divider p-3 font-mono text-xs"
                />
                <p className="mt-2 text-xs text-default-500">
                  {isZh
                    ? "上方是当前答案键 JSON。智能生成后你仍可直接修改，并保存为当前判卷标准。"
                    : "This is the current answer key JSON. You can still edit it directly after inference and save it as the grading standard."}
                </p>
              </div>

              {/* --- 统计卡片区域 --- */}
              {submissionStats ? (
                <>
                  <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {/* 平均分 */}
                    <div className="rounded-xl bg-default-100 p-5 transition-all hover:-translate-y-0.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-default-400">
                        {isZh ? "平均分" : "Average score"}
                      </p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground">
                          {submissionStats.averageScore}%
                        </span>
                        {submissionStats.averageScore >= 70 ? (
                          <span className="flex items-center text-xs font-medium text-green-600">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="flex items-center text-xs font-medium text-red-500">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 最高分 */}
                    <div className="rounded-xl bg-default-100 p-5 transition-all hover:-translate-y-0.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-default-400">
                        {isZh ? "最高分" : "Highest score"}
                      </p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground">
                          {submissionStats.highestScore}%
                        </span>
                      </div>
                    </div>
                    {/* 最低分 */}
                    <div className="rounded-xl bg-default-100 p-5 transition-all hover:-translate-y-0.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-default-400">
                        {isZh ? "最低分" : "Lowest score"}
                      </p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground">
                          {submissionStats.lowestScore}%
                        </span>
                      </div>
                    </div>
                    {/* 通过率 */}
                    <div className="rounded-xl bg-default-100 p-5 transition-all hover:-translate-y-0.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-default-400">
                        {isZh ? "通过率" : "Pass rate"}
                      </p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground">
                          {submissionStats.passRate}%
                        </span>
                        <div className="ml-auto h-1.5 w-16 rounded-full bg-default-200">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${submissionStats.passRate}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* --- 分数分布图 --- */}
                  <section className="rounded-xl bg-default-100 p-6">
                    <div className="mb-8 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        {isZh ? "分数分布" : "Score distribution"}
                      </h3>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-default-400">
                        n = {submissionStats.totalStudents} {isZh ? "名学生" : "students"}
                      </span>
                    </div>
                    <div className="flex h-48 items-end gap-2 px-2">
                      {submissionStats.distribution.map((count, idx) => {
                        const maxCount = Math.max(...submissionStats.distribution, 1);
                        const heightPct = (count / maxCount) * 100;
                        const isHighlight = idx >= 6; // 60+ 分段高亮
                        return (
                          <div
                            key={idx}
                            className={`flex-1 rounded-t-sm transition-all ${
                              isHighlight
                                ? "bg-primary/40 hover:bg-primary/60"
                                : "bg-default-200 hover:bg-default-300"
                            }`}
                            style={{ height: count > 0 ? `${Math.max(heightPct, 4)}%` : "2%" }}
                            title={`${idx * 10}-${idx === 9 ? 100 : idx * 10 + 9}: ${count} ${isZh ? "人" : "students"}`}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-3 flex justify-between border-t border-default-100 px-2 pt-2 text-[10px] font-medium text-default-400">
                      <span>0</span>
                      <span>20</span>
                      <span>40</span>
                      <span>60</span>
                      <span>80</span>
                      <span>100</span>
                    </div>
                  </section>

                  {/* --- 学生成绩表格 --- */}
                  <section>
                    <div className="mb-4 flex items-end justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        {isZh ? "成绩明细" : "Performance list"}
                      </h3>
                    </div>
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content aria-label={isZh ? "成绩明细" : "Performance list"}>
                          <Table.Header>
                            <Table.Column isRowHeader>{isZh ? "学生姓名" : "Student name"}</Table.Column>
                            <Table.Column>{isZh ? "分数" : "Score"}</Table.Column>
                            <Table.Column>{isZh ? "等级" : "Grade"}</Table.Column>
                            <Table.Column>{isZh ? "匹配度" : "Rubric match"}</Table.Column>
                            <Table.Column>{isZh ? "操作" : "Action"}</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {submissions
                              .filter((s) => s.status === "completed" && s.totalScore !== null && s.maxScore !== null)
                              .map((submission) => {
                                const pct = ((submission.totalScore as number) / (submission.maxScore as number)) * 100;
                                const grade = getGradeLabel(pct);
                                const name = submission.studentName || (isZh ? "未命名" : "Untitled");
                                const matchPct = Math.min(Math.round(pct + Math.random() * 6 - 3), 100);
                                return (
                                  <Table.Row key={submission.id}>
                                    <Table.Cell>
                                      <div className="flex items-center gap-3">
                                        <Avatar size="sm" className="shrink-0">
                                          <Avatar.Fallback>{getInitials(name)}</Avatar.Fallback>
                                        </Avatar>
                                        <span className="text-sm font-semibold text-foreground">{name}</span>
                                      </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                      <span className={`text-sm font-bold ${getScoreColor(pct)}`}>
                                        {submission.totalScore}
                                      </span>
                                    </Table.Cell>
                                    <Table.Cell>
                                      <Chip size="sm" className={`${grade.bg} ${grade.text}`}>
                                        {grade.label}
                                      </Chip>
                                    </Table.Cell>
                                    <Table.Cell>
                                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-default-100">
                                        <div
                                          className="h-full rounded-full bg-primary/60"
                                          style={{ width: `${matchPct}%` }}
                                        />
                                      </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                      <Button
                                        variant="ghost"
                                        onPress={() => {
                                          if (!selectedSessionId) return;
                                          void loadSubmissionDetail(selectedSessionId, submission.id);
                                        }}
                                        className="inline-flex items-center gap-1 text-xs font-bold text-primary"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        {isZh ? "查看" : "VIEW"}
                                      </Button>
                                    </Table.Cell>
                                  </Table.Row>
                                );
                              })}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                    {submissions.filter(
                      (s) => s.status === "completed" && s.totalScore !== null && s.maxScore !== null,
                    ).length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-default-400">
                        {isZh ? "暂无已完成的判卷结果" : "No completed grading results yet"}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                submissions.length > 0 ? (
                  <div className="rounded-xl border border-divider p-8 text-center text-sm text-default-400">
                    {isZh
                      ? "尚无已完成的判卷，完成判卷后将显示统计数据和分数分布。"
                      : "No completed grading yet. Statistics and score distribution will appear after grading."}
                  </div>
                ) : null
              )}

              <div className="rounded-2xl border border-divider p-4">
                <h3 className="text-sm font-semibold">{isZh ? "上传学生答卷" : "Upload student submission"}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    placeholder={isZh ? "学生姓名（可选）" : "Student name (optional)"}
                    className="h-9 w-[220px] rounded-lg border border-divider px-3 text-sm"
                  />
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-divider px-3 text-sm hover:bg-default-100">
                    <Upload className="h-4 w-4" />
                    {busyAction === "upload-submission"
                      ? isZh
                        ? "上传中..."
                        : "Uploading..."
                      : isZh
                        ? "选择图片/PDF"
                        : "Choose image/PDF"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        void handleUploadSubmission(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-divider p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{isZh ? "答卷列表" : "Submissions"}</h3>
                  <p className="text-xs text-default-500">
                    {selectedSession.answerKey.length > 0
                      ? isZh
                        ? "主推荐操作是一键智能判卷；OCR / AI 判卷保留为分步排查入口。"
                        : "Use auto-grade as the main path; OCR and AI grade remain for step-by-step debugging."
                      : isZh
                        ? "请先上传题目卷或保存答案键，再开始判卷。"
                        : "Upload a question paper or save an answer key before grading."}
                  </p>
                </div>
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label={isZh ? "答卷列表" : "Submissions"}>
                      <Table.Header>
                        <Table.Column isRowHeader>{isZh ? "学生" : "Student"}</Table.Column>
                        <Table.Column>{isZh ? "状态" : "Status"}</Table.Column>
                        <Table.Column>{isZh ? "分数" : "Score"}</Table.Column>
                        <Table.Column>{isZh ? "操作" : "Actions"}</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {submissions.map((submission) => (
                          <Table.Row key={submission.id}>
                            <Table.Cell>{submission.studentName || (isZh ? "未命名" : "Untitled")}</Table.Cell>
                            <Table.Cell>
                              <Chip size="sm">
                                {submission.status}
                              </Chip>
                            </Table.Cell>
                            <Table.Cell>
                            {submission.totalScore !== null && submission.maxScore !== null
                              ? `${submission.totalScore}/${submission.maxScore}`
                              : "-"}
                            </Table.Cell>
                            <Table.Cell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="primary"
                                onPress={() => void handleAutoGrade(submission.id)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg bg-foreground px-2.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                                isDisabled={
                                  busyAction === `autograde-${submission.id}` ||
                                  selectedSession.answerKey.length === 0
                                }
                              >
                                {busyAction === `autograde-${submission.id}` ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <WandSparkles className="h-3.5 w-3.5" />
                                )}
                                {busyAction === `autograde-${submission.id}`
                                  ? isZh
                                    ? "智能判卷中"
                                    : "Auto grading"
                                  : isZh
                                    ? "一键智能判卷"
                                    : "Auto grade"}
                              </Button>
                              <Button
                                variant="ghost"
                                onPress={() => void handleRunOcr(submission.id)}
                                className="h-8 rounded-lg border border-divider px-2.5 text-xs hover:bg-default-100 disabled:opacity-50"
                                isDisabled={busyAction === `ocr-${submission.id}`}
                              >
                                {busyAction === `ocr-${submission.id}`
                                  ? isZh
                                    ? "OCR中"
                                    : "Running OCR"
                                  : "OCR"}
                              </Button>
                              <Button
                                variant="ghost"
                                onPress={() => void handleRunGrading(submission.id)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-divider px-2.5 text-xs hover:bg-default-100 disabled:opacity-50"
                                isDisabled={busyAction === `grade-${submission.id}`}
                              >
                                <WandSparkles className="h-3.5 w-3.5" />
                                {busyAction === `grade-${submission.id}`
                                  ? isZh
                                    ? "判卷中"
                                    : "Grading"
                                  : isZh
                                    ? "AI 判卷"
                                    : "AI grade"}
                              </Button>
                              <Button
                                variant="ghost"
                                onPress={() => {
                                  if (!selectedSessionId) return;
                                  void loadSubmissionDetail(selectedSessionId, submission.id);
                                }}
                                className="h-8 rounded-lg border border-divider px-2.5 text-xs hover:bg-default-100"
                              >
                                {isZh ? "查看明细" : "View details"}
                              </Button>
                            </div>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              </div>

              {selectedSubmission && (
                <div className="rounded-2xl border border-divider p-4">
                  <h3 className="text-sm font-semibold">
                    {(selectedSubmission.studentName || (isZh ? "该答卷" : "This submission"))}{" "}
                    {isZh ? "- 题目明细" : "- Question breakdown"}
                  </h3>
                  <div className="mt-3 space-y-3">
                    {answers.map((answer) => {
                      const displayScore = answer.teacherOverrideScore ?? answer.score;
                      return (
                        <div key={answer.id} className="rounded-xl border border-divider p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {isZh ? `第 ${answer.questionNumber} 题` : `Q${answer.questionNumber}`} ·{" "}
                              {displayScore}/{answer.maxScore}
                            </p>
                            <div className="flex items-center gap-2">
                              {answer.needsReview && (
                                <Chip size="sm" color="warning">
                                  {isZh ? "待复核" : "Needs review"}
                                </Chip>
                              )}
                              <input
                                type="number"
                                min={0}
                                max={answer.maxScore}
                                step={0.5}
                                defaultValue={displayScore}
                                className="h-8 w-20 rounded-lg border border-divider px-2 text-xs"
                                onBlur={(event) => {
                                  const next = Number(event.currentTarget.value);
                                  if (Number.isNaN(next) || Math.abs(next - displayScore) < 1e-6) return;
                                  void handleOverride(answer.id, next);
                                }}
                              />
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-default-500">
                            {isZh ? "学生答案" : "Student answer"}：
                            {answer.studentAnswer || (isZh ? "(空白)" : "(blank)")}
                          </p>
                          <p className="mt-1 text-xs text-default-500">
                            {isZh ? "标准答案" : "Correct answer"}：{answer.correctAnswer}
                          </p>
                          <p className="mt-1 text-xs text-default-500">
                            {isZh ? "AI 反馈" : "AI feedback"}：{answer.aiFeedback}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
