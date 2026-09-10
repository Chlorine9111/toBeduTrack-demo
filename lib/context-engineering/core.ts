type ContextFragmentKind =
  | "memory"
  | "history"
  | "artifact"
  | "attachment"
  | "knowledge"
  | "web"
  | "instruction";

export type ContextFragment = {
  id: string;
  kind: ContextFragmentKind;
  label: string;
  content: string;
  priority?: number;
  maxLength?: number;
  sticky?: boolean;
  suppressOnReset?: boolean;
};

export type SelectedContextFragment = ContextFragment & {
  score: number;
  selectedLength: number;
};

export type ContextMessage = {
  role: "user" | "assistant";
  content: string;
};

const CONTEXT_RESET_PATTERN =
  /(重新开始|从头开始|新任务|新需求|新指令|新话题|全新(?:的)?|新的(?:主题|单元|课程|教案|题目|版本|任务|需求)|换个|换一个|另起一(?:个|份|套)|另外一(?:个|份|套)|忽略(?:前文|上文|之前|上一轮)|不要参考(?:前文|上文|之前|上一轮|上次)|不要(?:沿用|用上次)|别(?:沿用|用上次|参考上次)|不基于上次|清空上下文|from scratch|start over|new task|new request|new topic|ignore (?:the )?previous)/i;
const CONTEXT_CONTINUATION_PATTERN =
  /(继续|接着|沿用|按刚才|按上次|按上一版|基于上次|延续|同一套|刚才那份|刚才那版|上一版|上一份|上轮|刚生成|把刚才|把上次|把上一版|修改上一版|same|continue|follow up|keep the same|revise|rewrite|refine)/i;
const GENERIC_TERMS = new Set([
  "ap",
  "unit",
  "topic",
  "help",
  "please",
  "with",
  "for",
  "and",
]);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeStrings(items: string[], limit: number) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of items) {
    const normalized = normalizeWhitespace(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
    if (next.length >= limit) break;
  }

  return next;
}

