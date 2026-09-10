"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, FileUp, Loader2, Save, Upload, UploadCloud, X } from "lucide-react";
import { apiPost, apiPostFormData } from "@/lib/api/client";
import {
  formatUnitOptionLabel,
  requestJson,
  type CourseOption,
  type CurriculumOptionsResponse,
  type UnitOption,
} from "@/components/main/question-bank/helpers";
import type {
  QuestionBankAiSearchResult,
  QuestionBankSplitCommitResponse,
  QuestionBankSplitDocument,
  QuestionBankSplitQuestion,
  QuestionBankSplitRewriteResponse,
  QuestionBankSplitScanResponse,
  PersistedQuestionBankSplitDocument,
} from "@/components/main/question-bank/split-editor/types";
import type { TikuSearchResponse, TikuSearchResultRow } from "@/lib/tiku/types";
import {
  QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY,
  buildDefaultRewriteInstruction,
  buildExportMarkdown,
  buildOutlineSections,
  buildReplaceInstruction,
  createQueuedDocument,
  downloadTextFile,
  fromPersistedDocuments,
  mapAiResultToSplitQuestion,
  nextQuestionId,
  normalizeQuestionForCommit,
  normalizeSplitQuestion,
  sanitizeText,
  toPersistedDocuments,
} from "@/components/main/question-bank/split-editor/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";

const MAX_CONCURRENT_UPLOADS = 3;
const SCAN_TIMEOUT_MS = 240_000;
const STORAGE_DEBOUNCE_MS = 280;

function SplitSidebarLoading() {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[rgba(55,53,47,0.08)] bg-[#fbfbf8]">
      <div className="border-b border-[rgba(55,53,47,0.08)] px-3 py-3">
        <div className="h-10 rounded-xl bg-[#f1f1eb]" />
      </div>
      <div className="space-y-3 px-3 py-3">
        <div className="h-20 rounded-2xl bg-[#f5f5ef]" />
        <div className="h-20 rounded-2xl bg-[#f5f5ef]" />
        <div className="h-20 rounded-2xl bg-[#f5f5ef]" />
      </div>
      <div className="mt-auto border-t border-[rgba(55,53,47,0.08)] px-3 py-3">
        <div className="h-4 w-28 rounded bg-[#f1f1eb]" />
      </div>
    </aside>
  );
}

function SplitEditorLoading() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-5 py-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-10 rounded-lg bg-[#f3f3ee]" />
          <div className="h-10 rounded-lg bg-[#f3f3ee]" />
          <div className="h-10 rounded-lg bg-[#f3f3ee]" />
          <div className="h-10 rounded-lg bg-[#f3f3ee]" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#f2f2ee] px-4 py-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[880px] flex-col border border-[rgba(55,53,47,0.08)] bg-white px-8 py-8 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <div className="h-10 w-1/2 self-center rounded bg-[#f3f3ee]" />
          <div className="mt-8 space-y-4">
            <div className="h-32 rounded-[24px] bg-[#f7f7f2]" />
            <div className="h-32 rounded-[24px] bg-[#f7f7f2]" />
          </div>
        </div>
      </div>
    </section>
  );
}

const ModuleTour = dynamic(
  () => import("@/components/product-tour").then((mod) => mod.ModuleTour),
  { loading: () => null },
);

const DocumentSidebar = dynamic(
  () => import("@/components/main/question-bank/split-editor/DocumentSidebar"),
  { loading: () => <SplitSidebarLoading /> },
);

const ExamPaperView = dynamic(
  () => import("@/components/main/question-bank/split-editor/ExamPaperView"),
  { loading: () => <SplitEditorLoading /> },
);

const AiSearchPanel = dynamic(
  () => import("@/components/main/question-bank/split-editor/AiSearchPanel"),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center px-4 text-sm text-[#37352F]/50">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载 AI 检索中...
      </div>
    ),
  },
);

