import { stripEmbeddedArtifactPayload } from "@/lib/agent/artifact-payload";

type ConversationRole = "user" | "assistant" | "system";

export type AgentConversationMessage = {
  role: ConversationRole;
  content: string;
  createdAt?: string;
  sources?: unknown;
};

export type AgentConversationContext = {
  olderSummary: string;
  recentMessages: AgentConversationMessage[];
  latestAssistantArtifact: string;
  latestAssistantReply: string;
  recentTranscript: string;
};

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeStrings(items: string[], limit: number) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
    if (next.length >= limit) break;
  }

  return next;
}

function trimText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function buildSourceContextSummary(sources: unknown) {
  if (!Array.isArray(sources)) return "";

  const sourceItems = sources
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  const uploadedSources = sourceItems.filter((item) => item.kind === "uploaded_materials");
  const contentReferenceSources = sourceItems.filter(
    (item) => item.kind === "content_library_references",
  );

  const segments = uploadedSources.flatMap((item) => {
    const summary = asString(item.summary);
    if (summary) {
      return [`【当前材料摘要】\n${summary}`];
    }
    const files = Array.isArray(item.files)
      ? item.files.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      : [];
    if (files.length === 0) return [];
    return [
      `【当前材料】\n${files
        .map((file) => {
          const fileName = asString(file.fileName) || "未命名材料";
          const preview = asString(file.previewText);
          return preview ? `${fileName}: ${preview}` : fileName;
        })
        .join("\n")}`,
    ];
  });

  segments.push(
    ...contentReferenceSources.flatMap((item) => {
      const summary = asString(item.summary);
      if (summary) {
        return [`【已引用内容】\n${summary}`];
      }
      const references = Array.isArray(item.items)
        ? item.items.filter(
            (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
          )
        : [];
      if (references.length === 0) return [];
      return [
        `【已引用内容】\n${references
          .map((reference) => {
            const title = asString(reference.title) || "未命名内容";
            const courseName = asString(reference.courseName);
            const unitName = asString(reference.unitName);
            const placement = [courseName, unitName].filter(Boolean).join(" / ");
            return placement ? `${title}（${placement}）` : title;
          })
          .join("\n")}`,
      ];
    }),
  );

  return segments.join("\n\n").trim();
}

function compressMessageContent(text: string, maxLength = 420) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;

  const headings = Array.from(normalized.matchAll(/^#{1,6}\s+(.+)$/gm))
    .map((match) => normalizeLine(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 4);
  const bullets = Array.from(normalized.matchAll(/^[\-\*\d.]+\s+(.+)$/gm))
    .map((match) => normalizeLine(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 5);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => normalizeLine(item))
    .filter(Boolean);

  const candidate = dedupeStrings(
    [
      paragraphs[0] ?? "",
      ...headings.map((item) => `标题:${item}`),
      ...bullets.map((item) => `要点:${item}`),
      paragraphs[paragraphs.length - 1] ?? "",
    ],
    8,
  ).join(" | ");

  if (candidate.length >= Math.min(maxLength, 180)) {
    return trimText(candidate, maxLength);
  }

  return trimText(
    `${normalized.slice(0, Math.max(120, maxLength - 80))} ... ${normalized.slice(-60)}`,
    maxLength,
  );
}

function summarizeOlderMessages(messages: AgentConversationMessage[]) {
  if (messages.length === 0) return "";
  const lines = messages
    .map((message, index) => {
      const prefix = message.role === "user" ? "教师" : message.role === "assistant" ? "助手" : "系统";
      return `${index + 1}. ${prefix}: ${compressMessageContent(message.content, 220)}`;
    })
    .slice(0, 12);

  return trimText(lines.join("\n"), 1800);
}

function findLatestAssistantReply(messages: AgentConversationMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (item.role === "assistant" && item.content.trim()) {
      return item.content.trim();
    }
  }
  return "";
}

export function buildAgentConversationContext(
  messages: AgentConversationMessage[],
): AgentConversationContext {
  const recentWindow = 8;
  const normalizedMessages = messages
    .map((item) => ({
      role: item.role,
      content: (() => {
        const visibleContent = stripEmbeddedArtifactPayload(item.content).trim();
        const sourceSummary = buildSourceContextSummary(item.sources);
        if (!sourceSummary) return visibleContent;
        return [visibleContent, sourceSummary].filter(Boolean).join("\n\n").trim();
      })(),
      createdAt: item.createdAt,
    }))
    .filter((item) => item.content);

  const olderMessages =
    normalizedMessages.length > recentWindow
      ? normalizedMessages.slice(0, normalizedMessages.length - recentWindow)
      : [];
  const recentMessages = normalizedMessages
    .slice(-recentWindow)
    .map((item) => ({
      ...item,
      content: compressMessageContent(item.content, item.role === "assistant" ? 520 : 380),
    }));

  const latestAssistantReply = findLatestAssistantReply(normalizedMessages);

  return {
    olderSummary: summarizeOlderMessages(olderMessages),
    recentMessages,
    latestAssistantArtifact: compressMessageContent(latestAssistantReply, 520),
    latestAssistantReply,
    recentTranscript: trimText(
      recentMessages
        .map((item) => `${item.role === "user" ? "教师" : item.role === "assistant" ? "助手" : "系统"}: ${item.content}`)
        .join("\n"),
      2600,
    ),
  };
}

export function asContextObject(value: unknown) {
  return asObject(value);
}
