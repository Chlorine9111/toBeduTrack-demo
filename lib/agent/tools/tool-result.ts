/**
 * 统一的 tool 返回结构。
 * 让 LLM 在多步对话中用一致的格式引用上一步结果，减少幻觉。
 */
import type {
  ArtifactContentMode,
  ArtifactRole,
  ArtifactVariant,
  EmbeddedArtifactKind,
  EmbeddedArtifactPayload,
} from "@/lib/agent/artifact-payload";
import type { ArtifactIntegrityStatus } from "@/lib/agent/artifact-integrity";

export type ToolResultType =
  | "exercises"
  | "rubric"
  | "worksheet"
  | "answer_key"
  | "exit_ticket"
  | "difficulty_variant"
  | "lesson_plan"
  | "pbl"
  | "search"
  | "webpage"
  | "school_report"
  | "scoring_calibration";

export type ToolArtifactPayload = Omit<EmbeddedArtifactPayload, "kind"> & {
  kind: EmbeddedArtifactKind;
  previewText?: string;
  integrityStatus?: ArtifactIntegrityStatus;
};

export type ToolArtifactDelta = {
  kind: EmbeddedArtifactKind;
  artifactKey?: string;
  artifactRole?: ArtifactRole;
  artifactVariant?: ArtifactVariant;
  contentMode?: ArtifactContentMode;
  delta: string;
  title?: string;
  summary?: string;
  previewText?: string;
};

export type ToolResult = {
  ok: boolean;
  type: ToolResultType;
  title: string;
  summary: string;
  itemCount: number;
  nextSteps: string[];
  error?: string;
  /** tool-specific 附加数据，LLM 可以引用 */
  data?: Record<string, unknown>;
  /** 文档型产物单独走 artifact 通道，不再把正文塞回左侧聊天区 */
  artifact?: ToolArtifactPayload;
};

export function successResult(
  type: ToolResultType,
  title: string,
  summary: string,
  itemCount: number,
  nextSteps: string[],
  data?: Record<string, unknown>,
): ToolResult {
  return { ok: true, type, title, summary, itemCount, nextSteps, data };
}

export function successArtifactResult(
  type: ToolResultType,
  title: string,
  summary: string,
  itemCount: number,
  nextSteps: string[],
  artifact: ToolArtifactPayload,
  data?: Record<string, unknown>,
): ToolResult {
  return { ok: true, type, title, summary, itemCount, nextSteps, data, artifact };
}

export function errorResult(
  type: ToolResultType,
  error: string,
  hint?: string | string[],
  data?: Record<string, unknown>,
): ToolResult {
  return {
    ok: false,
    type,
    title: "",
    summary: error,
    itemCount: 0,
    nextSteps: Array.isArray(hint) ? hint : hint ? [hint] : [],
    error,
    data,
  };
}

export function artifactDeltaResult(
  artifactDelta: ToolArtifactDelta,
  text = "",
) {
  return {
    status: "streaming",
    text,
    artifactDelta,
  };
}