function formatTimestamp(date = new Date()) {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function QuestionBankSplitWorkspacePage() {
  const { isZh } = useAppI18n();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const documentsRef = useRef<QuestionBankSplitDocument[]>([]);
  const queueRef = useRef<string[]>([]);
  const processingCountRef = useRef(0);
  const stageTimerRef = useRef<Record<string, number[]>>({});
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [documents, setDocuments] = useState<QuestionBankSplitDocument[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [commitLoadingDocumentId, setCommitLoadingDocumentId] = useState("");
  const [rewriteLoadingQuestionId, setRewriteLoadingQuestionId] = useState("");
  const [draggingQuestionId, setDraggingQuestionId] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<QuestionBankAiSearchResult[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatusText, setAiStatusText] = useState("");
  const [aiErrorText, setAiErrorText] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId],
  );
  const activeQuestion = useMemo(
    () =>
      activeDocument?.questions.find(
        (question) => question.id === activeDocument.activeQuestionId,
      ) ?? null,
    [activeDocument],
  );
  const outlineSections = useMemo(
    () => buildOutlineSections(activeDocument?.questions ?? []),
    [activeDocument?.questions],
  );

  documentsRef.current = documents;

  useEffect(() => {
    let cancelled = false;

    void requestJson<CurriculumOptionsResponse>("/api/curriculum/options", {
      timeoutMs: 15_000,
      retry: 1,
    })
      .then((response) => {
        if (cancelled) return;
        setCourses(Array.isArray(response.courses) ? response.courses : []);
        setUnits(Array.isArray(response.units) ? response.units : []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[split-workspace] failed to load curriculum options", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedQuestionBankSplitDocument[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const restored = fromPersistedDocuments(parsed)
        .filter((doc) => !doc.importBatchId && !doc.importedAt);
      if (restored.length === 0) {
        window.localStorage.removeItem(QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY);
        return;
      }
      setDocuments(restored);
      setActiveDocumentId(restored[0]?.id ?? "");
      setStatusText(isZh ? "已恢复上次暂存的未入库编辑内容。" : "Restored previously saved draft content.");
    } catch {
      window.localStorage.removeItem(QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (documents.length === 0) {
        window.localStorage.removeItem(QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY,
        JSON.stringify(toPersistedDocuments(documents)),
      );
    }, STORAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [documents]);

  useEffect(() => {
    if (documents.length === 0) {
      if (activeDocumentId) setActiveDocumentId("");
      return;
    }
    if (!documents.some((document) => document.id === activeDocumentId)) {
      setActiveDocumentId(documents[0]?.id ?? "");
    }
  }, [documents, activeDocumentId]);

  useEffect(() => {
    return () => {
      Object.values(stageTimerRef.current).forEach((timers) => {
        timers.forEach((timerId) => window.clearTimeout(timerId));
      });
    };
  }, []);

  function persistDocumentsNow(nextDocuments: QuestionBankSplitDocument[]) {
    if (nextDocuments.length === 0) {
      window.localStorage.removeItem(QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      QUESTION_BANK_SPLIT_EDITOR_STORAGE_KEY,
      JSON.stringify(toPersistedDocuments(nextDocuments)),
    );
  }

  function updateDocument(
    documentId: string,
    updater: (document: QuestionBankSplitDocument) => QuestionBankSplitDocument,
  ) {
    setDocuments((current) =>
      current.map((document) =>
        document.id === documentId ? updater(document) : document,
      ),
    );
  }

  function updateActiveDocument(
    updater: (document: QuestionBankSplitDocument) => QuestionBankSplitDocument,
  ) {
    if (!activeDocument) return;
    updateDocument(activeDocument.id, updater);
  }

  function updateQuestion(
    documentId: string,
    questionId: string,
    updater: (question: QuestionBankSplitQuestion) => QuestionBankSplitQuestion,
  ) {
    updateDocument(documentId, (document) => ({
      ...document,
      questions: document.questions.map((question) =>
        question.id === questionId ? updater(question) : question,
      ),
    }));
  }

  function clearStageTimers(documentId: string) {
    const timers = stageTimerRef.current[documentId] ?? [];
    timers.forEach((timerId) => window.clearTimeout(timerId));
    delete stageTimerRef.current[documentId];
  }

  function setProgressHint(
    documentId: string,
    progress: number,
    progressLabel: string,
  ) {
    updateDocument(documentId, (document) => {
      if (document.status === "completed" || document.status === "failed") {
        return document;
      }
      return {
        ...document,
        status: progress >= 30 ? "processing" : "uploading",
        progress,
        progressLabel,
      };
    });
  }

  function scheduleProcessingHints(documentId: string) {
    clearStageTimers(documentId);
    stageTimerRef.current[documentId] = [
      window.setTimeout(() => {
        setProgressHint(documentId, 42, isZh ? "OCR 中" : "OCR processing");
      }, 700),
      window.setTimeout(() => {
        setProgressHint(documentId, 78, isZh ? "AI 解析中" : "AI parsing");
      }, 2400),
    ];
  }

  async function processDocument(documentId: string) {
    const document = documentsRef.current.find((item) => item.id === documentId);
    if (!document) {
      processingCountRef.current = Math.max(processingCountRef.current - 1, 0);
      pumpQueue();
      return;
    }

    if (!document.file) {
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        progress: 0,
        progressLabel: isZh ? "缺少原始文件" : "Missing source file",
        errorText: isZh ? "这个草稿来自本地暂存，浏览器没有保留原始 PDF，请重新上传后再入库。" : "This draft was restored from local storage. The original PDF was not preserved. Please re-upload.",
      }));
      processingCountRef.current = Math.max(processingCountRef.current - 1, 0);
      pumpQueue();
      return;
    }

    updateDocument(documentId, (current) => ({
      ...current,
      status: "uploading",
      progress: 14,
      progressLabel: isZh ? "上传中" : "Uploading",
      errorText: "",
    }));
    scheduleProcessingHints(documentId);

    try {
      const selectedCourse =
        courses.find((course) => course.id === document.courseId) ?? null;
      const formData = new FormData();
      formData.set("file", document.file);
      formData.set("visibility", document.visibility);
      const subjectHint = [
        selectedCourse?.name ?? "",
        sanitizeText(document.curriculumHint),
      ]
        .filter(Boolean)
        .join(" · ");
      if (subjectHint) {
        formData.set("subject", subjectHint);
      }
      if (document.curriculumHint) {
        formData.set("curriculumHint", document.curriculumHint);
      }

      const response = await apiPostFormData<QuestionBankSplitScanResponse>(
        "/api/question-bank/split/scan",
        formData,
        { timeoutMs: SCAN_TIMEOUT_MS },
      );

      const questions = response.questions.map((question) =>
        normalizeSplitQuestion({
          id: nextQuestionId(),
          exerciseType: question.exerciseType,
          difficulty: question.difficulty,
          questionText: question.questionText,
          options: question.options ?? null,
          correctAnswer: question.correctAnswer ?? "",
          solutionSteps: question.solutionSteps ?? "",
          subject: question.subject ?? selectedCourse?.name ?? null,
          knowledgePoints: question.knowledgePoint ? [question.knowledgePoint] : [],
          sourcePageStart: question.sourcePageNumber ?? null,
          sourceConfidence: question.confidence ?? null,
          reviewFlag:
            question.reviewTier === "critical" || question.reviewTier === "review"
              ? "disputed"
              : null,
          reviewFlagReason:
            question.reviewReasons.length > 0
              ? question.reviewReasons.join("；")
              : null,
          isLowConfidence: question.isLowConfidence,
          sectionTitle: question.sourcePageNumber
            ? `第 ${question.sourcePageNumber} 页`
            : null,
        }),
      );

      clearStageTimers(documentId);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "completed",
        progress: 100,
        progressLabel: isZh ? `拆题完成 · ${questions.length} 题` : `Done · ${questions.length} questions`,
        questionCount: questions.length,
        sourceFilePath: response.uploadId,
        extractionMode: response.extractionMode,
        analysis: response.analysis,
        questions,
        fileType: response.fileType ?? "",
        rejectedCount: response.rejectedCount ?? 0,
        activeQuestionId: questions[0]?.id ?? null,
        curriculumHint: current.curriculumHint || selectedCourse?.name || "",
      }));
      setStatusText(isZh ? `${document.fileName} 已完成拆题，共识别 ${questions.length} 道题。` : `${document.fileName} split complete. ${questions.length} questions detected.`);
      if (!activeDocumentId) {
        setActiveDocumentId(documentId);
      }
    } catch (error) {
      clearStageTimers(documentId);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        progress: 0,
        progressLabel: isZh ? "处理失败" : "Processing failed",
        errorText: error instanceof Error ? error.message : (isZh ? "拆题失败" : "Split failed"),
      }));
      setErrorText(error instanceof Error ? error.message : (isZh ? "拆题失败" : "Split failed"));
    } finally {
      processingCountRef.current = Math.max(processingCountRef.current - 1, 0);
      pumpQueue();
    }
  }

  function pumpQueue() {
    while (
      processingCountRef.current < MAX_CONCURRENT_UPLOADS &&
      queueRef.current.length > 0
    ) {
      const nextId = queueRef.current.shift();
      if (!nextId) break;
      processingCountRef.current += 1;
      void processDocument(nextId);
    }
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    const queuedDocuments = Array.from(files).map((file) => createQueuedDocument(file));
    setDocuments((current) => [...current, ...queuedDocuments]);
    setActiveDocumentId((current) => current || queuedDocuments[0]?.id || "");
    queueRef.current.push(...queuedDocuments.map((document) => document.id));
    setStatusText(isZh ? `已加入 ${queuedDocuments.length} 份文档，开始并行拆题。` : `${queuedDocuments.length} documents queued. Processing started.`);
    setErrorText("");
    setAiErrorText("");
    window.setTimeout(() => {
      pumpQueue();
    }, 0);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleRemoveDocument(documentId: string) {
    // 从队列中移除（如果还在等待处理）
    queueRef.current = queueRef.current.filter((id) => id !== documentId);
    clearStageTimers(documentId);

    setDocuments((current) => {
      const next = current.filter((document) => document.id !== documentId);
      persistDocumentsNow(next);
      return next;
    });

    if (activeDocumentId === documentId) {
      setActiveDocumentId("");
    }
    setStatusText(isZh ? "已删除该文档。" : "Document removed.");
  }

  function handleRetryDocument(documentId: string) {
    const document = documentsRef.current.find((item) => item.id === documentId);
    if (!document) return;
    if (!document.file) {
      setErrorText(isZh ? "当前暂存没有原始文件，不能直接重试。请重新上传这份 PDF。" : "No source file in cache. Please re-upload the PDF.");
      return;
    }
    updateDocument(documentId, (current) => ({
      ...current,
      status: "queued",
      progress: 0,
      progressLabel: isZh ? "等待处理" : "Queued",
      errorText: "",
    }));
    queueRef.current.push(documentId);
    pumpQueue();
  }

  function handleToggleQuestion(questionId: string) {
    updateActiveDocument((current) => ({
      ...current,
      activeQuestionId: current.activeQuestionId === questionId ? null : questionId,
    }));
  }

  function handleSetActiveQuestion(questionId: string | null) {
    updateActiveDocument((current) => ({
      ...current,
      activeQuestionId: questionId,
    }));
  }

  function handleScrollToQuestion(questionId: string) {
    handleSetActiveQuestion(questionId);
    questionRefs.current[questionId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function handleRemoveQuestion(questionId: string) {
    if (!activeDocument) return;
    updateDocument(activeDocument.id, (current) => {
      const nextQuestions = current.questions.filter(
        (question) => question.id !== questionId,
      );
      return {
        ...current,
        questions: nextQuestions,
        questionCount: nextQuestions.length,
        activeQuestionId:
          current.activeQuestionId === questionId
            ? nextQuestions[0]?.id ?? null
            : current.activeQuestionId,
      };
    });
  }

  function moveQuestion(questionId: string, beforeQuestionId?: string) {
    if (!activeDocument) return;
    updateDocument(activeDocument.id, (current) => {
      const currentIndex = current.questions.findIndex(
        (question) => question.id === questionId,
      );
      if (currentIndex < 0) return current;

      const remaining = current.questions.filter((question) => question.id !== questionId);
      const moving = current.questions[currentIndex];

      if (!moving) return current;

      if (!beforeQuestionId || beforeQuestionId === questionId) {
        return {
          ...current,
          questions: [...remaining, moving],
          activeQuestionId: moving.id,
        };
      }

      const targetIndex = remaining.findIndex(
        (question) => question.id === beforeQuestionId,
      );
      if (targetIndex < 0) {
        return {
          ...current,
          questions: [...remaining, moving],
          activeQuestionId: moving.id,
        };
      }

      const nextQuestions = [...remaining];
      nextQuestions.splice(targetIndex, 0, moving);
      return {
        ...current,
        questions: nextQuestions,
        activeQuestionId: moving.id,
      };
    });
  }

  function handleSaveDocument() {
    if (!activeDocument) return;
    const nextDocuments = documentsRef.current.map((document) =>
      document.id === activeDocument.id
        ? {
            ...document,
            lastSavedAt: formatTimestamp(),
          }
        : document,
    );
    setDocuments(nextDocuments);
    persistDocumentsNow(nextDocuments);
    setStatusText(
      isZh
        ? `${activeDocument.label || activeDocument.fileName} 已暂存于本地浏览器会话。`
        : `${activeDocument.label || activeDocument.fileName} saved to local browser session.`,
    );
  }

  async function handleCommitDocument() {
    if (!activeDocument || commitLoadingDocumentId) return;
    if (!activeDocument.sourceFilePath && !activeDocument.file) {
      setErrorText(isZh ? "缺少源文件，请重新上传后再入库。" : "Missing source file. Please re-upload before committing.");
      return;
    }
    if (!activeDocument.courseId) {
      setErrorText(isZh ? "请先选择 AP 课程后再入库。" : "Select an AP course before saving.");
      return;
    }
    if (activeDocument.questions.length === 0) {
      setErrorText(isZh ? "至少保留一道题后才能入库。" : "Keep at least one question before committing.");
      return;
    }

    setCommitLoadingDocumentId(activeDocument.id);
    setErrorText("");

    try {
      const selectedCourse =
        courses.find((course) => course.id === activeDocument.courseId) ?? null;
      const selectedUnit =
        units.find((unit) => unit.id === activeDocument.unitId) ?? null;
      const response = await apiPost<QuestionBankSplitCommitResponse>(
        "/api/question-bank/split/commit",
        {
          uploadId: activeDocument.sourceFilePath,
          label: activeDocument.label || activeDocument.fileName,
          courseId: activeDocument.courseId || null,
          unitId: activeDocument.unitId || null,
          curriculumHint:
            sanitizeText(activeDocument.curriculumHint)
            || selectedCourse?.name
            || null,
          questions: activeDocument.questions.map((question, index) => {
            const normalized = normalizeQuestionForCommit(question);
            return {
              ...normalized,
              questionNumber: index + 1,
              subject: question.subject ?? selectedCourse?.name ?? null,
              knowledgePoint: question.knowledgePoints?.[0] ?? null,
              sourcePageNumber: question.sourcePageStart ?? null,
              originalQuestionType: question.exerciseType,
              sourceType:
                activeDocument.fileType === "image"
                  ? "image"
                  : activeDocument.fileType === "word"
                    ? "word"
                    : "pdf",
            };
          }),
        },
        { timeoutMs: SCAN_TIMEOUT_MS },
      );

      const importedAt =
        response.status === "saved" || response.status === "already_saved"
          ? formatTimestamp()
          : null;
      updateDocument(activeDocument.id, (current) => ({
        ...current,
        status:
          response.status === "saved" || response.status === "already_saved"
            ? "completed"
            : response.status === "failed"
              ? "failed"
              : current.status,
        progress:
          response.status === "saved" || response.status === "already_saved"
            ? 100
            : current.progress,
        progressLabel: response.message,
        importBatchId: response.importBatchId,
        importedAt,
        lastSavedAt: importedAt ?? current.lastSavedAt,
        errorText: response.status === "failed" ? response.message : "",
        curriculumHint:
          sanitizeText(current.curriculumHint)
          || selectedUnit
          || selectedCourse
          ? [
              sanitizeText(current.curriculumHint),
              selectedCourse?.name ?? "",
              selectedUnit ? formatUnitOptionLabel(selectedUnit) : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : current.curriculumHint,
      }));
      setStatusText(
        isZh
          ? `${response.fileName}：${response.message}`
          : `${response.fileName}: ${response.message}`,
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : (isZh ? "入库失败" : "Commit failed"));
    } finally {
      setCommitLoadingDocumentId("");
    }
  }

  function handleExportDocument() {
    if (!activeDocument) return;
    const content = buildExportMarkdown(activeDocument);
    downloadTextFile(
      `${activeDocument.label || activeDocument.fileName || "question-bank-split"}.md`,
      content,
    );
    setStatusText(isZh ? "已导出当前试卷的 Markdown 版本。" : "Exported Markdown version of current paper.");
  }

  function mapTikuRowToAiResult(row: TikuSearchResultRow): QuestionBankAiSearchResult {
    const choiceEntries = Object.entries(row.choices ?? {}).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    const difficultyNum =
      row.difficulty === "easy" ? 1 : row.difficulty === "medium" ? 2 : 3;

    return {
      id: row.id,
      questionText: row.stem,
      exerciseType: "MC",
      difficulty: difficultyNum,
      options: choiceEntries.map(([label, choice]) => ({
        label,
        text: choice.text,
        isCorrect: label === row.correct_answer,
      })),
      correctAnswer: row.correct_answer,
      solutionSteps: row.explanation ?? "",
      knowledgePoints: row.key_concepts ?? [],
      subject: row.course,
      gradeLevel: row.unit ? `Unit ${row.unit}` : null,
      sourceKind: "ai",
      tags: row.cognitive_task ? [row.cognitive_task] : [],
    };
  }

  async function runAiSearch(instructionOverride?: string) {
    if (!activeDocument) return;

    const explicitInstruction = sanitizeText(instructionOverride || aiQuery);
    const referenceQuestion = activeQuestion;
    const queryText = [
      explicitInstruction || "请基于当前参考题推荐几道可替换的题目",
      referenceQuestion
        ? `参考题：${sanitizeText(referenceQuestion.questionText).slice(0, 180)}`
        : "",
      referenceQuestion?.knowledgePoints?.length
        ? `知识点：${referenceQuestion.knowledgePoints.join("、")}`
        : "",
      referenceQuestion
        ? `题型：${referenceQuestion.exerciseType}；难度：${referenceQuestion.difficulty}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (!queryText.trim()) {
      setAiErrorText(isZh ? "请先输入检索条件，或先在试卷里选中一道题。" : "Please enter search criteria or select a question first.");
      return;
    }

    setAiLoading(true);
    setAiErrorText("");
    setAiStatusText("");

    try {
      const activeCourse =
        courses.find((course) => course.id === activeDocument.courseId) ?? null;
      const activeUnit =
        units.find((unit) => unit.id === activeDocument.unitId) ?? null;
      const response = await apiPost<TikuSearchResponse>(
        "/api/tiku/search",
        {
          query: queryText,
          course: activeCourse?.code ?? "",
          unit: activeUnit?.unit_number ?? null,
          limit: 10,
          mode: "auto",
        },
      );
      const mappedItems = response.data.map(mapTikuRowToAiResult);
      setAiResults(mappedItems);
      setAiStatusText(
        mappedItems.length > 0
          ? (isZh ? `AI 已找到 ${mappedItems.length} 道相关题。` : `AI found ${mappedItems.length} related questions.`)
          : (isZh ? "没有找到新的匹配题目。" : "No matching questions found."),
      );
    } catch (error) {
      setAiErrorText(error instanceof Error ? error.message : (isZh ? "AI 检索失败" : "AI search failed"));
    } finally {
      setAiLoading(false);
    }
  }

  function handleReplaceRequest(questionId: string) {
    if (!activeDocument) return;
    const question = activeDocument.questions.find((item) => item.id === questionId);
    if (!question) return;

    handleSetActiveQuestion(questionId);
    setAiPanelOpen(true);
    const nextInstruction = buildReplaceInstruction(question);
    setAiQuery(nextInstruction);
    void runAiSearch(nextInstruction);
  }

  function handleReplaceWithResult(item: QuestionBankAiSearchResult) {
    if (!activeDocument || !activeDocument.activeQuestionId) {
      setAiErrorText(isZh ? "请先在试卷里展开一道题，再执行替换。" : "Please expand a question in the paper first, then replace.");
      return;
    }

    const nextQuestion = mapAiResultToSplitQuestion(item);
    updateDocument(activeDocument.id, (current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === current.activeQuestionId ? nextQuestion : question,
      ),
      activeQuestionId: nextQuestion.id,
    }));
    setStatusText(isZh ? "已用题库结果替换当前题。" : "Question replaced with bank result.");
  }

  function handleAppendResult(item: QuestionBankAiSearchResult) {
    if (!activeDocument) return;

    const nextQuestion = mapAiResultToSplitQuestion(item);
    updateDocument(activeDocument.id, (current) => {
      const anchorIndex = current.activeQuestionId
        ? current.questions.findIndex(
            (question) => question.id === current.activeQuestionId,
          )
        : current.questions.length - 1;
      const nextQuestions = [...current.questions];
      nextQuestions.splice(anchorIndex + 1, 0, nextQuestion);
      return {
        ...current,
        questions: nextQuestions,
        questionCount: nextQuestions.length,
        activeQuestionId: nextQuestion.id,
      };
    });
    setStatusText(isZh ? "已把题库结果追加到当前试卷。" : "Bank result appended to current paper.");
  }

  async function handleRewriteQuestion(questionId: string) {
    if (!activeDocument || rewriteLoadingQuestionId) return;
    const question = activeDocument.questions.find((item) => item.id === questionId);
    if (!question) return;

    setRewriteLoadingQuestionId(questionId);
    setErrorText("");

    try {
      const response = await apiPost<QuestionBankSplitRewriteResponse>(
        "/api/question-bank/split/rewrite",
        {
          instruction: buildDefaultRewriteInstruction(question),
          currentQuestion: {
            id: question.id,
            exerciseType: question.exerciseType,
            difficulty: question.difficulty,
            questionText: question.questionText,
            options: question.options ?? null,
            correctAnswer: question.correctAnswer ?? "",
            solutionSteps: question.solutionSteps ?? "",
            knowledgePoints: question.knowledgePoints ?? [],
            tags: question.tags ?? [],
            course:
              courses.find((course) => course.id === activeDocument.courseId)?.name
              ?? question.subject
              ?? "",
            unit:
              units.find((unit) => unit.id === activeDocument.unitId)
                ? formatUnitOptionLabel(
                    units.find((unit) => unit.id === activeDocument.unitId)!,
                  )
                : "",
          },
        },
      );

      updateQuestion(activeDocument.id, questionId, (current) => ({
        ...current,
        questionText: response.question.questionText,
        exerciseType: response.question.exerciseType,
        difficulty: response.question.difficulty,
        options:
          response.question.exerciseType === "MC"
            ? response.question.options ?? current.options
            : null,
        correctAnswer: response.question.correctAnswer,
        solutionSteps: response.question.solutionSteps,
        showSolution: true,
        isAiGenerated: true,
      }));
      setStatusText(isZh ? "AI 已完成当前题的修案。" : "AI revision complete.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : (isZh ? "AI 修案失败" : "AI revision failed"));
    } finally {
      setRewriteLoadingQuestionId("");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden overscroll-none bg-[#f3f4f1]">
      <ModuleTour moduleId="split" />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(event) => handleFilesSelected(event.target.files)}
      />

      <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
        <section className="shrink-0 border-b border-[rgba(55,53,47,0.08)] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-[#37352F]">
                {isZh ? "拆题编辑台" : "Split Editor"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#37352F]/52">
                {activeDocument ? (
                  <span className="truncate">
                    {activeDocument.label || activeDocument.fileName}
                  </span>
                ) : (
                  <span>{isZh ? "上传文档后开始拆题" : "Upload a document to start"}</span>
                )}
                {activeDocument?.importedAt ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                    {isZh ? "已入库" : "Committed"} · {activeDocument.importedAt}
                  </span>
                ) : null}
                {statusText ? (
                  <span className="text-emerald-700">{statusText}</span>
                ) : null}
                {errorText ? (
                  <span className="text-rose-700">{errorText}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeDocument ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDocument}
                    className="inline-flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-sm text-[#37352F]/72 transition hover:bg-[#faf8f3]"
                  >
                    <Save className="h-4 w-4" />
                    {isZh ? "保存" : "Save"}
                  </button>
                  <button
                    type="button"
                    data-tour-id="split-editor"
                    onClick={() => void handleCommitDocument()}
                    disabled={commitLoadingDocumentId === activeDocument.id || activeDocument.questions.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {commitLoadingDocumentId === activeDocument.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    {isZh ? "全部入库" : "Commit All"}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDocument}
                    className="inline-flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-sm text-[#37352F]/72 transition hover:bg-[#faf8f3]"
                  >
                    <FileDown className="h-4 w-4" />
                    {isZh ? "导出" : "Export"}
                  </button>
                  <Link
                    href="/main/question-bank"
                    className="inline-flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-sm text-[#37352F]/72 transition hover:bg-[#faf8f3]"
                  >
                    <X className="h-4 w-4" />
                    {isZh ? "返回题库" : "Back to Bank"}
                  </Link>
                </>
              ) : null}
              <button
                type="button"
                data-tour-id="split-upload"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#1d4ed8]"
              >
                <Upload className="h-4 w-4" />
                {isZh ? "上传" : "Upload"}
              </button>
            </div>
          </div>
        </section>

        {documents.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="m-4 flex min-h-[540px] flex-1 flex-col items-center justify-center rounded-[28px] border border-dashed border-[rgba(55,53,47,0.16)] bg-white text-[#8c7e68] transition hover:border-[rgba(55,53,47,0.28)] hover:text-[#37352F]"
          >
            <FileUp className="h-10 w-10" />
            <p className="mt-4 text-lg font-medium text-[#37352F]">
              {isZh ? "上传 PDF / Word / 图片" : "Upload PDF / Word / Images"}
            </p>
            <p className="mt-2 max-w-md text-center text-sm leading-7 text-[#37352F]/50">
              {isZh
                ? "文档会先进入拆题编辑台。你可以逐题修正答案、解析和标签，再决定什么时候全部入库。"
                : "Documents enter the split editor first. You can review and edit each question before committing."}
            </p>
          </button>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
            <div className="grid h-full min-h-0 overflow-hidden rounded-[24px] border border-[rgba(55,53,47,0.08)] bg-white xl:grid-cols-[272px_minmax(0,1fr)]">
              <DocumentSidebar
                documents={documents}
                activeDocumentId={activeDocumentId}
                activeQuestionId={activeDocument?.activeQuestionId ?? null}
                outlineSections={outlineSections}
                onSelectDocument={setActiveDocumentId}
                onSelectQuestion={handleScrollToQuestion}
                onUploadClick={() => inputRef.current?.click()}
                onRetryDocument={handleRetryDocument}
                onRemoveDocument={handleRemoveDocument}
              />

              <ExamPaperView
                document={activeDocument}
                courses={courses}
                units={units}
                questionRefs={questionRefs.current}
                commitLoading={commitLoadingDocumentId === activeDocument?.id}
                rewriteLoadingQuestionId={rewriteLoadingQuestionId}
                draggingQuestionId={draggingQuestionId}
                onUpdateDocument={updateActiveDocument}
                onToggleQuestion={handleToggleQuestion}
                onUpdateQuestion={(questionId, updater) => {
                  if (!activeDocument) return;
                  updateQuestion(activeDocument.id, questionId, updater);
                }}
                onReplaceRequest={handleReplaceRequest}
                onRewriteQuestion={handleRewriteQuestion}
                onRemoveQuestion={handleRemoveQuestion}
                onDragStartQuestion={(questionId) => setDraggingQuestionId(questionId)}
                onDragEndQuestion={() => setDraggingQuestionId(null)}
                onDropQuestionBefore={(questionId) => {
                  if (!draggingQuestionId || draggingQuestionId === questionId) return;
                  moveQuestion(draggingQuestionId, questionId);
                  setDraggingQuestionId(null);
                }}
                onDropQuestionAtEnd={() => {
                  if (!draggingQuestionId) return;
                  moveQuestion(draggingQuestionId);
                  setDraggingQuestionId(null);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {aiPanelOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/22">
          <div className="absolute inset-y-0 right-0 w-full max-w-[360px] border-l border-[rgba(55,53,47,0.08)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
            <div className="flex items-center justify-between border-b border-[rgba(55,53,47,0.08)] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-[#37352F]">{isZh ? "AI 检索" : "AI Search"}</h2>
                <p className="mt-0.5 text-xs text-[#37352F]/50">
                  {isZh ? "只在需要换题时打开。" : "Open when you need to replace a question."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiPanelOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(55,53,47,0.1)] bg-white text-[#37352F]/65 transition hover:bg-[#faf8f3]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex h-[calc(100%-61px)] min-h-0 flex-col">
              <AiSearchPanel
                query={aiQuery}
                loading={aiLoading}
                errorText={aiErrorText}
                statusText={aiStatusText}
                activeQuestion={activeQuestion}
                results={aiResults}
                onQueryChange={setAiQuery}
                onSearch={() => void runAiSearch()}
                onReplaceResult={handleReplaceWithResult}
                onAppendResult={handleAppendResult}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
