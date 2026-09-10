import type {
  TeacherCoreProfileState,
  TeacherMemoryBucket,
  TeacherMemoryEntry,
  TeacherMemoryMutationDraft,
  TeacherMemoryMutationMeta,
  TeacherMemoryRecord,
  TeacherStructuredMemoryState,
} from "@/lib/teacher-memory/types";

type ReconcileBucket = Exclude<TeacherMemoryBucket, "closedLoops">;

type StructuredPayload = {
  conversationSummary: string;
  recentTopics: string[];
  activeGoals: string[];
  openLoops: string[];
  closedLoops: string[];
  stablePreferences: string[];
  knowledgeAnchors: string[];
  proceduralMemory: string[];
  semanticMemory: string[];
  episodicMemory: string[];
  lastArtifactType: string;
  lastArtifactSummary: string;
  coreProfile?: TeacherCoreProfileState;
};

type ReconcileParams = {
  memory: TeacherMemoryRecord;
  payload: Record<string, unknown>;
  now: string;
  meta?: TeacherMemoryMutationMeta;
};

type ReconcileResult = {
  nextSummary: Record<string, unknown>;
  mutations: TeacherMemoryMutationDraft[];
};

const MEMORY_STATE_VERSION = 2;
const OPEN_LOOP_TTL_DAYS = 30;
const ACTIVE_GOAL_TTL_DAYS = 30;
const EPISODIC_TTL_DAYS = 30;
const CLOSED_LOOP_TTL_DAYS = 90;
const MATCH_THRESHOLD = 0.78;
const CLOSE_LOOP_MATCH_THRESHOLD = 0.6;

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMemoryText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[，。、“”‘’；：！？,.!?;:()[\]{}]/g, " ")
    .trim();
}

function normalizeMemoryMatchText(value: string) {
  return normalizeMemoryText(value)
    .toLowerCase()
    .replace(
      /(已经|已|完成了?|补完了?|做完了?|搞定了?|处理完了?|收尾了?|关闭了?|完结了?|done|completed|finished|resolved)/g,
      " ",
    )
    .replace(
      /^(请|帮我|需要|记得|继续|再来|再做|再补|补一版|补一份|做一版|整理一版|生成一版|出一版)\s*/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function asStringList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => normalizeMemoryText(`${item ?? ""}`))
    .filter(Boolean);
}

function dedupeStrings(items: string[], limit: number) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const normalized = normalizeMemoryText(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
    if (next.length >= limit) break;
  }
  return next;
}

function slugify(value: string) {
  const normalized = normalizeMemoryText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "entry";
}

function createEntryKey(bucket: TeacherMemoryBucket, content: string) {
  return `${bucket}:${slugify(content)}`.slice(0, 120);
}