export function trimContextText(text: string, maxLength: number) {
  const normalized = text.replace(/\r/g, "").trim();
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function compressContextText(text: string, maxLength = 420) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;

  const headings = Array.from(normalized.matchAll(/^#{1,6}\s+(.+)$/gm))
    .map((match) => normalizeWhitespace(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 4);
  const bullets = Array.from(normalized.matchAll(/^[\-\*\d.]+\s+(.+)$/gm))
    .map((match) => normalizeWhitespace(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 5);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => normalizeWhitespace(item))
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
    return trimContextText(candidate, maxLength);
  }

  return trimContextText(
    `${normalized.slice(0, Math.max(120, maxLength - 80))} ... ${normalized.slice(-60)}`,
    maxLength,
  );
}

function extractTerms(text: string) {
  const normalized = text.toLowerCase();
  const latinTerms =
    (normalized.match(/[a-z][a-z0-9./+-]{1,24}/g) ?? []).filter(
      (item) => !GENERIC_TERMS.has(item),
    );
  const numericTerms = normalized.match(/unit\s*\d+|topic\s*\d+(?:\.\d+)?/g) ?? [];
  const chineseTerms = text.match(/[\u4e00-\u9fa5]{2,14}/g) ?? [];

  return dedupeStrings(
    [...latinTerms, ...numericTerms, ...chineseTerms].filter((item) => item.length >= 2),
    24,
  );
}

function countTermHits(terms: string[], text: string) {
  if (terms.length === 0 || !text) return 0;
  const normalized = text.toLowerCase();
  let hits = 0;

  for (const term of terms) {
    const lowered = term.toLowerCase();
    if (lowered && normalized.includes(lowered)) {
      hits += lowered.length >= 6 ? 2 : 1;
    }
  }

  return hits;
}

function scoreFragment(params: {
  queryTerms: string[];
  fragment: ContextFragment;
  index: number;
  continuationMode: boolean;
}) {
  const content = normalizeWhitespace(params.fragment.content);
  if (!content) return Number.NEGATIVE_INFINITY;

  const overlapScore = countTermHits(params.queryTerms, `${params.fragment.label} ${content}`);
  const lengthPenalty = Math.floor(content.length / 700);
  const recencyBoost = Math.max(0, 4 - params.index);
  const basePriority = params.fragment.priority ?? 0;

  if (
    params.queryTerms.length > 0 &&
    overlapScore === 0 &&
    !params.continuationMode &&
    (params.fragment.kind === "history" ||
      params.fragment.kind === "artifact" ||
      (params.fragment.kind === "memory" && !params.fragment.sticky))
  ) {
    return -1;
  }

  let score = basePriority * 6 + overlapScore * 5 + recencyBoost - lengthPenalty;

  if (params.fragment.sticky) score += 12;
  if (params.fragment.kind === "attachment") score += 6;
  if (params.fragment.kind === "artifact") score += params.continuationMode ? 6 : 2;
  if (params.queryTerms.length > 0 && overlapScore === 0 && !params.fragment.sticky) {
    score -= 6;
  }
  if (params.fragment.kind === "history" && overlapScore === 0) score -= 18;
  if (params.fragment.kind === "web" && overlapScore === 0) score -= 3;
  if (params.fragment.kind === "artifact" && overlapScore === 0 && !params.continuationMode) {
    score -= 18;
  }
  if (
    params.fragment.kind === "memory" &&
    overlapScore === 0 &&
    !params.continuationMode &&
    !params.fragment.sticky
  ) {
    score -= 40;
  }

  return score;
}

export function detectContextReset(text: string) {
  return CONTEXT_RESET_PATTERN.test(normalizeWhitespace(text));
}

export function detectContextContinuation(text: string) {
  return CONTEXT_CONTINUATION_PATTERN.test(normalizeWhitespace(text));
}

export function selectContextFragments(params: {
  query: string;
  fragments: ContextFragment[];
  maxLength: number;
  minScore?: number;
  resetMode?: "normal" | "reset";
}) {
  const resetMode = params.resetMode ?? "normal";
  const continuationMode = detectContextContinuation(params.query);
  const queryTerms = extractTerms(params.query);

  const prepared = params.fragments
    .map((fragment, index) => {
      if (!fragment.content.trim()) return null;
      if (resetMode === "reset" && fragment.suppressOnReset) return null;

      const maxLength = fragment.maxLength ?? Math.min(720, params.maxLength);
      const content = compressContextText(fragment.content, maxLength);
      const score = scoreFragment({
        queryTerms,
        fragment: { ...fragment, content },
        index: params.fragments.length - index,
        continuationMode,
      });

      return {
        index,
        fragment: { ...fragment, content },
        score,
      };
    })
    .filter(
      (
        item,
      ): item is {
        index: number;
        fragment: ContextFragment;
        score: number;
      } => item !== null,
    )
    .filter((item) => item.score >= (params.minScore ?? 0));

  const orderedForSelection = [...prepared].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.index - right.index;
  });

  const selectedKeys = new Set<string>();
  const selectedByIndex = new Map<number, SelectedContextFragment>();
  let usedLength = 0;

  for (const item of orderedForSelection) {
    const key = `${item.fragment.kind}:${item.fragment.label}:${item.fragment.content.toLowerCase()}`;
    if (selectedKeys.has(key)) continue;

    const remaining = params.maxLength - usedLength;
    if (remaining <= 120 && selectedByIndex.size > 0) break;

    let content = item.fragment.content;
    if (content.length > remaining) {
      if (remaining < 120 && !item.fragment.sticky) continue;
      content = compressContextText(content, Math.max(120, remaining));
    }

    if (!content) continue;

    selectedKeys.add(key);
    const selected: SelectedContextFragment = {
      ...item.fragment,
      content,
      score: item.score,
      selectedLength: content.length,
    };
    selectedByIndex.set(item.index, selected);
    usedLength += content.length;
  }

  const selected = Array.from(selectedByIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);

  return {
    fragments: selected,
    totalLength: usedLength,
    resetApplied: resetMode === "reset",
  };
}

export function formatContextFragments(fragments: Array<Pick<ContextFragment, "label" | "content">>) {
  return fragments
    .map((fragment) => `【${fragment.label}】\n${fragment.content}`)
    .join("\n\n");
}

export function buildContextRetrievalQuery(params: {
  query: string;
  hints: string[];
  maxLength?: number;
  carryover?: boolean;
}) {
  const fragments = params.hints.map((hint, index) => ({
    id: `hint-${index}`,
    kind: "memory" as const,
    label: `hint-${index + 1}`,
    content: hint,
    priority: Math.max(1, 8 - index),
    maxLength: 120,
    suppressOnReset: true,
  }));
  const carryover = params.carryover ?? !detectContextReset(params.query);
  const selected = selectContextFragments({
    query: params.query,
    fragments,
    maxLength: Math.max(80, (params.maxLength ?? 320) - params.query.length),
    minScore: 3,
    resetMode: carryover ? "normal" : "reset",
  });

  return trimContextText(
    dedupeStrings([params.query, ...selected.fragments.map((item) => item.content)], 8).join(" "),
    params.maxLength ?? 320,
  );
}

export function selectConversationMessages(params: {
  query: string;
  messages: ContextMessage[];
  maxMessages?: number;
  maxLength?: number;
}) {
  if (params.messages.length === 0) return [];
  if (detectContextReset(params.query)) return [];

  const maxMessages = params.maxMessages ?? 20;
  return params.messages.slice(-maxMessages);
}
