import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PblLogRecord,
  PblMaterial,
  PblPlan,
  PblPlanStatus,
  WebSearchResult,
} from "@/lib/pbl/types";
import {
  extractDrivingQuestionFromMarkdown,
  extractTitleFromMarkdown,
  summarizeMarkdownPlain,
} from "@/lib/pbl/plan-markdown";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

type LooseDbError = {
  message?: string;
};

type LooseDbResponse<T> = Promise<{
  data: T | null;
  error: LooseDbError | null;
}>;

type LooseRow = Record<string, unknown>;

type LooseSelectBuilder = {
  eq: (column: string, value: unknown) => LooseSelectBuilder;
  order: (column: string, options?: { ascending?: boolean }) => LooseSelectBuilder;
  range: (
    from: number,
    to: number,
  ) => Promise<{ data: LooseRow[] | null; error: LooseDbError | null; count?: number | null }>;
  maybeSingle: () => LooseDbResponse<LooseRow>;
};

type LooseMutationBuilder = {
  eq: (column: string, value: unknown) => LooseMutationBuilder;
} & PromiseLike<{
  data: LooseRow | LooseRow[] | null;
  error: LooseDbError | null;
}>;

type LooseTableClient = {
  insert: (payload: unknown) => LooseDbResponse<unknown>;
  upsert: (payload: unknown) => LooseDbResponse<unknown>;
  update: (payload: unknown) => LooseMutationBuilder;
  delete: () => LooseMutationBuilder;
  select: (columns?: string, options?: { count?: "exact" }) => LooseSelectBuilder;
};

type LooseSupabase = {
  from: (table: string) => LooseTableClient;
};

function asLooseSupabase(client: AppSupabase): LooseSupabase {
  return client as unknown as LooseSupabase;
}

export type PblStoreClient = {
  teacherId: string;
  supabase: AppSupabase | null;
  isMock: boolean;
};

export type PblProjectListOptions = {
  status?: "active" | PblPlanStatus | "all";
  query?: string;
  limit?: number;
  offset?: number;
};

export type PblProjectListResult = {
  items: PblPlan[];
  total: number;
};

type PblProjectPatch = Partial<Pick<PblPlan, "status" | "title" | "markdownContent" | "drivingQuestion">>;

function nowIso() {
  return new Date().toISOString();
}

function getStore() {
  if (!globalThis.__pblMockStore) {
    globalThis.__pblMockStore = {
      plans: new Map<string, PblPlan>(),
      privateMaterials: new Map<string, PblMaterial[]>(),
      logs: [] as PblLogRecord[],
    };
  }
  return globalThis.__pblMockStore;
}

function getDb(client: PblStoreClient): LooseSupabase | null {
  if (client.isMock || !client.supabase) return null;
  return asLooseSupabase(client.supabase);
}

function requireDb(client: PblStoreClient): LooseSupabase {
  const db = getDb(client);
  if (!db) {
    throw new Error("PBL 数据库上下文不可用");
  }
  return db;
}

function normalizeStatus(status: PblProjectListOptions["status"]): PblProjectListOptions["status"] {
  if (!status) return "active";
  if (status === "active" || status === "all") return status;
  if (status === "draft" || status === "confirmed" || status === "archived") return status;
  return "active";
}

function matchesStatus(plan: PblPlan, status: PblProjectListOptions["status"]) {
  if (!status || status === "all") return true;
  if (status === "active") return plan.status === "draft" || plan.status === "confirmed";
  return plan.status === status;
}

function matchesQuery(plan: PblPlan, query: string | undefined) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [
    plan.title,
    plan.originalPrompt,
    plan.drivingQuestion,
    plan.primarySubject,
    plan.grade,
    plan.curriculumSystem,
    plan.overviewText,
    plan.markdownContent.slice(0, 1200),
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(q);
}

function readPayload<T>(row: LooseRow | null): T | null {
  if (!row) return null;
  const payload = row.payload;
  if (!payload) return null;

  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as T;
    } catch {
      return null;
    }
  }

  if (typeof payload === "object") {
    return payload as T;
  }

  return null;
}

function toStringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildMaterialReferences(searchResults: WebSearchResult[]) {
  return searchResults.slice(0, 8).map((item, index) => ({
    materialId: `WEB-${index + 1}`,
    title: item.title,
    referenceType: index === 0 ? "driving_question" : "background_info",
  })) as PblPlan["materialReferences"];
}

