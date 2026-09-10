import { generateText } from "ai";
import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  callGoogleEmbeddings,
  DEFAULT_GOOGLE_EMBEDDING_MODEL,
} from "@/lib/ai/google-embeddings";
import {
  resolveLanguageModel,
  resolveModelTemperature,
} from "@/lib/ai/provider-registry";
import type {
  ApQuestionBankDifficulty,
  ApQuestionBankListItem,
  ApQuestionBankListResponse,
  ApQuestionBankMaterialDetailQuestion,
  ApQuestionBankMaterialDetailResponse,
  ApQuestionBankMaterialItem,
  ApQuestionBankMaterialsResponse,
  ApQuestionBankParsedIntent,
  ApQuestionBankSearchMode,
  ApQuestionBankSearchParams,
  ApQuestionBankSearchResponse,
  ApQuestionBankSearchResultRow,
} from "@/lib/question-bank/ap-types";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type SearchQuestionsRpcParams = {
  query_embedding: number[];
  search_mode: string;
  filter_course: string | null;
  filter_unit: number | null;
  filter_difficulty: string | null;
  filter_cognitive_task?: string | null;
  filter_topic?: string | null;
  match_count: number;
};

type FallbackQuestionRow = {
  id: string;
  course: string;
  unit: number;
  stem: string;
  choices: ApQuestionBankSearchResultRow["choices"];
  correct_answer: string;
  explanation: string | null;
  difficulty: string;
  cognitive_task: string | null;
  topic_code: string | null;
  key_concepts: string[];
  source_assessment: string | null;
  question_number: number | null;
  stimulus: {
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  } | Array<{
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  }> | null;
};

const PARSED_INTENT_TTL_MS = 30 * 60 * 1000;
const EMBEDDING_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_RESPONSE_TTL_MS = 30 * 1000;
const CACHE_MAX_ENTRIES = 256;
const PARSED_INTENT_TTL_SECONDS = PARSED_INTENT_TTL_MS / 1000;
const EMBEDDING_TTL_SECONDS = EMBEDDING_TTL_MS / 1000;
const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE_SIZE = 18;
const EMBEDDING_DIMENSION = 1536;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

let apQuestionBankClient: SupabaseClient | null = null;

const parsedIntentCache = new Map<string, CacheEntry<ApQuestionBankParsedIntent>>();
const parsedIntentInflight = new Map<string, Promise<ApQuestionBankParsedIntent>>();
const searchEmbeddingCache = new Map<string, CacheEntry<number[]>>();
const searchEmbeddingInflight = new Map<string, Promise<number[]>>();
const searchResponseCache = new Map<string, CacheEntry<ApQuestionBankSearchResponse>>();
const searchResponseInflight = new Map<string, Promise<ApQuestionBankSearchResponse>>();

const VALID_COURSE_CODES = [
  "AP_BIO",
  "AP_CALC_AB",
  "AP_CALC_BC",
  "AP_CHEM",
  "AP_CSA",
  "AP_CSP",
  "AP_MACRO",
  "AP_MICRO",
  "AP_PHYSICS_1",
  "AP_PHYSICS_2",
  "AP_PHYSICS_C_EM",
  "AP_PHYSICS_C_MECH",
  "AP_PRECALC",
  "AP_STATS",
  "APES",
] as const;

const HAIKU_SYSTEM = `You are a search query parser for an AP exam question bank.

Valid course codes (use EXACTLY one of these, or null if uncertain):
${VALID_COURSE_CODES.join(", ")}

Given a teacher's natural language query (Chinese or English), extract:
1. search_query: Rewrite into concise English keywords optimized for embedding similarity search.
2. course: one of the valid course codes listed above if identifiable, otherwise null. IMPORTANT: use AP_CALC_AB or AP_CALC_BC (not "AP_CALC"), AP_PHYSICS_1 or AP_PHYSICS_2 or AP_PHYSICS_C_MECH or AP_PHYSICS_C_EM (not "AP_PHYSICS").
3. unit: Integer if specified, null otherwise.
4. difficulty: "easy"/"medium"/"hard" if specified, null otherwise.
5. mode: "diagnostic" if the teacher mentions misconceptions/confusion, otherwise "content".
6. reasoning: One short Chinese sentence explaining the parsing.

Respond with ONLY valid JSON, no markdown fences.`;

