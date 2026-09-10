import { searchWebWithClaude } from "@/lib/assistant/claude-web-search";
import { trimText } from "@/lib/lesson-plan/material-parser";

export interface WebEnrichmentResult {
  summary: string;
  queries: string[];
  references: Array<{ title: string; url: string; snippet: string }>;
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];

  for (const query of queries) {
    const normalized = query.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push(normalized);
  }

  return list;
}

export async function runWebEnrichment(params: {
  sourcePrompt: string;
  confirmation: {
    subject: { name: string };
    unit: { title: string };
  };
  abortSignal?: AbortSignal;
}): Promise<WebEnrichmentResult | null> {
  const queryCandidates = dedupeQueries([
    `${params.confirmation.subject.name} ${params.confirmation.unit.title} 最新课堂案例`,
    `${params.confirmation.subject.name} ${params.confirmation.unit.title} formative assessment strategy`,
  ]).slice(0, 1);

  if (queryCandidates.length === 0) {
    return null;
  }

  const responses = await Promise.all(
    queryCandidates.map(async (query) => {
      try {
        return {
          query,
          data: await searchWebWithClaude(query, {
            timeoutMs: 8_000,
            maxUses: 1,
            abortSignal: params.abortSignal,
          }),
        };
      } catch {
        return null;
      }
    }),
  );

  const valid = responses.filter(
    (item): item is { query: string; data: Awaited<ReturnType<typeof searchWebWithClaude>> } =>
      Boolean(item),
  );
  if (valid.length === 0) {
    return null;
  }

  const references = valid
    .flatMap((item) => item.data.results.map((result) => ({ ...result, query: item.query })))
    .filter((item) => /^https?:\/\//i.test(item.url))
    .slice(0, 6);

  return {
    summary: valid
      .map((item) => `【${item.query}】\n${trimText(item.data.summary || "无摘要", 600)}`)
      .join("\n\n"),
    queries: valid.map((item) => item.query),
    references: references.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: trimText(item.snippet, 180),
    })),
  };
}