function buildLegacyMarkdown(raw: Record<string, unknown>) {
  const title = toStringOrEmpty(raw.title) || "旧版项目";
  const overview = toStringOrEmpty(raw.overviewText);
  const drivingQuestion = toStringOrEmpty(raw.drivingQuestion);

  let markdown = `# ${title}\n\n`;
  if (drivingQuestion) {
    markdown += `**驱动问题**：${drivingQuestion}\n\n`;
  }
  if (overview) {
    markdown += `## 项目概述\n\n${overview}\n\n`;
  }
  markdown += "> 此项目使用旧版格式创建，建议重新生成以获得新的文档式方案。\n";
  return markdown;
}

function ensurePlanCompatibility(raw: Record<string, unknown>, row?: LooseRow | null): PblPlan {
  const markdownContent =
    typeof raw.markdownContent === "string" && raw.markdownContent.trim()
      ? raw.markdownContent
      : buildLegacyMarkdown(raw);
  const inferredParamsRaw =
    raw.inferredParams && typeof raw.inferredParams === "object"
      ? (raw.inferredParams as Record<string, unknown>)
      : {};
  const searchResults = Array.isArray(raw.searchResults)
    ? (raw.searchResults as WebSearchResult[])
    : [];
  const totalPeriods = toNumberOrZero(raw.totalPeriods) || toNumberOrZero(inferredParamsRaw.totalPeriods) || 12;
  const difficulty =
    (toStringOrEmpty(raw.difficulty) as PblPlan["difficulty"]) ||
    (toStringOrEmpty(inferredParamsRaw.difficulty) as PblPlan["difficulty"]) ||
    "advanced";
  const title = toStringOrEmpty(raw.title) || extractTitleFromMarkdown(markdownContent, "未命名 PBL 项目");
  const drivingQuestion = extractDrivingQuestionFromMarkdown(markdownContent, toStringOrEmpty(raw.drivingQuestion));
  const primarySubject =
    toStringOrEmpty(raw.primarySubject) ||
    toStringOrEmpty(inferredParamsRaw.primarySubject) ||
    toStringOrEmpty(row?.primary_subject) ||
    "未知学科";
  const curriculumSystem =
    (toStringOrEmpty(raw.curriculumSystem || inferredParamsRaw.curriculumSystem || row?.curriculum_system) as PblPlan["curriculumSystem"]) ||
    "CN";
  const grade =
    toStringOrEmpty(raw.grade) ||
    toStringOrEmpty(inferredParamsRaw.grade) ||
    toStringOrEmpty(row?.grade) ||
    "未知";
  const overviewText = toStringOrEmpty(raw.overviewText) || summarizeMarkdownPlain(markdownContent);
  const status = (toStringOrEmpty(raw.status) as PblPlan["status"]) || "draft";
  const version = toNumberOrZero(raw.version) || 1;
  const createdAt = toStringOrEmpty(raw.createdAt) || toStringOrEmpty(row?.created_at) || nowIso();
  const updatedAt = toStringOrEmpty(raw.updatedAt) || toStringOrEmpty(row?.updated_at) || createdAt;
  const inferredParams = {
    curriculumSystem,
    primarySubject,
    grade,
    totalPeriods,
    difficulty,
    topic: toStringOrEmpty(inferredParamsRaw.topic) || title,
    knowledgePoints: Array.isArray(inferredParamsRaw.knowledgePoints)
      ? inferredParamsRaw.knowledgePoints.filter((item): item is string => typeof item === "string")
      : [],
  };

  return {
    id: toStringOrEmpty(raw.id) || toStringOrEmpty(row?.id) || randomUUID(),
    title,
    originalPrompt:
      toStringOrEmpty(raw.originalPrompt) ||
      toStringOrEmpty(row?.original_prompt),
    inferredParams,
    markdownContent,
    drivingQuestion,
    primarySubject,
    curriculumSystem,
    grade,
    searchResults,
    chatHistory: Array.isArray(raw.chatHistory) ? (raw.chatHistory as PblPlan["chatHistory"]) : [],
    status,
    version,
    createdAt,
    updatedAt,
    requestId: raw.requestId == null ? null : toStringOrEmpty(raw.requestId),
    overviewOption:
      raw.overviewOption === "A" || raw.overviewOption === "B" || raw.overviewOption === "C"
        ? raw.overviewOption
        : null,
    overviewText,
    totalPeriods,
    difficulty,
    crossSubjects: Array.isArray(raw.crossSubjects)
      ? raw.crossSubjects.filter((item): item is string => typeof item === "string")
      : [],
    suggestedGroupSize: toNumberOrZero(raw.suggestedGroupSize) || 4,
    suggestedGroupCount: toNumberOrZero(raw.suggestedGroupCount) || 8,
    finalOutcomeForm: toStringOrEmpty(raw.finalOutcomeForm) || "项目成果文档 + 展示答辩",
    finalOutcomeRequirements: toStringOrEmpty(raw.finalOutcomeRequirements),
    projectBrief:
      raw.projectBrief && typeof raw.projectBrief === "object"
        ? (raw.projectBrief as PblPlan["projectBrief"])
        : {
            realWorldContext: overviewText,
            coreChallenge: drivingQuestion,
            researchBoundary: "围绕驱动问题界定研究对象、证据边界和任务范围。",
            stakeholders: ["学生", "教师", "真实情境相关方"],
            successCriteria: ["能回应驱动问题", "证据链完整", "成果可展示"],
            recommendedEvidence: ["真实案例", "课程标准", "过程记录"],
          },
    targetAudience: toStringOrEmpty(raw.targetAudience) || grade,
    presentationFormat: toStringOrEmpty(raw.presentationFormat) || "课堂展示 / 答辩",
    stages: Array.isArray(raw.stages) ? (raw.stages as PblPlan["stages"]) : [],
    curriculumAlignment: Array.isArray(raw.curriculumAlignment)
      ? (raw.curriculumAlignment as PblPlan["curriculumAlignment"])
      : [],
    rubric: Array.isArray(raw.rubric) ? (raw.rubric as PblPlan["rubric"]) : [],
    assessments: Array.isArray(raw.assessments) ? (raw.assessments as PblPlan["assessments"]) : [],
    materialReferences: Array.isArray(raw.materialReferences)
      ? (raw.materialReferences as PblPlan["materialReferences"])
      : buildMaterialReferences(searchResults),
    teacherGuidance:
      raw.teacherGuidance && typeof raw.teacherGuidance === "object"
        ? (raw.teacherGuidance as PblPlan["teacherGuidance"])
        : {
            commonDifficulties: [],
            differentiation: [],
            timeManagement: [],
            crossDisciplineCollab: [],
          },
    studentVersionMarkdown: toStringOrEmpty(raw.studentVersionMarkdown) || markdownContent,
    qualityCheck: Array.isArray(raw.qualityCheck) ? (raw.qualityCheck as PblPlan["qualityCheck"]) : [],
  };
}