const HAIKU_EXAMPLES = [
  {
    role: "user" as const,
    content: "给我unit 3关于种群增长的难题",
  },
  {
    role: "assistant" as const,
    content:
      '{"search_query":"population growth carrying capacity exponential logistic","course":"APES","unit":3,"difficulty":"hard","mode":"content","reasoning":"种群增长=APES，提取 unit=3、难题=hard"}',
  },
  {
    role: "user" as const,
    content: "学生总搞混食物链和食物网",
  },
  {
    role: "assistant" as const,
    content:
      '{"search_query":"food chain vs food web difference","course":"APES","unit":null,"difficulty":null,"mode":"diagnostic","reasoning":"搞混对应诊断型查询，主题落在 APES"}',
  },
  {
    role: "user" as const,
    content: "化学平衡常数和Le Chatelier原理",
  },
  {
    role: "assistant" as const,
    content:
      '{"search_query":"chemical equilibrium constant Le Chatelier principle shift","course":"AP_CHEM","unit":null,"difficulty":null,"mode":"content","reasoning":"化学平衡主题映射到 AP 化学"}',
  },
];

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function readCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const current = cache.get(key);
  if (!current) return null;
  if (current.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return current.value;
}

function writeCachedValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

async function withCache<T>(
  cache: Map<string, CacheEntry<T>>,
  inflight: Map<string, Promise<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
) {
  if (ttlMs > 0) {
    const cached = readCachedValue(cache, key);
    if (cached !== null) {
      return cached;
    }
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const next = load()
    .then((value) => {
      if (ttlMs > 0) {
        writeCachedValue(cache, key, value, ttlMs);
      }
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, next);
  return next;
}

function buildParsedIntentCacheKey(query: string) {
  return cleanText(query).toLowerCase();
}

function buildEmbeddingCacheKey(searchQuery: string) {
  return `1536:${cleanText(searchQuery).toLowerCase()}`;
}

function buildSearchResponseCacheKey(params: {
  query: string;
  course: string | null;
  unit: number | null;
  difficulty: string | null;
  cognitiveTask: string | null;
  topicCode: string | null;
  mode: ApQuestionBankSearchMode;
  limit: number;
  page: number;
}) {
  return JSON.stringify({
    query: cleanText(params.query).toLowerCase(),
    course: cleanText(params.course).toUpperCase() || null,
    unit: params.unit,
    difficulty: params.difficulty ?? null,
    cognitiveTask: cleanText(params.cognitiveTask).toLowerCase() || null,
    topicCode: cleanText(params.topicCode).toLowerCase() || null,
    mode: params.mode,
    limit: params.limit,
    page: params.page,
  });
}

export function createApQuestionBankClient(): SupabaseClient {
  if (apQuestionBankClient) return apQuestionBankClient;

  // Use the main project Supabase (questions table lives here, not in external TIKU)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Missing Supabase credentials for question bank");
  }

  apQuestionBankClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  return apQuestionBankClient;
}

function resolveStimulusFromRow(
  raw: FallbackQuestionRow["stimulus"] | ApQuestionBankListItem["stimulus"],
) {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function mapListItemToSearchRow(
  item: ApQuestionBankListItem | ApQuestionBankMaterialDetailQuestion,
): ApQuestionBankSearchResultRow {
  const stimulus =
    "stimulus" in item ? resolveStimulusFromRow(item.stimulus) : null;

  return {
    id: item.id,
    course: item.course,
    unit: item.unit,
    topic_code: item.topic_code,
    difficulty: item.difficulty,
    cognitive_task: item.cognitive_task,
    transfer_distance: null,
    source_assessment: item.source_assessment,
    question_number: item.question_number,
    stem: item.stem,
    choices: item.choices,
    correct_answer: item.correct_answer,
    explanation: item.explanation,
    key_concepts: item.key_concepts ?? [],
    stimulus_id: "stimulus_id" in item ? item.stimulus_id : null,
    standalone_usable: item.standalone_usable,
    similarity: 0,
    stimulus_content_type: stimulus?.content_type ?? null,
    stimulus_description: stimulus?.description ?? null,
    stimulus_image_url: stimulus?.image_url ?? null,
  };
}

function mapFallbackQuestionRowToSearchResult(
  row: FallbackQuestionRow,
): ApQuestionBankSearchResultRow {
  const stimulus = resolveStimulusFromRow(row.stimulus);

  return {
    id: row.id,
    course: row.course,
    unit: row.unit,
    topic_code: row.topic_code,
    difficulty: row.difficulty,
    cognitive_task: row.cognitive_task,
    transfer_distance: null,
    source_assessment: row.source_assessment,
    question_number: row.question_number,
    stem: row.stem,
    choices: row.choices,
    correct_answer: row.correct_answer,
    explanation: row.explanation,
    key_concepts: row.key_concepts ?? [],
    stimulus_id: null,
    standalone_usable: true,
    similarity: 0,
    stimulus_content_type: stimulus?.content_type ?? null,
    stimulus_description: stimulus?.description ?? null,
    stimulus_image_url: stimulus?.image_url ?? null,
  };
}

const getParsedIntentFromDataCache = unstable_cache(
  async (userQuery: string) => parseQueryWithHaiku(userQuery),
  ["ap-question-bank-search-intent"],
  { revalidate: PARSED_INTENT_TTL_SECONDS },
);

const getSearchEmbeddingFromDataCache = unstable_cache(
  async (searchQuery: string) => embedSearchQuery(searchQuery),
  ["ap-question-bank-search-embedding"],
  { revalidate: EMBEDDING_TTL_SECONDS },
);

async function parseQueryWithHaiku(
  userQuery: string,
): Promise<ApQuestionBankParsedIntent> {
  const resolved = resolveLanguageModel(HAIKU_MODEL);
  const { text } = await generateText({
    model: resolved.model,
    system: HAIKU_SYSTEM,
    messages: [...HAIKU_EXAMPLES, { role: "user" as const, content: userQuery }],
    maxOutputTokens: 200,
    temperature: resolveModelTemperature(resolved.modelId, 0),
  });

  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned =
      firstNewline !== -1 ? cleaned.slice(firstNewline + 1) : cleaned.slice(3);
    const lastFence = cleaned.lastIndexOf("```");
    if (lastFence !== -1) {
      cleaned = cleaned.slice(0, lastFence).trim();
    }
  }

  return JSON.parse(cleaned) as ApQuestionBankParsedIntent;
}

async function getParsedIntent(userQuery: string) {
  const cacheKey = buildParsedIntentCacheKey(userQuery);
  return withCache(
    parsedIntentCache,
    parsedIntentInflight,
    cacheKey,
    PARSED_INTENT_TTL_MS,
    () => getParsedIntentFromDataCache(userQuery),
  );
}

async function embedSearchQuery(text: string) {
  if (!text.trim()) {
    throw new Error("Search query cannot be empty");
  }

  const result = await callGoogleEmbeddings({
    model: DEFAULT_GOOGLE_EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSION,
    taskType: "RETRIEVAL_QUERY",
  });

  const embedding = result.embeddings[0];
  if (!embedding || embedding.length === 0) {
    throw new Error("Embedding provider returned an empty vector");
  }

  return embedding;
}

async function getSearchEmbedding(searchQuery: string) {
  const cacheKey = buildEmbeddingCacheKey(searchQuery);
  return withCache(
    searchEmbeddingCache,
    searchEmbeddingInflight,
    cacheKey,
    EMBEDDING_TTL_MS,
    () => getSearchEmbeddingFromDataCache(searchQuery),
  );
}

function looksDiagnosticQuery(query: string) {
  return /搞混|误解|易错|错题|mistake|misconception|confus(?:e|ion|ed)|mix(?:ed)?\s+up|wrong answer/i.test(
    query,
  );
}

function isEmbeddingReadyKeywordQuery(query: string) {
  const normalized = cleanText(query);
  if (!normalized) return false;
  if (/[\u3400-\u9fff]/u.test(normalized)) return false;
  if (normalized.length > 120) return false;
  if (/[.!?;:]/.test(normalized)) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 12) return false;
  return tokens.every((token) => /^[a-z0-9][a-z0-9'&+/#().-]*$/i.test(token));
}

function buildFastPathIntent(params: {
  query: string;
  manualCourse: string | null;
  manualUnit: number | null;
  manualDifficulty: ApQuestionBankDifficulty | null;
  manualCognitiveTask: string | null;
  manualTopicCode: string | null;
  manualMode: ApQuestionBankSearchMode;
}): ApQuestionBankParsedIntent | null {
  if (!isEmbeddingReadyKeywordQuery(params.query)) {
    return null;
  }

  const hasStrongStructuredScope = Boolean(
    params.manualCourse || params.manualTopicCode || params.manualCognitiveTask,
  );
  if (!hasStrongStructuredScope) {
    return null;
  }

  if (params.manualMode === "auto" && looksDiagnosticQuery(params.query)) {
    return null;
  }

  return {
    search_query: params.query,
    course: params.manualCourse,
    unit: params.manualUnit,
    difficulty: params.manualDifficulty,
    mode: params.manualMode === "diagnostic" ? "diagnostic" : "content",
    reasoning: "查询已是结构化英文关键词，跳过意图解析",
  };
}

async function callSearchQuestionsRpc(
  params: SearchQuestionsRpcParams,
): Promise<ApQuestionBankSearchResultRow[]> {
  const supabase = createApQuestionBankClient();
  const { data, error } = await supabase.rpc("search_questions", params);

  if (error) {
    throw new Error(`Supabase RPC search_questions failed: ${error.message}`);
  }

  return (data ?? []) as ApQuestionBankSearchResultRow[];
}

export async function listApQuestionBankQuestions(params: {
  course?: string | null;
  unit?: number | null;
  difficulty?: string | null;
  cognitiveTask?: string | null;
  q?: string | null;
  page?: number;
  limit?: number;
}): Promise<ApQuestionBankListResponse> {
  const course = cleanText(params.course);
  const q = cleanText(params.q);
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? DEFAULT_PAGE_SIZE));
  const supabase = createApQuestionBankClient();

  let query = supabase
    .from("questions")
    .select(
      `id, course, unit, stem, choices, correct_answer, explanation, difficulty, cognitive_task, topic_code, key_concepts, source_type, source_assessment, question_number, stimulus_id, stimulus_dependent, standalone_usable, requires_calculation, negative_stem, created_at,
      stimulus:stimuli(content_type, description, image_url)`,
      { count: "exact" },
    )
    .eq("status", "active")
    .range((page - 1) * limit, page * limit - 1);

  if (course) {
    query = query.eq("course", course).order("unit").order("question_number");
  } else {
    query = query.order("created_at", { ascending: false });
  }
  if (params.unit != null) query = query.eq("unit", params.unit);
  if (params.difficulty) query = query.eq("difficulty", params.difficulty);
  if (params.cognitiveTask) query = query.eq("cognitive_task", params.cognitiveTask);
  if (q) query = query.ilike("stem", `%${q}%`);

  const { data, count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    items: (data ?? []) as ApQuestionBankListItem[],
    total: count ?? 0,
    page,
    limit,
  };
}

