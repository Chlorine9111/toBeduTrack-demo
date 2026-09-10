import type { ArtifactIntegrityStatus } from "@/lib/agent/artifact-integrity";

function trimWorksheetContinuationContext(markdown: string, maxChars: number) {
  const normalized = markdown.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized.slice(normalized.length - maxChars);
}

export function buildWorksheetContinuationPrompt(params: {
  teacherRequest: string;
  partialMarkdown: string;
}) {
  return [
    `教师原始需求：\n${params.teacherRequest.trim()}`,
    "下面是已经生成但末尾疑似被截断的 Worksheet Markdown。",
    "请从最后一句自然继续补完剩余正文，并严格遵守以下要求：",
    "1. 不要重写前文。",
    "2. 不要重复标题或已经出现过的整段内容。",
    "3. 只输出剩余的 Markdown 正文，不要解释。",
    `已生成正文（尾部截断前上下文）：\n${trimWorksheetContinuationContext(params.partialMarkdown, 5_000)}`,
  ].join("\n\n");
}

export function shouldContinueWorksheetGeneration(params: {
  finishReason?: string;
  integrityStatus: ArtifactIntegrityStatus;
  markdown: string;
}) {
  if (!params.markdown.trim()) {
    return false;
  }

  if (params.integrityStatus === "invalid") {
    return true;
  }

  return (
    params.finishReason === "length" ||
    params.finishReason === "error" ||
    params.finishReason === "other" ||
    params.finishReason === "unknown"
  );
}