function addDays(base: string, days: number) {
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function tokenize(value: string) {
  const normalized = normalizeMemoryText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
  const baseTokens = normalized
    .split(/[\s/-]+/)
    .filter(Boolean);
  const compact = normalized.replace(/\s+/g, "");
  const ngrams: string[] = [];

  if (compact.length >= 2) {
    for (let index = 0; index < compact.length - 1; index += 1) {
      ngrams.push(compact.slice(index, index + 2));
    }
  }

  return Array.from(new Set([...baseTokens, ...ngrams]));
}

function similarity(a: string, b: string) {
  const normalizedA = normalizeMemoryMatchText(a);
  const normalizedB = normalizeMemoryMatchText(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.92;

  const tokensA = new Set(tokenize(normalizedA));
  const tokensB = new Set(tokenize(normalizedB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? overlap / union : 0;
}

function getBucketLimit(bucket: TeacherMemoryBucket) {
  switch (bucket) {
    case "procedural":
    case "semantic":
      return 8;
    case "activeGoals":
    case "openLoops":
      return 6;
    case "closedLoops":
      return 12;
    case "episodicRecent":
      return 8;
    default:
      return 8;
  }
}

function getBucketExpiry(bucket: TeacherMemoryBucket, now: string) {
  if (bucket === "openLoops") return addDays(now, OPEN_LOOP_TTL_DAYS);
  if (bucket === "activeGoals") return addDays(now, ACTIVE_GOAL_TTL_DAYS);
  if (bucket === "episodicRecent") return addDays(now, EPISODIC_TTL_DAYS);
  if (bucket === "closedLoops") return addDays(now, CLOSED_LOOP_TTL_DAYS);
  return null;
}

function toEntry(input: unknown, fallbackNow: string): TeacherMemoryEntry | null {
  const record = asObject(input);
  const content = normalizeMemoryText(asString(record.content));
  if (!content) return null;
  const status = asString(record.status) === "closed" ? "closed" : "active";
  return {
    key: asString(record.key) || createEntryKey("semantic", content),
    content,
    createdAt: asString(record.createdAt) || fallbackNow,
    updatedAt: asString(record.updatedAt) || fallbackNow,
    expiresAt: asString(record.expiresAt) || null,
    status,
    sourceTurnKey: asString(record.sourceTurnKey) || null,
  };
}

function toEntries(input: unknown, fallbackNow: string, bucket: TeacherMemoryBucket) {
  if (!Array.isArray(input)) return [] as TeacherMemoryEntry[];
  const next: TeacherMemoryEntry[] = [];
  for (const item of input) {
    const entry = toEntry(item, fallbackNow);
    if (!entry) continue;
    next.push({
      ...entry,
      key: entry.key || createEntryKey(bucket, entry.content),
    });
  }
  return next;
}

function normalizeCoreProfile(input: unknown): TeacherCoreProfileState {
  const record = asObject(input);
  return {
    subjects: dedupeStrings(asStringList(record.subjects), 8),
    teachingStyle: asString(record.teachingStyle),
    notes: asString(record.notes),
  };
}

function buildLegacyState(memory: TeacherMemoryRecord): TeacherStructuredMemoryState {
  const summary = asObject(memory.summary);
  const now = memory.updatedAt || new Date().toISOString();
  const coreProfile = normalizeCoreProfile(summary.coreProfile);

  const makeEntries = (
    bucket: TeacherMemoryBucket,
    values: string[],
  ): TeacherMemoryEntry[] =>
    dedupeStrings(values, getBucketLimit(bucket)).map((content) => ({
      key: createEntryKey(bucket, content),
      content,
      createdAt: now,
      updatedAt: now,
      expiresAt: getBucketExpiry(bucket, now),
      status: bucket === "closedLoops" ? ("closed" as const) : ("active" as const),
      sourceTurnKey: null,
    }));

  return {
    version: MEMORY_STATE_VERSION,
    coreProfile,
    procedural: makeEntries("procedural", asStringList(summary.proceduralMemory)),
    semantic: makeEntries("semantic", asStringList(summary.semanticMemory)),
    activeGoals: makeEntries("activeGoals", asStringList(summary.activeGoals)),
    openLoops: makeEntries("openLoops", asStringList(summary.openLoops)),
    closedLoops: makeEntries("closedLoops", asStringList(summary.closedLoops)),
    episodicRecent: makeEntries("episodicRecent", asStringList(summary.episodicMemory)),
    latestConversationSummary: asString(summary.latestConversationSummary) || asString(summary.conversationSummary),
    lastArtifactType: asString(summary.lastArtifactType),
    lastArtifactSummary: asString(summary.lastArtifactSummary),
    lastReviewedAt: asString(summary.lastReviewedAt) || now,
  };
}

export function readTeacherStructuredMemoryState(memory: TeacherMemoryRecord): TeacherStructuredMemoryState {
  const summary = asObject(memory.summary);
  const rawState = asObject(summary.memoryState);
  const now = memory.updatedAt || new Date().toISOString();

  if (Number(rawState.version) === MEMORY_STATE_VERSION) {
    return {
      version: MEMORY_STATE_VERSION,
      coreProfile: normalizeCoreProfile(rawState.coreProfile),
      procedural: toEntries(rawState.procedural, now, "procedural"),
      semantic: toEntries(rawState.semantic, now, "semantic"),
      activeGoals: toEntries(rawState.activeGoals, now, "activeGoals"),
      openLoops: toEntries(rawState.openLoops, now, "openLoops"),
      closedLoops: toEntries(rawState.closedLoops, now, "closedLoops"),
      episodicRecent: toEntries(rawState.episodicRecent, now, "episodicRecent"),
      latestConversationSummary: asString(rawState.latestConversationSummary),
      lastArtifactType: asString(rawState.lastArtifactType),
      lastArtifactSummary: asString(rawState.lastArtifactSummary),
      lastReviewedAt: asString(rawState.lastReviewedAt) || now,
    };
  }

  return buildLegacyState(memory);
}

export function readTeacherMemoryView(memory: TeacherMemoryRecord) {
  const summary = asObject(memory.summary);
  const preferences = asObject(memory.preferences);
  const state = readTeacherStructuredMemoryState(memory);
  const activeEntries = (items: TeacherMemoryEntry[]) =>
    items.filter((item) => item.status === "active").map((item) => item.content);

  const responseStyle = asString(preferences.responseStyle);
  const proceduralMemory = dedupeStrings(
    [
      ...activeEntries(state.procedural),
      responseStyle ? `回答风格:${responseStyle}` : "",
    ],
    8,
  );

  return {
    state,
    coreProfile: state.coreProfile,
    proceduralMemory,
    semanticMemory: dedupeStrings(activeEntries(state.semantic), 8),
    activeGoals: dedupeStrings(activeEntries(state.activeGoals), 6),
    openLoops: dedupeStrings(activeEntries(state.openLoops), 6),
    closedLoops: dedupeStrings(state.closedLoops.map((item) => item.content), 8),
    episodicMemory: dedupeStrings(activeEntries(state.episodicRecent), 8),
    recentTopics: dedupeStrings(asStringList(summary.recentTopics), 8),
    stablePreferences: dedupeStrings(asStringList(summary.stablePreferences), 8),
    knowledgeAnchors: dedupeStrings(asStringList(summary.knowledgeAnchors), 8),
    latestConversationSummary:
      state.latestConversationSummary || asString(summary.latestConversationSummary),
    lastArtifactType: state.lastArtifactType || asString(summary.lastArtifactType),
    lastArtifactSummary: state.lastArtifactSummary || asString(summary.lastArtifactSummary),
  };
}

function toStructuredPayload(payload: Record<string, unknown>): StructuredPayload {
  const profile = normalizeCoreProfile(payload.coreProfile);
  return {
    conversationSummary: asString(payload.conversationSummary),
    recentTopics: dedupeStrings(asStringList(payload.recentTopics), 8),
    activeGoals: dedupeStrings(asStringList(payload.activeGoals), 6),
    openLoops: dedupeStrings(asStringList(payload.openLoops), 6),
    closedLoops: dedupeStrings(asStringList(payload.closedLoops), 6),
    stablePreferences: dedupeStrings(asStringList(payload.stablePreferences), 8),
    knowledgeAnchors: dedupeStrings(asStringList(payload.knowledgeAnchors), 8),
    proceduralMemory: dedupeStrings(asStringList(payload.proceduralMemory), 8),
    semanticMemory: dedupeStrings(asStringList(payload.semanticMemory), 8),
    episodicMemory: dedupeStrings(asStringList(payload.episodicMemory), 8),
    lastArtifactType: asString(payload.lastArtifactType),
    lastArtifactSummary: asString(payload.lastArtifactSummary),
    coreProfile:
      profile.subjects.length > 0 || profile.teachingStyle || profile.notes
        ? profile
        : undefined,
  };
}

function hasStructuredMemorySignals(payload: Record<string, unknown>) {
  return [
    payload.conversationSummary,
    payload.coreProfile,
    payload.recentTopics,
    payload.activeGoals,
    payload.openLoops,
    payload.closedLoops,
    payload.stablePreferences,
    payload.knowledgeAnchors,
    payload.proceduralMemory,
    payload.semanticMemory,
    payload.episodicMemory,
    payload.lastArtifactSummary,
    payload.lastArtifactType,
  ].some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(asObject(value)).length > 0;
    return Boolean(asString(value));
  });
}

function findBestMatch(
  entries: TeacherMemoryEntry[],
  content: string,
  threshold = MATCH_THRESHOLD,
) {
  let best: TeacherMemoryEntry | null = null;
  let bestScore = -1;
  for (const entry of entries) {
    const score = similarity(entry.content, content);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  if (!best || bestScore < threshold) return null;
  return { entry: best, score: bestScore };
}

function trimEntries(items: TeacherMemoryEntry[], bucket: TeacherMemoryBucket) {
  return [...items]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, getBucketLimit(bucket));
}

function cloneEntries(items: TeacherMemoryEntry[]) {
  return items.map((item) => ({ ...item }));
}

function reconcileBucket(params: {
  bucket: ReconcileBucket;
  existing: TeacherMemoryEntry[];
  candidates: string[];
  now: string;
  turnKey?: string;
  reason: string;
}) {
  const next = cloneEntries(params.existing);
  const mutations: TeacherMemoryMutationDraft[] = [];

  for (const rawContent of params.candidates) {
    const content = normalizeMemoryText(rawContent);
    if (!content) continue;
    const match = findBestMatch(next.filter((item) => item.status === "active"), content);
    if (match) {
      const before = { ...match.entry };
      if (normalizeMemoryText(match.entry.content).toLowerCase() !== content.toLowerCase()) {
        match.entry.content = content;
        match.entry.updatedAt = params.now;
        match.entry.sourceTurnKey = params.turnKey ?? match.entry.sourceTurnKey;
        mutations.push({
          bucket: params.bucket,
          operation: "update",
          targetKey: match.entry.key,
          beforeValue: before,
          afterValue: { ...match.entry },
          reason: params.reason,
        });
      } else {
        match.entry.updatedAt = params.now;
      }
      if (params.bucket === "openLoops" || params.bucket === "activeGoals" || params.bucket === "episodicRecent") {
        match.entry.expiresAt = getBucketExpiry(params.bucket, params.now);
      }
      continue;
    }

    const entry: TeacherMemoryEntry = {
      key: createEntryKey(params.bucket, content),
      content,
      createdAt: params.now,
      updatedAt: params.now,
      expiresAt: getBucketExpiry(params.bucket, params.now),
      status: "active",
      sourceTurnKey: params.turnKey ?? null,
    };
    next.push(entry);
    mutations.push({
      bucket: params.bucket,
      operation: "add",
      targetKey: entry.key,
      beforeValue: null,
      afterValue: { ...entry },
      reason: params.reason,
    });
  }

  return {
    entries: trimEntries(next, params.bucket),
    mutations,
  };
}

function closeMatchingEntries(params: {
  state: TeacherStructuredMemoryState;
  closedLoops: string[];
  now: string;
  turnKey?: string;
}) {
  const mutations: TeacherMemoryMutationDraft[] = [];
  if (params.closedLoops.length === 0) {
    return {
      state: params.state,
      mutations,
    };
  }

  const nextOpen = cloneEntries(params.state.openLoops);
  const nextGoals = cloneEntries(params.state.activeGoals);
  const nextClosed = cloneEntries(params.state.closedLoops);

  for (const rawContent of params.closedLoops) {
    const content = normalizeMemoryText(rawContent);
    if (!content) continue;
    const openMatch = findBestMatch(
      nextOpen.filter((item) => item.status === "active"),
      content,
      CLOSE_LOOP_MATCH_THRESHOLD,
    );
    const goalMatch = findBestMatch(
      nextGoals.filter((item) => item.status === "active"),
      content,
      CLOSE_LOOP_MATCH_THRESHOLD,
    );
    const matched = openMatch?.entry ?? goalMatch?.entry ?? null;

    if (matched) {
      const before = { ...matched };
      matched.status = "closed";
      matched.updatedAt = params.now;
      matched.expiresAt = getBucketExpiry("closedLoops", params.now);
      matched.sourceTurnKey = params.turnKey ?? matched.sourceTurnKey;

      const closedMatch = findBestMatch(nextClosed, matched.content, 0.9);
      if (!closedMatch) {
        nextClosed.push({
          ...matched,
          key: createEntryKey("closedLoops", matched.content),
        });
      }

      mutations.push({
        bucket: before.key.startsWith("activeGoals:") ? "activeGoals" : "openLoops",
        operation: "close",
        targetKey: before.key,
        beforeValue: before,
        afterValue: { ...matched },
        reason: "teacher_memory_closed_loop",
      });
      continue;
    }

    const closedEntry: TeacherMemoryEntry = {
      key: createEntryKey("closedLoops", content),
      content,
      createdAt: params.now,
      updatedAt: params.now,
      expiresAt: getBucketExpiry("closedLoops", params.now),
      status: "closed",
      sourceTurnKey: params.turnKey ?? null,
    };
    nextClosed.push(closedEntry);
    mutations.push({
      bucket: "closedLoops",
      operation: "add",
      targetKey: closedEntry.key,
      beforeValue: null,
      afterValue: { ...closedEntry },
      reason: "teacher_memory_closed_loop",
    });
  }

  return {
    state: {
      ...params.state,
      openLoops: trimEntries(nextOpen.filter((item) => item.status === "active"), "openLoops"),
      activeGoals: trimEntries(nextGoals.filter((item) => item.status === "active"), "activeGoals"),
      closedLoops: trimEntries(nextClosed, "closedLoops"),
    },
    mutations,
  };
}

function cleanupState(state: TeacherStructuredMemoryState, now: string) {
  const mutations: TeacherMemoryMutationDraft[] = [];
  const nextState = {
    ...state,
    procedural: trimEntries(state.procedural, "procedural"),
    semantic: trimEntries(state.semantic, "semantic"),
    activeGoals: cloneEntries(state.activeGoals),
    openLoops: cloneEntries(state.openLoops),
    closedLoops: cloneEntries(state.closedLoops),
    episodicRecent: cloneEntries(state.episodicRecent),
  };

  const stillOpen: TeacherMemoryEntry[] = [];
  for (const item of nextState.openLoops) {
    if (item.expiresAt && Date.parse(item.expiresAt) <= Date.parse(now)) {
      const closedEntry: TeacherMemoryEntry = {
        ...item,
        key: createEntryKey("closedLoops", item.content),
        status: "closed",
        updatedAt: now,
        expiresAt: getBucketExpiry("closedLoops", now),
      };
      nextState.closedLoops.push(closedEntry);
      mutations.push({
        bucket: "openLoops",
        operation: "close",
        targetKey: item.key,
        beforeValue: { ...item },
        afterValue: { ...closedEntry },
        reason: "teacher_memory_open_loop_expired",
      });
      continue;
    }
    stillOpen.push(item);
  }
  nextState.openLoops = trimEntries(stillOpen, "openLoops");

  nextState.activeGoals = trimEntries(
    nextState.activeGoals.filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > Date.parse(now)),
    "activeGoals",
  );
  nextState.episodicRecent = trimEntries(
    nextState.episodicRecent.filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > Date.parse(now)),
    "episodicRecent",
  );
  nextState.closedLoops = trimEntries(
    nextState.closedLoops.filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > Date.parse(now)),
    "closedLoops",
  );

  return {
    state: nextState,
    mutations,
  };
}