export async function listApQuestionBankMaterials(params: {
  course?: string | null;
  unit?: number | null;
  q?: string | null;
}): Promise<ApQuestionBankMaterialsResponse> {
  const supabase = createApQuestionBankClient();
  const allRows: Array<{
    course: string;
    source_assessment: string;
    unit: number;
  }> = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data: page, error } = await supabase
      .from("questions")
      .select("course, source_assessment, unit")
      .eq("status", "active")
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    allRows.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
    offset += pageSize;
  }

  const materialMap = new Map<string, ApQuestionBankMaterialItem>();

  for (const row of allRows) {
    const key = `${row.course}|${row.source_assessment}`;
    const existing = materialMap.get(key);
    if (existing) {
      materialMap.set(key, {
        ...existing,
        questionCount: existing.questionCount + 1,
      });
      continue;
    }

    materialMap.set(key, {
      course: row.course,
      sourceAssessment: row.source_assessment,
      unit: row.unit,
      questionCount: 1,
    });
  }

  let materials = Array.from(materialMap.values()).sort(
    (a, b) => a.course.localeCompare(b.course) || a.unit - b.unit,
  );

  const course = cleanText(params.course);
  if (course) {
    materials = materials.filter((item) => item.course === course);
  }

  if (params.unit != null) {
    materials = materials.filter((item) => item.unit === params.unit);
  }

  const q = cleanText(params.q).toLowerCase();
  if (q) {
    const keywords = q
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/_/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    materials = materials.filter((item) => {
      const haystack = `${item.course} ${item.sourceAssessment} unit ${item.unit} unit${item.unit}`
        .toLowerCase()
        .replace(/_/g, " ");
      return keywords.every((keyword) => haystack.includes(keyword));
    });
  }

  return {
    items: materials,
    total: materials.length,
  };
}

