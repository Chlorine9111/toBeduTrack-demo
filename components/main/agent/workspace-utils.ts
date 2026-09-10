import type { ScanBatchResult } from "@/components/main/agent/scan-workflow";
import type { StructuredScanBatch } from "@/components/main/scan/ScanStructuredResult";
import type { AgentMessage } from "@/components/main/agent/workspace-types";

export const INITIAL_ASSISTANT_MESSAGE: AgentMessage = {
  id: "assistant_welcome",
  role: "assistant",
  includeInModel: false,
  content: "",
};

export const MATERIAL_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,image/*";

export function nextId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildScanMessageSource(scanResult: ScanBatchResult | StructuredScanBatch) {
  return {
    kind: "scan_result",
    totalQuestions: scanResult.totalQuestions,
    result: scanResult,
    files: scanResult.files.map((file) => ({
      fileName: file.fileName,
      total: file.total,
      saveStatus: file.saveStatus ?? null,
      savedCount: file.savedCount ?? 0,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function restoreScanMessageResult(source: unknown): ScanBatchResult | null {
  if (!isRecord(source)) return null;

  function ensureBatchResult(raw: Record<string, unknown>): ScanBatchResult {
    return {
      ...raw,
      displayText: typeof raw.displayText === "string" ? raw.displayText : "",
      summaryText: typeof raw.summaryText === "string" ? raw.summaryText : "",
      contextText: typeof raw.contextText === "string" ? raw.contextText : "",
      files: Array.isArray(raw.files) ? raw.files : [],
    } as ScanBatchResult;
  }

  const directResult = source.result;
  if (isRecord(directResult) && Array.isArray(directResult.files)) {
    return ensureBatchResult(directResult);
  }
  if (
    typeof source.totalQuestions === "number" &&
    Array.isArray(source.files)
  ) {
    return ensureBatchResult(source);
  }
  return null;
}

export function extractRequestError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (data.error && typeof data.error === "object") {
    const nested = data.error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message;
    }
  }
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  return fallback;
}

export function truncateText(text: string, max = 120) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export function buildWelcomeMessage(_isZh: boolean): string {
  // 不再显示欢迎消息 — idle 页面的卡片已经提供了引导
  return "";
}

export async function parseErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  return (
    payload.error ||
    payload.message ||
    (response.statusText?.trim() || "Request failed")
  );
}

export function normalizeWorkspaceLoadError(message: string, isZh: boolean) {
  const normalized = message.trim();
  if (!normalized) {
    return isZh ? "工作区数据读取失败" : "Workspace data failed to load";
  }
  if (/abort|aborted/i.test(normalized)) {
    return isZh ? "工作区请求被中断，请重试。" : "Workspace request was interrupted. Please retry.";
  }
  if (/timeout/i.test(normalized)) {
    return isZh
      ? "这一步超时了，我会尽量继续给出可用结果。"
      : "This step timed out. I will continue with the best usable result.";
  }
  return truncateText(normalized, 120);
}

export function joinUniqueMessages(messages: string[]) {
  return Array.from(
    new Set(messages.map((message) => message.trim()).filter(Boolean)),
  ).join(isZhJoinSeparator(messages));
}

function isZhJoinSeparator(messages: string[]) {
  return messages.some((message) => /[\u4e00-\u9fa5]/.test(message)) ? "；" : " · ";
}

export function humanizeTimelineTitle(title: string, isZh: boolean) {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return isZh ? "处理步骤" : "Step";
  if (/scan|ocr/.test(normalized)) return isZh ? "识别文档" : "Scanning";
  if (/preflight|intent/.test(normalized)) return isZh ? "理解任务" : "Task understanding";
  if (/exam/.test(normalized)) return isZh ? "生成试卷" : "Exam assembly";
  if (/worksheet/.test(normalized)) return isZh ? "组装试卷" : "Worksheet assembly";
  if (/lesson/.test(normalized)) return isZh ? "生成教案" : "Lesson plan";
  if (/exercise|question/.test(normalized)) return isZh ? "生成题目" : "Question generation";
  if (/save|persist/.test(normalized)) return isZh ? "保存结果" : "Saving results";
  if (/export|pdf/.test(normalized)) return isZh ? "导出 PDF" : "PDF export";
  return title;
}

export function formatTimelineDuration(durationMs: number | undefined, isZh: boolean) {
  if (!durationMs || !Number.isFinite(durationMs)) {
    return isZh ? "进行中" : "In progress";
  }
  if (durationMs < 1_000) {
    return `${Math.max(1, Math.round(durationMs))}${isZh ? "毫秒" : "ms"}`;
  }
  const seconds = durationMs / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}${isZh ? "秒" : "s"}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return isZh ? `${minutes}分 ${remainingSeconds}秒` : `${minutes}m ${remainingSeconds}s`;
}

export function humanizeTimelineDetail(detail: string | undefined, isZh: boolean) {
  if (!detail) {
    return isZh ? "处理中，请稍候。" : "In progress.";
  }
  const normalized = detail.trim();
  if (!normalized) {
    return isZh ? "处理中，请稍候。" : "In progress.";
  }
  return truncateText(normalized, 160);
}
