"use client";

import type { MutableRefObject } from "react";
import {
  applySaveResultsToScanBatch,
  attachScanContextToTaskContext,
  buildAgentModelInput,
  buildAttachmentSummary,
  composeScanBatchResult,
  createFileFromBase64,
  shouldSkipScanArchive,
  summarizeOneFile,
  validateScanFile,
} from "@/components/main/agent/scan-workflow-format";
import {
  type InjectScanFileDetail,
  type ScanBatchResult,
  type ScanFileSummary,
  type ScanProcessResponse,
  type ScanSaveBatchResponse,
  type ScanSaveFileResponse,
  type ScanStatusResponse,
  type ScanUploadResponse,
} from "@/components/main/agent/scan-workflow-types";

const SCAN_POLL_INTERVAL_MS = 3000;
const SCAN_POLL_TIMEOUT_MS = 360_000;

async function sleep(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createScanWorkflowClient(params: {
  isZh: boolean;
  scanAbortRef: MutableRefObject<AbortController | null>;
  setIsScanning: (value: boolean) => void;
  setScanStatusText: (value: string) => void;
  parseErrorMessage: (response: Response) => Promise<string>;
}) {
  const uploadAndParseOneFile = async (
    file: File,
    fileIndex: number,
    totalFiles: number,
    signal: AbortSignal,
  ): Promise<ScanFileSummary> => {
    const formData = new FormData();
    formData.append("file", file);
    params.setScanStatusText(
      params.isZh
        ? `正在上传 ${file.name}（${fileIndex}/${totalFiles}）...`
        : `Uploading ${file.name} (${fileIndex}/${totalFiles})...`,
    );

    const uploadResp = await fetch("/api/pdf/upload-scan", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!uploadResp.ok) {
      throw new Error(await params.parseErrorMessage(uploadResp));
    }
    const uploadData = (await uploadResp.json()) as ScanUploadResponse;
    if (!uploadData.uploadId) {
      throw new Error(
        params.isZh
          ? "上传成功但缺少 uploadId"
          : "Upload succeeded but uploadId is missing",
      );
    }

    const pollStartedAt = Date.now();
    while (Date.now() - pollStartedAt < SCAN_POLL_TIMEOUT_MS) {
      await sleep(SCAN_POLL_INTERVAL_MS, signal);
      const statusResp = await fetch(
        `/api/pdf/scan-status/${uploadData.uploadId}`,
        {
          method: "GET",
          signal,
        },
      );
      if (!statusResp.ok) {
        throw new Error(await params.parseErrorMessage(statusResp));
      }
      const statusData = (await statusResp.json()) as ScanStatusResponse;
      if (statusData.status === "completed") {
        break;
      }
      if (statusData.status === "failed") {
        throw new Error(`文档识别失败：${file.name}`);
      }
      params.setScanStatusText(
        params.isZh
          ? `文档识别中 ${file.name}（${fileIndex}/${totalFiles}）... ${Math.max(0, Number(statusData.progress ?? 0))}%`
          : `Scanning ${file.name} (${fileIndex}/${totalFiles})... ${Math.max(0, Number(statusData.progress ?? 0))}%`,
      );
    }

    if (Date.now() - pollStartedAt >= SCAN_POLL_TIMEOUT_MS) {
      throw new Error(
        params.isZh ? `文档识别超时：${file.name}` : `Document scan timed out: ${file.name}`,
      );
    }

    params.setScanStatusText(
      params.isZh
        ? `正在解析题目 ${file.name}（${fileIndex}/${totalFiles}）...`
        : `Parsing ${file.name} (${fileIndex}/${totalFiles})...`,
    );
    const processResp = await fetch("/api/pdf/process-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: uploadData.uploadId, skipSave: true }),
      signal,
    });
    if (!processResp.ok) {
      throw new Error(await params.parseErrorMessage(processResp));
    }
    const processData = (await processResp.json()) as ScanProcessResponse;
    return summarizeOneFile(file.name, processData, uploadData.uploadId);
  };

  return {
    async scanPendingFiles(files: File[]): Promise<ScanBatchResult> {
      const controller = new AbortController();
      params.scanAbortRef.current = controller;
      params.setIsScanning(true);
      params.setScanStatusText(
        params.isZh ? "准备开始解析文档..." : "Preparing to scan documents...",
      );

      try {
        const summaries: ScanFileSummary[] = [];
        for (let i = 0; i < files.length; i += 1) {
          const one = await uploadAndParseOneFile(
            files[i],
            i + 1,
            files.length,
            controller.signal,
          );
          summaries.push(one);
        }
        return composeScanBatchResult(summaries);
      } finally {
        params.scanAbortRef.current = null;
        params.setIsScanning(false);
        params.setScanStatusText("");
      }
    },

    async persistScannedQuestions(
      scanResult: ScanBatchResult | null,
      curriculumHint?: string,
    ): Promise<ScanBatchResult | null> {
      if (!scanResult) return scanResult;

      const uploads = scanResult.files
        .filter((file) => file.total > 0)
        .filter(
          (file) =>
            file.saveStatus !== "saved" &&
            file.saveStatus !== "already_saved" &&
            file.saveStatus !== "requires_review",
        )
        .map((file) => file.uploadId)
        .filter((value): value is string => Boolean(value));

      if (uploads.length === 0) {
        return scanResult;
      }

      try {
        const response = await fetch("/api/pdf/save-scan-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploads: uploads.map((uploadId) => ({ uploadId })),
            curriculumHint: curriculumHint?.trim() || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(await params.parseErrorMessage(response));
        }

        const payload = (await response.json()) as ScanSaveBatchResponse;
        const files = Array.isArray(payload.files) ? payload.files : [];
        if (files.length === 0) return scanResult;
        return applySaveResultsToScanBatch(scanResult, files);
      } catch (error) {
        const failureMessage =
          error instanceof Error
            ? error.message
            : params.isZh
              ? "拆题结果自动归档失败。"
              : "Failed to auto-archive parsed questions.";

        const failedFiles: ScanSaveFileResponse[] = uploads.map((uploadId) => {
          const matched = scanResult.files.find((file) => file.uploadId === uploadId);
          return {
            uploadId,
            fileName: matched?.fileName ?? (params.isZh ? "未知文件" : "Unknown file"),
            status: "failed",
            savedCount: 0,
            exerciseIds: [],
            courseId: null,
            courseLabel: null,
            unitId: null,
            unitLabel: null,
            topicId: null,
            message: failureMessage,
          };
        });

        return applySaveResultsToScanBatch(scanResult, failedFiles);
      }
    },
  };
}

export {
  applySaveResultsToScanBatch,
  attachScanContextToTaskContext,
  buildAgentModelInput,
  buildAttachmentSummary,
  composeScanBatchResult,
  createFileFromBase64,
  shouldSkipScanArchive,
  summarizeOneFile,
  validateScanFile,
};

export type {
  InjectScanFileDetail,
  ScanBatchResult,
  ScanFileSummary,
  ScanProcessResponse,
  ScanSaveBatchResponse,
  ScanSaveFileResponse,
  ScanStatusResponse,
  ScanUploadResponse,
};