function toPblLogRecord(row: LooseRow): PblLogRecord {
  return {
    id: toStringOrEmpty(row.id) || randomUUID(),
    requestId: toStringOrEmpty(row.request_id) || null,
    planId: toStringOrEmpty(row.plan_id) || null,
    step: (toStringOrEmpty(row.step) as PblLogRecord["step"]) || "generate",
    status: (toStringOrEmpty(row.status) as PblLogRecord["status"]) || "success",
    modelUsed: toStringOrEmpty(row.model_used),
    durationMs: toNumberOrZero(row.duration_ms),
    message: toStringOrEmpty(row.message) || undefined,
    createdAt: toStringOrEmpty(row.created_at) || nowIso(),
  };
}

export async function saveProjectPlan(client: PblStoreClient, plan: PblPlan): Promise<PblPlan> {
  const normalizedPlan = ensurePlanCompatibility(plan as unknown as Record<string, unknown>);

  if (client.isMock) {
    const store = getStore();
    store.plans.set(normalizedPlan.id, normalizedPlan);
    return normalizedPlan;
  }

  const db = requireDb(client);
  const result = await db.from("pbl_project_plans").upsert({
    id: normalizedPlan.id,
    request_id: null,
    teacher_id: client.teacherId,
    title: normalizedPlan.title,
    status: normalizedPlan.status,
    version: normalizedPlan.version,
    payload: normalizedPlan,
    original_prompt: normalizedPlan.originalPrompt || null,
    primary_subject: normalizedPlan.primarySubject,
    grade: normalizedPlan.grade,
    curriculum_system: normalizedPlan.curriculumSystem,
    created_at: normalizedPlan.createdAt,
    updated_at: normalizedPlan.updatedAt,
  });

  if (result.error) {
    throw new Error(`保存 PBL 项目失败：${result.error.message ?? "未知错误"}`);
  }

  const store = getStore();
  store.plans.set(normalizedPlan.id, normalizedPlan);
  return normalizedPlan;
}

