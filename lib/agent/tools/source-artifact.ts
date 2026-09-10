import {
  extractEmbeddedArtifactPayload,
  type EmbeddedArtifactPayload,
} from "@/lib/agent/artifact-payload";
import type { StoredConversationMessage } from "@/lib/agent/chat-shared";
import type {
  AgentToolRuntimeState,
} from "@/lib/agent/tools/types";
import type {
  ToolArtifactPayload,
  ToolResultType,
} from "@/lib/agent/tools/tool-result";

type SupportedArtifactKind = NonNullable<EmbeddedArtifactPayload["kind"]>;

const QUESTION_LIKE_PATTERN =
  /(^|\n)(?:\d+[.)]|第[一二三四五六七八九十\d]+题|Q\d+[:：]|Question\s+\d+)|(?:\n|\r)\s*[A-DＡ-Ｄ][.)、]|答案[:：]|解析[:：]/i;

const WORKSHEET_ANSWERABLE_PATTERN =
  /(quick\s*check|do now|exit\s*ticket|reflection|讨论|活动|task|任务|填空|思考|respond|answer|问题|练习|写作|分析|讨论提示|课堂活动)/i;

function normalizeKinds(
  kinds?: SupportedArtifactKind[],
) {
  return kinds && kinds.length > 0 ? new Set(kinds) : null;
}

function matchesKind(
  artifact: Pick<EmbeddedArtifactPayload, "kind">,
  kinds?: SupportedArtifactKind[],
) {
  const allowed = normalizeKinds(kinds);
  return !allowed || allowed.has(artifact.kind);
}

export function findLatestPersistedArtifact(
  previousMessages: StoredConversationMessage[],
  kinds?: SupportedArtifactKind[],
): EmbeddedArtifactPayload | null {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (message.role !== "assistant") continue;
    const payload = extractEmbeddedArtifactPayload(message.content);
    if (!payload) continue;
    if (!matchesKind(payload, kinds)) continue;
    return payload;
  }
  return null;
}

export function resolveSourceArtifact(
  runtime: AgentToolRuntimeState | undefined,
  kinds?: SupportedArtifactKind[],
): {
  source: "current_turn" | "history";
  type?: ToolResultType;
  artifact: ToolArtifactPayload | EmbeddedArtifactPayload;
} | null {
  const latestGenerated = runtime?.latestGeneratedArtifact;
  if (latestGenerated && matchesKind(latestGenerated.artifact, kinds)) {
    return {
      source: "current_turn",
      type: latestGenerated.type,
      artifact: latestGenerated.artifact,
    };
  }

  const latestPersisted =
    runtime?.latestPersistedArtifact ??
    findLatestPersistedArtifact(runtime?.previousMessages ?? [], kinds);
  if (latestPersisted) {
    return {
      source: "history",
      artifact: latestPersisted,
    };
  }

  return null;
}

export function rememberGeneratedArtifact(
  runtime: AgentToolRuntimeState | undefined,
  type: ToolResultType,
  artifact: ToolArtifactPayload,
) {
  if (!runtime) return;
  runtime.latestGeneratedArtifact = {
    type,
    artifact,
  };
}

export function artifactLooksQuestionLike(
  artifact: Pick<EmbeddedArtifactPayload, "kind" | "rawContent">,
) {
  if (artifact.kind === "exercises" || artifact.kind === "exam") {
    return true;
  }

  const normalized = artifact.rawContent.trim();
  if (!normalized) return false;
  return QUESTION_LIKE_PATTERN.test(normalized);
}

export function artifactCanGenerateAnswerKey(
  artifact: Pick<EmbeddedArtifactPayload, "kind" | "rawContent">,
) {
  if (artifact.kind === "exercises" || artifact.kind === "exam") {
    return true;
  }

  const normalized = artifact.rawContent.trim();
  if (!normalized) return false;

  if (artifact.kind === "worksheet") {
    return true;
  }

  return QUESTION_LIKE_PATTERN.test(normalized);
}
