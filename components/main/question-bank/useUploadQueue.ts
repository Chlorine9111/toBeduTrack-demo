"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadJobStatus =
  | "waiting"
  | "uploading"
  | "ocr"
  | "parsing"
  | "completed"
  | "failed";

export type UploadJob = {
  id: string;
  fileName: string;
  status: UploadJobStatus;
  progress: number;
  label: string;
  questionCount: number | null;
  error: string | null;
  /** Database upload ID — set after upload, used for resuming */
  dbUploadId?: string;
};

type UploadResponse = { uploadId: string; fileName: string; fileSize: number };
type StatusResponse = { status: string; progress: number };
type ProcessResponse = {
  questions: Array<{ questionNumber: number }>;
  stats: { total: number };
  saveResult?: {
    savedCount?: number;
    importBatchId?: string | null;
    status?: string;
    message?: string;
  } | null;
};

type DbUploadRow = {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  question_count: number | null;
  created_at: string;
};

const POLL_INITIAL = 2000;
const POLL_MAX = 15000;
const POLL_MULTIPLIER = 1.5;
const MAX_POLL_TIME = 360_000;

let jobIdCounter = 0;
function nextJobId() {
  jobIdCounter += 1;
  return `uj-${Date.now()}-${jobIdCounter}`;
}

function dbStatusToJobStatus(dbStatus: DbUploadRow["status"]): UploadJobStatus {
  switch (dbStatus) {
    case "pending":
      return "uploading";
    case "processing":
      return "ocr";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
  }
}

function dbStatusToLabel(
  dbStatus: DbUploadRow["status"],
  questionCount: number | null,
): string {
  switch (dbStatus) {
    case "pending":
      return "等待处理...";
    case "processing":
      return "文档识别中...";
    case "completed":
      return `完成，${questionCount ?? 0} 道题已入库`;
    case "failed":
      return "处理失败";
  }
}