export async function replaceProjectPlan(
  client: PblStoreClient,
  planId: string,
  plan: PblPlan,
): Promise<PblPlan | null> {
  const saved = await saveProjectPlan(client, {
    ...plan,
    id: planId,
    updatedAt: nowIso(),
  });
  return saved;
}

export async function getProjectPlan(
  client: PblStoreClient,
  planId: string,
): Promise<PblPlan | null> {
  if (client.isMock) {
    const store = getStore();
    return store.plans.get(planId) ?? null;
  }

  const db = requireDb(client);
  const { data, error } = await db
    .from("pbl_project_plans")
    .select("id,title,status,version,payload,created_at,updated_at,original_prompt,primary_subject,grade,curriculum_system")
    .eq("teacher_id", client.teacherId)
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    throw new Error(`读取 PBL 项目失败：${error.message ?? "未知错误"}`);
  }

  if (!data) return null;

  const payload = readPayload<Record<string, unknown>>(data) ?? {};
  const plan = ensurePlanCompatibility({ ...payload, id: payload.id ?? data.id }, data);
  const store = getStore();
  store.plans.set(plan.id, plan);
  return plan;
}

export async function listProjectPlans(
  client: PblStoreClient,
  options: PblProjectListOptions = {},
): Promise<PblProjectListResult> {
  const status = normalizeStatus(options.status);
  const limit = Math.max(1, Math.min(options.limit ?? 20, 200));
  const offset = Math.max(0, options.offset ?? 0);

  if (client.isMock) {
    const store = getStore();
    const plans = [...store.plans.values()]
      .filter((item) => matchesStatus(item, status))
      .filter((item) => matchesQuery(item, options.query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      items: plans.slice(offset, offset + limit),
      total: plans.length,
    };
  }

  const db = requireDb(client);
  const { data, error } = await db
    .from("pbl_project_plans")
    .select(
      "id,title,status,version,payload,created_at,updated_at,original_prompt,primary_subject,grade,curriculum_system",
      { count: "exact" },
    )
    .eq("teacher_id", client.teacherId)
    .order("updated_at", { ascending: false })
    .range(0, 499);

  if (error) {
    throw new Error(`读取 PBL 项目列表失败：${error.message ?? "未知错误"}`);
  }

  const plans = (data ?? [])
    .map((row) => ensurePlanCompatibility(readPayload<Record<string, unknown>>(row) ?? { id: row.id }, row))
    .filter((item) => matchesStatus(item, status))
    .filter((item) => matchesQuery(item, options.query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const store = getStore();
  for (const plan of plans) {
    store.plans.set(plan.id, plan);
  }

  return {
    items: plans.slice(offset, offset + limit),
    total: plans.length,
  };
}

export async function updateProjectPlan(
  client: PblStoreClient,
  planId: string,
  patch: PblProjectPatch,
): Promise<PblPlan | null> {
  const current = await getProjectPlan(client, planId);
  if (!current) return null;

  const nextMarkdownContent = patch.markdownContent ?? current.markdownContent;
  const next: PblPlan = {
    ...current,
    status: patch.status ?? current.status,
    title: patch.title ?? current.title,
    markdownContent: nextMarkdownContent,
    drivingQuestion: patch.drivingQuestion ?? current.drivingQuestion,
    overviewText: patch.markdownContent ? summarizeMarkdownPlain(nextMarkdownContent) : current.overviewText,
    studentVersionMarkdown: patch.markdownContent ? nextMarkdownContent : current.studentVersionMarkdown,
    updatedAt: nowIso(),
  };

  return replaceProjectPlan(client, planId, next);
}

export async function deleteProjectPlan(client: PblStoreClient, planId: string): Promise<boolean> {
  if (client.isMock) {
    const store = getStore();
    return store.plans.delete(planId);
  }

  const db = requireDb(client);
  const result = await db
    .from("pbl_project_plans")
    .delete()
    .eq("teacher_id", client.teacherId)
    .eq("id", planId);

  if (result.error) {
    throw new Error(`删除 PBL 项目失败：${result.error.message ?? "未知错误"}`);
  }

  const store = getStore();
  store.plans.delete(planId);
  return true;
}

export async function addPrivateMaterial(
  client: PblStoreClient,
  input: Omit<PblMaterial, "visibility" | "ownerId">,
): Promise<PblMaterial> {
  const entry: PblMaterial = {
    ...input,
    visibility: "private",
    ownerId: client.teacherId,
  };

  if (client.isMock) {
    const store = getStore();
    const list = store.privateMaterials.get(client.teacherId) ?? [];
    list.unshift(entry);
    store.privateMaterials.set(client.teacherId, list);
    return entry;
  }

  const db = requireDb(client);
  const result = await db.from("pbl_materials").insert({
    display_code: entry.id,
    title: entry.title,
    type: entry.type,
    source: entry.source,
    year: entry.year,
    url: entry.link,
    visibility: "private",
    owner_id: client.teacherId,
    quality_score: null,
    original_content: entry.originalContent ?? null,
    driving_question: null,
    downgrade_suggestion: null,
    difficulty: null,
  });

  if (result.error) {
    throw new Error(`保存 PBL 私有素材失败：${result.error.message ?? "未知错误"}`);
  }

  const store = getStore();
  const list = store.privateMaterials.get(client.teacherId) ?? [];
  list.unshift(entry);
  store.privateMaterials.set(client.teacherId, list);
  return entry;
}

export async function listPrivateMaterials(client: PblStoreClient): Promise<PblMaterial[]> {
  if (client.isMock) {
    const store = getStore();
    return store.privateMaterials.get(client.teacherId) ?? [];
  }

  const db = requireDb(client);
  const { data, error } = await db
    .from("pbl_materials")
    .select("display_code,title,type,source,year,url,original_content,owner_id")
    .eq("owner_id", client.teacherId)
    .order("created_at", { ascending: false })
    .range(0, 500);

  if (error || !data) {
    throw new Error(`读取 PBL 私有素材失败：${error?.message ?? "未知错误"}`);
  }

  const materials: PblMaterial[] = data.map((row) => ({
    id: toStringOrEmpty(row.display_code) || randomUUID(),
    title: toStringOrEmpty(row.title),
    type: (toStringOrEmpty(row.type) as PblMaterial["type"]) || "driving_question",
    source: toStringOrEmpty(row.source),
    year: toNumberOrZero(row.year),
    curriculumScope: "GENERIC",
    tags: [],
    link: toStringOrEmpty(row.url),
    originalContent: toStringOrEmpty(row.original_content) || undefined,
    visibility: "private",
    ownerId: toStringOrEmpty(row.owner_id) || client.teacherId,
  }));

  const store = getStore();
  store.privateMaterials.set(client.teacherId, materials);
  return materials;
}

export async function appendGenerationLog(
  client: PblStoreClient,
  input: Omit<PblLogRecord, "id" | "createdAt">,
): Promise<PblLogRecord> {
  const log: PblLogRecord = {
    ...input,
    id: randomUUID(),
    createdAt: nowIso(),
  };

  if (client.isMock) {
    const store = getStore();
    store.logs.unshift(log);
    return log;
  }

  const db = requireDb(client);
  const result = await db.from("pbl_generation_logs").insert({
    id: log.id,
    request_id: log.requestId ?? null,
    plan_id: log.planId ?? null,
    teacher_id: client.teacherId,
    step: log.step,
    status: log.status,
    model_used: log.modelUsed,
    duration_ms: log.durationMs,
    message: log.message ?? null,
    created_at: log.createdAt,
  });

  if (result.error) {
    throw new Error(`写入 PBL 生成日志失败：${result.error.message ?? "未知错误"}`);
  }

  const store = getStore();
  store.logs.unshift(log);
  return log;
}

export async function listGenerationLogs(client: PblStoreClient, limit = 50): Promise<PblLogRecord[]> {
  const normalizedLimit = Math.max(1, Math.min(limit, 200));

  if (client.isMock) {
    const store = getStore();
    return store.logs.slice(0, normalizedLimit);
  }

  const db = requireDb(client);
  const { data, error } = await db
    .from("pbl_generation_logs")
    .select("id,request_id,plan_id,step,status,model_used,duration_ms,message,created_at")
    .eq("teacher_id", client.teacherId)
    .order("created_at", { ascending: false })
    .range(0, normalizedLimit - 1);

  if (error) {
    throw new Error(`读取 PBL 生成日志失败：${error.message ?? "未知错误"}`);
  }

  const logs = (data ?? []).map((row) => toPblLogRecord(row));
  const store = getStore();
  store.logs = logs;
  return logs;
}

declare global {
  var __pblMockStore:
    | {
        plans: Map<string, PblPlan>;
        privateMaterials: Map<string, PblMaterial[]>;
        logs: PblLogRecord[];
      }
    | undefined;
}
