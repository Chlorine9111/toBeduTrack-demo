import { searchWebWithClaude } from "@/lib/assistant/claude-web-search";
import { fetchWebPageWithJina } from "@/lib/assistant/jina-reader";
import { searchTeacherKnowledgeRagDetailed } from "@/lib/assistant/knowledge-rag";
import type {
  AssistantContextBundle,
  AssistantMessageInput,
  SourceReference,
  WebSearchResult,
} from "@/lib/assistant/types";
import {
  type ContextFragment,
  buildContextRetrievalQuery,
  formatContextFragments,
  selectContextFragments,
  selectConversationMessages,
  trimContextText,
} from "@/lib/context-engineering/core";
import { getTeacherMemoryByTeacherId } from "@/lib/teacher-memory/service";
import {
  buildTeacherMemoryCapsuleFragments,
  dedupeTeacherMemoryFragments,
  searchTeacherMemoryCapsules,
} from "@/lib/teacher-memory/semantic-memory";
import { buildAgentMemoryFragments } from "@/lib/agent/context-memory";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dedupeSources(items: SourceReference[]) {
  const seen = new Set<string>();
  const next: SourceReference[] = [];

  items.forEach((item) => {
    const key = `${item.type}:${item.url ?? item.title}:${item.documentId ?? ""}:${item.chunkIndex ?? ""}:${item.pageRange ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });

  return next;
}

function buildAssistantRetrievalQuery(params: {
  query: string;
  history?: AssistantMessageInput[];
}) {
  const historyHints =
    params.history
      ?.filter((item) => item.role === "user")
      .slice(-3)
      .map((item) => item.content) ?? [];

  return buildContextRetrievalQuery({
    query: params.query,
    hints: historyHints,
    maxLength: 320,
  });
}

function buildHistoryAwareQuery(params: {
  query: string;
  history?: AssistantMessageInput[];
}) {
  const selectedHistory = selectConversationMessages({
    query: params.query,
    messages:
      params.history
        ?.filter(
          (item): item is { role: "user" | "assistant"; content: string } =>
            item.role === "user" || item.role === "assistant",
        )
        .map((item) => ({
          role: item.role,
          content: item.content,
        })) ?? [],
    maxMessages: 4,
    maxLength: 900,
  });

  return buildContextRetrievalQuery({
    query: params.query,
    hints: selectedHistory.map((item) => item.content),
    maxLength: 360,
  });
}

export async function buildAssistantContext(params: {
  teacherId: string;
  query: string;
  useKnowledge: boolean;
  useWeb: boolean;
  history?: AssistantMessageInput[];
}): Promise<AssistantContextBundle> {
  let knowledgeContext = "";
  let webContext = "";
  let memoryContext = "";
  const sources: SourceReference[] = [];
  const retrievalQuery = buildAssistantRetrievalQuery(params);
  const historyAwareQuery = buildHistoryAwareQuery(params);

  if (params.useKnowledge) {
    const [knowledgeResponse, memoryHits, localMemoryCtx] = await Promise.all([
      searchTeacherKnowledgeRagDetailed({
        teacherId: params.teacherId,
        query: retrievalQuery,
        limit: 10,
      }),
      searchTeacherMemoryCapsules({
        teacherId: params.teacherId,
        query: historyAwareQuery,
        limit: 6,
      }).catch(() => []),
      getTeacherMemoryByTeacherId({ teacherId: params.teacherId }).catch(() => null),
    ]);
    const knowledgeHits = knowledgeResponse.results;
    const knowledgeConfidence = knowledgeResponse.retrieval.confidence;

    if (knowledgeHits.length > 0) {
      const knowledgeCandidates = knowledgeHits.map((item, index) => {
        const confidenceLabel =
          knowledgeConfidence === "low"
            ? "建议复核"
            : knowledgeConfidence === "medium"
              ? "已纠错检索"
              : "高置信";
        const originalFileName =
          readString(item.metadata.original_filename) ||
          readString(item.metadata.filename) ||
          `知识片段 ${index + 1}`;
        const pageRange =
          readString(item.metadata.pageRange) ||
          readString(item.metadata.page_range) ||
          "";
        const heading =
          readString(item.metadata.heading) ||
          readString(item.metadata.title) ||
          "";
        const documentId =
          readString(item.metadata.documentId) ||
          readString(item.metadata.document_id) ||
          undefined;
        const chunkIndex =
          readNumber(item.metadata.chunkIndex) ??
          readNumber(item.metadata.chunk_index);
        const baseTitle = pageRange ? `${originalFileName} (p.${pageRange})` : originalFileName;
        const title = `${baseTitle} · ${confidenceLabel}`;
        const label = heading ? `${title} · ${heading}` : title;

        return {
          id: item.id,
          kind: "knowledge" as const,
          label,
          content: item.content,
          priority: Math.max(4, 12 - index),
          maxLength: 500,
          source: {
            type: "knowledge" as const,
            title,
            snippet: trimContextText(item.content, 200),
            score: item.score,
            documentId,
            chunkIndex,
            pageRange: pageRange || undefined,
          },
        };
      });

      const selectedKnowledge = selectContextFragments({
        query: params.query,
        maxLength: 12_000,
        minScore: 2,
        fragments: knowledgeCandidates.map((item) => ({
          id: item.id,
          kind: item.kind,
          label: item.label,
          content: item.content,
          priority: item.priority,
          maxLength: item.maxLength,
        })),
      });

      const selectedSourceIds = new Set(selectedKnowledge.fragments.map((item) => item.id));
      knowledgeCandidates.forEach((item) => {
        if (selectedSourceIds.has(item.id)) {
          sources.push(item.source);
        }
      });

      knowledgeContext = formatContextFragments(selectedKnowledge.fragments);
    }

    const memoryFragments: ContextFragment[] = [];

    if (localMemoryCtx) {
      memoryFragments.push(...buildAgentMemoryFragments(localMemoryCtx.memory));
    }

    if (memoryHits.length > 0) {
      memoryHits.forEach((item, index) => {
        sources.push({
          type: "memory",
          title: item.label || `长期记忆 ${index + 1}`,
          snippet: trimContextText(item.content, 180),
          score: item.score,
        });
      });
      memoryFragments.push(...buildTeacherMemoryCapsuleFragments(memoryHits));
    }

    if (memoryFragments.length > 0) {
      const dedupedMemoryFragments = dedupeTeacherMemoryFragments(memoryFragments);
      // 从 1200 增至 1500：新增本地三层记忆 + coreProfile fragments，需更多预算容纳合并结果
      const selectedMemory = selectContextFragments({
        query: params.query,
        maxLength: 1_200,
        minScore: 1,
        fragments: dedupedMemoryFragments,
      });
      memoryContext = formatContextFragments(selectedMemory.fragments);
    }
  }

  if (params.useWeb) {
    const webSearch = await searchWebWithClaude(params.query);
    const webFragments: Array<{
      id: string;
      kind: "web";
      label: string;
      content: string;
      priority: number;
      maxLength: number;
    }> = [];

    if (webSearch.summary) {
      webFragments.push({
        id: "web-summary",
        kind: "web",
        label: "联网搜索摘要",
        content: webSearch.summary,
        priority: 10,
        maxLength: 1_000,
      });
    }

    const topResults = webSearch.results.slice(0, 3);
    await Promise.all(
      topResults.map(async (result: WebSearchResult, index) => {
        sources.push({
          type: "web",
          title: result.title,
          url: result.url,
          snippet: result.snippet,
        });

        const pageText = await fetchWebPageWithJina(result.url).catch(() => "");
        const content = pageText || result.snippet;
        if (!content) return;
        webFragments.push({
          id: result.url || `web-${index}`,
          kind: "web",
          label: result.title,
          content: `URL: ${result.url}\n${content}`,
          priority: Math.max(4, 8 - index),
          maxLength: 900,
        });
      }),
    );

    if (webFragments.length > 0) {
      const selectedWeb = selectContextFragments({
        query: params.query,
        maxLength: 2_400,
        minScore: 2,
        fragments: webFragments,
      });
      webContext = formatContextFragments(selectedWeb.fragments);
    }
  }

  return {
    knowledgeContext,
    webContext,
    memoryContext,
    sources: dedupeSources(sources),
  };
}