function dbStatusToProgress(dbStatus: DbUploadRow["status"]): number {
  switch (dbStatus) {
    case "pending":
      return 15;
    case "processing":
      return 40;
    case "completed":
      return 100;
    case "failed":
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUploadQueue(options: { onJobComplete?: () => void }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const processingRef = useRef(false);
  const queueRef = useRef<Array<{ id: string; file: File }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);

  // HIGH-5 fix: store callback in ref to avoid dependency chain issues
  const onJobCompleteRef = useRef(options.onJobComplete);
  onJobCompleteRef.current = options.onJobComplete;

  // Update a specific job immutably
  const updateJob = useCallback(
    (id: string, patch: Partial<UploadJob>) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...patch } : j)),
      );
    },
    [],
  );

  // Resume a DB upload: poll OCR → process-scan
  const resumeDbUpload = useCallback(
    async (jobId: string, dbUploadId: string, signal: AbortSignal) => {
      // Poll OCR status
      updateJob(jobId, {
        status: "ocr",
        progress: 40,
        label: "恢复中，文档识别...",
      });

      const pollStart = Date.now();
      let ocrDone = false;
      let pollDelay = POLL_INITIAL;

      while (!ocrDone && Date.now() - pollStart < MAX_POLL_TIME) {
        if (signal.aborted) return;
        await new Promise((r) => setTimeout(r, pollDelay));
        pollDelay = Math.min(pollDelay * POLL_MULTIPLIER, POLL_MAX);

        const resp = await fetch(`/api/pdf/scan-status/${dbUploadId}`, {
          signal,
        });
        if (!resp.ok) continue;
        const data = (await resp.json()) as StatusResponse;

        if (data.status === "completed") {
          ocrDone = true;
        } else if (data.status === "failed") {
          throw new Error("文档识别失败");
        } else {
          updateJob(jobId, {
            progress: 30 + Math.round(data.progress * 0.3),
            label: `识别中 ${data.progress}%`,
          });
        }
      }

      if (!ocrDone) throw new Error("文档识别超时");

      // Parse + auto-save
      updateJob(jobId, {
        status: "parsing",
        progress: 70,
        label: "解析题目并入库...",
      });

      const processResp = await fetch("/api/pdf/process-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: dbUploadId }),
        signal,
      });
      if (!processResp.ok) {
        const errData = await processResp.json().catch(() => ({}));
        throw new Error(
          (errData as Record<string, string>).error ??
            `解析失败 (${processResp.status})`,
        );
      }
      const result = (await processResp.json()) as ProcessResponse;
      const count =
        typeof result.saveResult?.savedCount === "number"
          ? result.saveResult.savedCount
          : result.stats?.total ?? 0;

      updateJob(jobId, {
        status: "completed",
        progress: 100,
        label: `完成，${count} 道题已入库`,
        questionCount: count,
      });

      onJobCompleteRef.current?.();
    },
    [updateJob],
  );

  // Process one new file through the full pipeline
  const processFile = useCallback(
    async (jobId: string, file: File, signal: AbortSignal) => {
      updateJob(jobId, {
        status: "uploading",
        progress: 10,
        label: "上传中...",
      });

      const formData = new FormData();
      formData.append("file", file);

      const uploadResp = await fetch("/api/pdf/upload-scan", {
        method: "POST",
        body: formData,
        signal,
      });
      if (!uploadResp.ok) {
        const errData = await uploadResp.json().catch(() => ({}));
        throw new Error(
          (errData as Record<string, string>).error ??
            `上传失败 (${uploadResp.status})`,
        );
      }
      const { uploadId } = (await uploadResp.json()) as UploadResponse;

      // Store dbUploadId so it can be resumed
      updateJob(jobId, { dbUploadId: uploadId });

      // Continue with OCR + parse (reuse resumeDbUpload)
      await resumeDbUpload(jobId, uploadId, signal);
    },
    [updateJob, resumeDbUpload],
  );

  // Process queue with up to MAX_CONCURRENT parallel workers
  const MAX_CONCURRENT = 3;

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    const runNext = async (): Promise<void> => {
      while (queueRef.current.length > 0) {
        if (controller.signal.aborted) return;
        const next = queueRef.current.shift();
        if (!next) return;

        try {
          await processFile(next.id, next.file, controller.signal);
        } catch (err) {
          if (controller.signal.aborted) return;
          updateJob(next.id, {
            status: "failed",
            progress: 0,
            label: err instanceof Error ? err.message : "处理失败",
            error: err instanceof Error ? err.message : "处理失败",
          });
        }
      }
    };

    // 启动最多 MAX_CONCURRENT 个并发 worker
    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT, queueRef.current.length) },
      () => runNext(),
    );
    await Promise.all(workers);

    processingRef.current = false;
    abortRef.current = null;
  }, [processFile, updateJob]);

  // ---------------------------------------------------------------------------
  // Restore from database on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const resp = await fetch("/api/pdf/upload-queue");
        if (!resp.ok) return;
        const { items } = (await resp.json()) as { items: DbUploadRow[] };
        if (cancelled || items.length === 0) return;

        // 只恢复未完成的任务（pending/processing），已完成/失败的不再显示
        const activeItems = items.filter(
          (r) => r.status === "pending" || r.status === "processing",
        );
        if (activeItems.length === 0) return;

        const restoredJobs: UploadJob[] = activeItems.map((row) => ({
          id: `db-${row.id}`,
          fileName: row.file_name,
          status: dbStatusToJobStatus(row.status),
          progress: dbStatusToProgress(row.status),
          label: dbStatusToLabel(row.status, row.question_count),
          questionCount: row.question_count,
          error: null,
          dbUploadId: row.id,
        }));

        setJobs(restoredJobs);

        // Resume active uploads (pending/processing)
        const activeUploads = items.filter(
          (r) => r.status === "pending" || r.status === "processing",
        );

        if (activeUploads.length > 0) {
          const controller = new AbortController();
          abortRef.current = controller;

          for (const row of activeUploads) {
            if (cancelled || controller.signal.aborted) break;
            const jobId = `db-${row.id}`;
            try {
              await resumeDbUpload(jobId, row.id, controller.signal);
            } catch (err) {
              if (controller.signal.aborted) break;
              setJobs((prev) =>
                prev.map((j) =>
                  j.id === jobId
                    ? {
                        ...j,
                        status: "failed" as const,
                        progress: 0,
                        label: err instanceof Error ? err.message : "恢复失败",
                        error: err instanceof Error ? err.message : "恢复失败",
                      }
                    : j,
                ),
              );
            }
          }
        }
      } catch {
        // Silent fail — upload queue is non-critical
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [resumeDbUpload]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const addFiles = useCallback(
    (files: File[]) => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

      let pdfFiles = files.filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf"),
      );
      if (pdfFiles.length === 0) return;

      // 拦截超大文件，直接标记为失败
      const oversized = pdfFiles.filter((f) => f.size > MAX_FILE_SIZE);
      if (oversized.length > 0) {
        const failedJobs: UploadJob[] = oversized.map((f) => ({
          id: nextJobId(),
          fileName: f.name,
          status: "failed" as const,
          progress: 0,
          label: `文件过大 (${(f.size / 1024 / 1024).toFixed(1)}MB，上限 50MB)`,
          questionCount: null,
          error: `文件大小 ${(f.size / 1024 / 1024).toFixed(1)}MB 超过 50MB 限制`,
        }));
        setJobs((prev) => [...prev, ...failedJobs]);
        pdfFiles = pdfFiles.filter((f) => f.size <= MAX_FILE_SIZE);
        if (pdfFiles.length === 0) return;
      }

      const newJobs: UploadJob[] = pdfFiles.map((f) => ({
        id: nextJobId(),
        fileName: f.name,
        status: "waiting" as const,
        progress: 0,
        label: "等待中...",
        questionCount: null,
        error: null,
      }));

      const newQueue = pdfFiles.map((f, i) => ({
        id: newJobs[i].id,
        file: f,
      }));

      setJobs((prev) => [...prev, ...newJobs]);
      queueRef.current.push(...newQueue);
      processQueue();
    },
    [processQueue],
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
  }, []);

  const clearDone = useCallback(() => {
    setJobs((prev) =>
      prev.filter((j) => j.status !== "completed" && j.status !== "failed"),
    );
  }, []);

  const isProcessing = jobs.some(
    (j) =>
      j.status === "uploading" ||
      j.status === "ocr" ||
      j.status === "parsing",
  );

  const hasJobs = jobs.length > 0;

  return { jobs, addFiles, removeJob, clearDone, isProcessing, hasJobs };
}