function buildSummaryWithState(params: {
  summary: Record<string, unknown>;
  state: TeacherStructuredMemoryState;
  payload: StructuredPayload;
  now: string;
}) {
  const activeContent = (items: TeacherMemoryEntry[]) =>
    items.filter((item) => item.status === "active").map((item) => item.content);

  return {
    ...params.summary,
    memoryVersion: MEMORY_STATE_VERSION,
    memoryState: params.state,
    coreProfile: params.state.coreProfile,
    proceduralMemory: dedupeStrings(activeContent(params.state.procedural), 8),
    semanticMemory: dedupeStrings(activeContent(params.state.semantic), 8),
    activeGoals: dedupeStrings(activeContent(params.state.activeGoals), 6),
    openLoops: dedupeStrings(activeContent(params.state.openLoops), 6),
    closedLoops: dedupeStrings(params.state.closedLoops.map((item) => item.content), 8),
    episodicMemory: dedupeStrings(activeContent(params.state.episodicRecent), 8),
    stablePreferences: dedupeStrings(
      [
        ...asStringList(params.summary.stablePreferences),
        ...params.payload.stablePreferences,
        ...activeContent(params.state.procedural),
      ],
      8,
    ),
    knowledgeAnchors: dedupeStrings(
      [
        ...asStringList(params.summary.knowledgeAnchors),
        ...params.payload.knowledgeAnchors,
        ...activeContent(params.state.semantic),
      ],
      8,
    ),
    recentTopics: dedupeStrings(
      [...params.payload.recentTopics, ...asStringList(params.summary.recentTopics)],
      8,
    ),
    latestConversationSummary: params.state.latestConversationSummary,
    lastArtifactType: params.state.lastArtifactType,
    lastArtifactSummary: params.state.lastArtifactSummary,
    lastReviewedAt: params.state.lastReviewedAt || params.now,
  };
}