export async function getApQuestionBankMaterialDetail(params: {
  course: string;
  sourceAssessment: string;
}): Promise<ApQuestionBankMaterialDetailResponse> {
  const supabase = createApQuestionBankClient();
  const { data, error } = await supabase
    .from("questions")
    .select(
      `id, course, unit, stem, choices, correct_answer, explanation, difficulty, cognitive_task, topic_code, key_concepts, source_type, source_assessment, question_number, stimulus_id, stimulus_dependent, standalone_usable, requires_calculation, negative_stem, created_at,
      stimulus:stimuli(content_type, description, image_url)`,
    )
    .eq("status", "active")
    .eq("course", params.course)
    .eq("source_assessment", params.sourceAssessment)
    .order("question_number");

  if (error) {
    throw new Error(error.message);
  }

  const questions = (data ?? []) as ApQuestionBankMaterialDetailQuestion[];
  return {
    material: {
      course: params.course,
      sourceAssessment: params.sourceAssessment,
      questionCount: questions.length,
      unit: questions[0]?.unit ?? null,
    },
    questions,
  };
}

export async function searchApQuestionBank(
  params: ApQuestionBankSearchParams,
): Promise<ApQuestionBankSearchResponse> {
  const query = cleanText(params.query);
  if (!query) {
    throw new Error("Search query cannot be empty");
  }

  const limit = params.limit ?? DEFAULT_LIMIT;
  const page = Math.max(1, params.page ?? 1);
  const manualCourse = cleanText(params.course) || null;
  const manualUnit = params.unit ?? null;
  const manualDifficulty = params.difficulty ?? null;
  const manualCognitiveTask = cleanText(params.cognitive_task) || null;
  const manualTopicCode = cleanText(params.topic_code) || null;
  const manualMode = params.mode ?? "auto";
  const skipCache = params.skip_cache === true;
  const responseCacheKey = skipCache
    ? `nocache:${Date.now()}:${Math.random()}`
    : buildSearchResponseCacheKey({
        query,
        course: manualCourse,
        unit: manualUnit,
        difficulty: manualDifficulty,
        cognitiveTask: manualCognitiveTask,
        topicCode: manualTopicCode,
        mode: manualMode,
        limit,
        page,
      });

  return withCache(
    searchResponseCache,
    searchResponseInflight,
    responseCacheKey,
    skipCache ? 0 : SEARCH_RESPONSE_TTL_MS,
    async () => {
      try {
        const parsed =
          buildFastPathIntent({
            query,
            manualCourse,
            manualUnit,
            manualDifficulty,
            manualCognitiveTask,
            manualTopicCode,
            manualMode,
          }) ?? (await getParsedIntent(query));

        const searchQuery = cleanText(parsed.search_query) || query;
        const rawCourse = manualCourse ?? parsed.course;
        const course = rawCourse && (VALID_COURSE_CODES as readonly string[]).includes(rawCourse)
          ? rawCourse
          : null;
        const unit = manualUnit ?? parsed.unit;
        const difficulty = manualDifficulty ?? parsed.difficulty;
        const mode =
          manualMode !== "auto" ? manualMode : parsed.mode ?? "content";

        const queryVec = await getSearchEmbedding(searchQuery);
        const results = await callSearchQuestionsRpc({
          query_embedding: queryVec,
          search_mode: mode,
          filter_course: course,
          filter_unit: unit,
          filter_difficulty: difficulty,
          filter_cognitive_task: manualCognitiveTask,
          filter_topic: manualTopicCode,
          match_count: limit === 0 ? 2000 : limit,
        });

        return {
          data: results,
          count: results.length,
          total: results.length,
          parsed: {
            search_query: searchQuery,
            course,
            unit,
            difficulty,
            mode,
            reasoning: parsed.reasoning ?? "",
          },
        };
      } catch (error) {
        console.warn("[question-bank/ap/search] AI search failed, falling back to DB query:", error);

        const supabase = createApQuestionBankClient();
        const fetchAll = limit === 0;

        function buildFallbackQuery(withCount: boolean) {
          let q = supabase
            .from("questions")
            .select(
              `id, course, unit, stem, choices, correct_answer, explanation, difficulty, cognitive_task, topic_code, key_concepts, source_assessment, question_number,
              stimulus:stimuli(content_type, description, image_url)`,
              withCount ? { count: "exact" } : undefined,
            )
            .eq("status", "active")
            .order("course")
            .order("unit")
            .order("question_number");

          if (manualCourse) q = q.eq("course", manualCourse);
          if (manualUnit != null) q = q.eq("unit", manualUnit);
          if (manualDifficulty) q = q.eq("difficulty", manualDifficulty);
          if (manualCognitiveTask) q = q.eq("cognitive_task", manualCognitiveTask);
          if (query) q = q.ilike("stem", `%${query}%`);
          return q;
        }

        let allData: FallbackQuestionRow[] = [];
        let totalCount: number | null = null;

        if (fetchAll) {
          const batchSize = 1000;
          let offset = 0;
          let firstBatch = true;
          while (true) {
            const q = buildFallbackQuery(firstBatch)
              .range(offset, offset + batchSize - 1);
            const { data: batch, count, error: batchError } = await q;
            if (batchError) throw new Error(batchError.message);
            if (firstBatch) {
              totalCount = count;
              firstBatch = false;
            }
            allData.push(...((batch ?? []) as FallbackQuestionRow[]));
            if (!batch || batch.length < batchSize) break;
            offset += batchSize;
          }
        } else {
          const rangeStart = (page - 1) * limit;
          const rangeEnd = rangeStart + limit - 1;
          const q = buildFallbackQuery(true).range(rangeStart, rangeEnd);
          const { data, count, error: fallbackError } = await q;
          if (fallbackError) throw new Error(fallbackError.message);
          allData = (data ?? []) as FallbackQuestionRow[];
          totalCount = count;
        }

        const fallbackRows = allData.map(mapFallbackQuestionRowToSearchResult);

        return {
          data: fallbackRows,
          count: fallbackRows.length,
          total: totalCount ?? fallbackRows.length,
          parsed: {
            search_query: query,
            course: manualCourse,
            unit: manualUnit,
            difficulty: manualDifficulty,
            mode: "content",
            reasoning: "AI 不可用，改用数据库关键词搜索",
          },
        };
      }
    },
  );
}

export function toApQuestionBankSearchRow(
  item: ApQuestionBankListItem | ApQuestionBankMaterialDetailQuestion,
) {
  return mapListItemToSearchRow(item);
}