export function reconcileTeacherMemoryState(params: ReconcileParams): ReconcileResult {
  const summary = asObject(params.memory.summary);
  if (!hasStructuredMemorySignals(params.payload)) {
    const existingState = readTeacherStructuredMemoryState(params.memory);
    const cleaned = cleanupState(existingState, params.now);
    return {
      nextSummary: buildSummaryWithState({
        summary,
        state: {
          ...cleaned.state,
          lastReviewedAt: params.now,
        },
        payload: toStructuredPayload({}),
        now: params.now,
      }),
      mutations: cleaned.mutations,
    };
  }

  const payload = toStructuredPayload(params.payload);
  let state = readTeacherStructuredMemoryState(params.memory);
  const mutations: TeacherMemoryMutationDraft[] = [];

  if (payload.coreProfile) {
    const before = state.coreProfile;
    const after = {
      subjects: dedupeStrings([...before.subjects, ...payload.coreProfile.subjects], 8),
      teachingStyle: payload.coreProfile.teachingStyle || before.teachingStyle,
      notes: payload.coreProfile.notes || before.notes,
    };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      mutations.push({
        bucket: "semantic",
        operation: "update",
        targetKey: "core-profile",
        beforeValue: before,
        afterValue: after,
        reason: "teacher_memory_core_profile",
      });
    }
    state = {
      ...state,
      coreProfile: after,
    };
  }

  const procedural = reconcileBucket({
    bucket: "procedural",
    existing: state.procedural,
    candidates: payload.proceduralMemory,
    now: params.now,
    turnKey: params.meta?.turnKey,
    reason: "teacher_memory_procedural_reconcile",
  });
  const semantic = reconcileBucket({
    bucket: "semantic",
    existing: state.semantic,
    candidates: payload.semanticMemory,
    now: params.now,
    turnKey: params.meta?.turnKey,
    reason: "teacher_memory_semantic_reconcile",
  });
  const activeGoals = reconcileBucket({
    bucket: "activeGoals",
    existing: state.activeGoals,
    candidates: payload.activeGoals,
    now: params.now,
    turnKey: params.meta?.turnKey,
    reason: "teacher_memory_goal_reconcile",
  });
  const openLoops = reconcileBucket({
    bucket: "openLoops",
    existing: state.openLoops,
    candidates: payload.openLoops,
    now: params.now,
    turnKey: params.meta?.turnKey,
    reason: "teacher_memory_open_loop_reconcile",
  });
  const episodic = reconcileBucket({
    bucket: "episodicRecent",
    existing: state.episodicRecent,
    candidates: payload.episodicMemory,
    now: params.now,
    turnKey: params.meta?.turnKey,
    reason: "teacher_memory_episodic_reconcile",
  });

  state = {
    ...state,
    procedural: procedural.entries,
    semantic: semantic.entries,
    activeGoals: activeGoals.entries,
    openLoops: openLoops.entries,
    episodicRecent: episodic.entries,
    latestConversationSummary: payload.conversationSummary || state.latestConversationSummary,
    lastArtifactType: payload.lastArtifactType || state.lastArtifactType,
    lastArtifactSummary: payload.lastArtifactSummary || state.lastArtifactSummary,
    lastReviewedAt: params.now,
  };
  mutations.push(...procedural.mutations, ...semantic.mutations, ...activeGoals.mutations, ...openLoops.mutations, ...episodic.mutations);

  const closed = closeMatchingEntries({
    state,
    closedLoops: payload.closedLoops,
    now: params.now,
    turnKey: params.meta?.turnKey,
  });
  state = closed.state;
  mutations.push(...closed.mutations);

  const cleaned = cleanupState(state, params.now);
  state = {
    ...cleaned.state,
    lastReviewedAt: params.now,
  };
  mutations.push(...cleaned.mutations);

  return {
    nextSummary: buildSummaryWithState({
      summary,
      state,
      payload,
      now: params.now,
    }),
    mutations,
  };
}

export function buildTeacherMemoryMaintenanceSummary(memory: TeacherMemoryRecord, now: string) {
  const state = readTeacherStructuredMemoryState(memory);
  const cleaned = cleanupState(state, now);
  return {
    nextSummary: buildSummaryWithState({
      summary: asObject(memory.summary),
      state: {
        ...cleaned.state,
        lastReviewedAt: now,
      },
      payload: toStructuredPayload({}),
      now,
    }),
    mutations: cleaned.mutations,
  };
}
