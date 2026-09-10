import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LESSON_PLAN_PREFERENCES } from "@/lib/lesson-plan/defaults";
import type {
  CedObjective,
  LessonPlanDocument,
  LessonPlanListOptions,
  LessonPlanListResult,
  LessonPlanPreferences,
  LessonPlanSection,
  PublicLessonPlanSummary,
} from "@/lib/lesson-plan/types";
import type { Database, Json } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

type StoreClient = {
  teacherId: string;
  supabase: AppSupabase | null;
  isMock: boolean;
};

const TEACHER_LESSON_PREFERENCES_SELECT = [
  "teacher_id",
  "duration_minutes",
  "student_level",
  "language_pref",
  "template_kind",
  "quiz_density",
  "explanation_depth",
  "include_extension",
  "show_ced_codes",
  "include_teacher_notes",
  "created_at",
  "updated_at",
].join(",");

const LESSON_PLAN_SELECT = [
  "id",
  "teacher_id",
  "title",
  "source_prompt",
  "subject_label",
  "course_id",
  "unit_id",
  "topic_ids",
  "learning_objective_codes",
  "essential_knowledge",
  "template_kind",
  "duration_minutes",
  "student_level",
  "language_pref",
  "quiz_density",
  "explanation_depth",
  "include_extension",
  "show_ced_codes",
  "include_teacher_notes",
  "status",
  "published_slug",
  "published_at",
  "pdf_path",
  "pdf_generated_at",
  "first_section_summary",
  "created_at",
  "updated_at",
].join(",");

const LESSON_PLAN_SECTION_SELECT = [
  "id",
  "lesson_plan_id",
  "title",
  "summary",
  "duration_minutes",
  "sort_order",
  "created_at",
  "updated_at",
].join(",");

const LESSON_PLAN_BLOCK_SELECT = [
  "id",
  "lesson_plan_id",
  "section_id",
  "block_type",
  "block_subtype",
  "sort_order",
  "content",
  "ced_codes",
  "teacher_note",
  "created_at",
  "updated_at",
].join(",");

function toDbPreferences(preferences: LessonPlanPreferences) {
  return {
    duration_minutes: preferences.durationMinutes,
    student_level: preferences.studentLevel,
    language_pref: preferences.languagePref,
    template_kind: preferences.templateKind,
    quiz_density: preferences.quizDensity,
    explanation_depth: preferences.explanationDepth,
    include_extension: preferences.includeExtension,
    show_ced_codes: preferences.showCedCodes,
    include_teacher_notes: preferences.includeTeacherNotes,
  };
}

function fromDbPreferences(row: Database["public"]["Tables"]["teacher_lesson_preferences"]["Row"]): LessonPlanPreferences {
  return {
    durationMinutes: row.duration_minutes,
    studentLevel: row.student_level as LessonPlanPreferences["studentLevel"],
    languagePref: row.language_pref as LessonPlanPreferences["languagePref"],
    templateKind: row.template_kind as LessonPlanPreferences["templateKind"],
    quizDensity: row.quiz_density as LessonPlanPreferences["quizDensity"],
    explanationDepth: row.explanation_depth as LessonPlanPreferences["explanationDepth"],
    includeExtension: row.include_extension,
    showCedCodes: row.show_ced_codes,
    includeTeacherNotes: row.include_teacher_notes,
  };
}

function generateSlug() {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

function mapPlanDocument(params: {
  plan: Database["public"]["Tables"]["lesson_plans"]["Row"];
  sections: Database["public"]["Tables"]["lesson_plan_sections"]["Row"][];
  blocks: Database["public"]["Tables"]["lesson_plan_blocks"]["Row"][];
}): LessonPlanDocument {
  const blocksBySection = new Map<string, Database["public"]["Tables"]["lesson_plan_blocks"]["Row"][]>();
  params.blocks.forEach((block) => {
    const list = blocksBySection.get(block.section_id) ?? [];
    list.push(block);
    blocksBySection.set(block.section_id, list);
  });

  const sectionModels: LessonPlanSection[] = params.sections
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary ?? "",
      durationMinutes: section.duration_minutes ?? 0,
      sortOrder: section.sort_order,
      blocks: (blocksBySection.get(section.id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((block) => ({
          id: block.id,
          type: block.block_type as LessonPlanSection["blocks"][number]["type"],
          subtype:
            (block.block_subtype as LessonPlanSection["blocks"][number]["subtype"]) ??
            undefined,
          sortOrder: block.sort_order,
          content:
            block.content && typeof block.content === "object" && !Array.isArray(block.content)
              ? (block.content as Record<string, unknown>)
              : {},
          cedCodes: block.ced_codes ?? [],
          teacherNote: block.teacher_note,
        })),
    }));

  return {
    id: params.plan.id,
    title: params.plan.title,
    sourcePrompt: params.plan.source_prompt,
    subjectLabel: params.plan.subject_label,
    courseId: params.plan.course_id,
    unitId: params.plan.unit_id,
    topicIds: params.plan.topic_ids ?? [],
    learningObjectiveCodes: params.plan.learning_objective_codes ?? [],
    essentialKnowledge: (params.plan.essential_knowledge as CedObjective[]) ?? [],
    preferences: {
      durationMinutes: params.plan.duration_minutes,
      studentLevel: params.plan.student_level as LessonPlanPreferences["studentLevel"],
      languagePref: params.plan.language_pref as LessonPlanPreferences["languagePref"],
      templateKind: params.plan.template_kind as LessonPlanPreferences["templateKind"],
      quizDensity: params.plan.quiz_density as LessonPlanPreferences["quizDensity"],
      explanationDepth: params.plan.explanation_depth as LessonPlanPreferences["explanationDepth"],
      includeExtension: params.plan.include_extension,
      showCedCodes: params.plan.show_ced_codes,
      includeTeacherNotes: params.plan.include_teacher_notes,
    },
    status: params.plan.status as LessonPlanDocument["status"],
    publishedSlug: params.plan.published_slug,
    publishedAt: params.plan.published_at,
    createdAt: params.plan.created_at,
    updatedAt: params.plan.updated_at,
    sections: sectionModels,
  };
}

function getMockStore() {
  if (!globalThis.__lessonPlanMockStore) {
    globalThis.__lessonPlanMockStore = {
      preferences: new Map<string, LessonPlanPreferences>(),
      plans: new Map<string, LessonPlanDocument>(),
    };
  }
  return globalThis.__lessonPlanMockStore;
}

function shouldUseMockStore(client: Pick<StoreClient, "isMock" | "supabase">) {
  if (client.isMock) return true;
  if (!client.supabase) {
    throw new Error("Lesson Plan 存储未配置 Supabase 客户端");
  }
  return false;
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

function extractSearchableTextFromJson(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractSearchableTextFromJson(item));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      extractSearchableTextFromJson(item),
    );
  }
  return [];
}

function matchesStatus(
  status: PublicLessonPlanSummary["status"],
  filter: NonNullable<LessonPlanListOptions["status"]>,
) {
  if (filter === "all") return true;
  if (filter === "active") return status === "draft" || status === "published";
  return status === filter;
}

function sortSummaries(
  items: PublicLessonPlanSummary[],
  sort: NonNullable<LessonPlanListOptions["sort"]>,
) {
  const next = [...items];
  next.sort((a, b) => {
    if (sort === "title_asc") return a.title.localeCompare(b.title, "zh-CN");
    if (sort === "title_desc") return b.title.localeCompare(a.title, "zh-CN");
    if (sort === "created_desc") return a.createdAt < b.createdAt ? 1 : -1;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
  return next;
}

export async function getTeacherPreferences(client: StoreClient) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    return mock.preferences.get(client.teacherId) ?? DEFAULT_LESSON_PLAN_PREFERENCES;
  }

  const { data, error } = await client.supabase!
    .from("teacher_lesson_preferences")
    .select(TEACHER_LESSON_PREFERENCES_SELECT)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取教师偏好失败");
  }

  if (!data) {
    return DEFAULT_LESSON_PLAN_PREFERENCES;
  }

  return fromDbPreferences(
    data as unknown as Database["public"]["Tables"]["teacher_lesson_preferences"]["Row"],
  );
}

export async function upsertTeacherPreferences(
  client: StoreClient,
  preferences: LessonPlanPreferences,
) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    mock.preferences.set(client.teacherId, preferences);
    return preferences;
  }

  const payload = {
    teacher_id: client.teacherId,
    ...toDbPreferences(preferences),
  };

  const { data, error } = await client.supabase!
    .from("teacher_lesson_preferences")
    .upsert(payload, { onConflict: "teacher_id", ignoreDuplicates: false })
    .select(TEACHER_LESSON_PREFERENCES_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw new Error("保存教师偏好失败");
  }

  return fromDbPreferences(
    data as unknown as Database["public"]["Tables"]["teacher_lesson_preferences"]["Row"],
  );
}

export async function queryLessonPlans(
  client: StoreClient,
  options: LessonPlanListOptions = {},
): Promise<LessonPlanListResult> {
  const statusFilter = options.status ?? "active";
  const sort = options.sort ?? "updated_desc";
  const queryTerm = options.query ? normalizeSearchTerm(options.query) : "";

  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const allItems = Array.from(mock.plans.values())
      .filter((item) => {
        if (!item.id) return false;
        if (!matchesStatus(item.status, statusFilter)) return false;
        if (options.courseId && item.courseId !== options.courseId) return false;
        if (!queryTerm) return true;

        const sectionText = item.sections
          .flatMap((section) => [
            section.title,
            section.summary,
            ...section.blocks.flatMap((block) => extractSearchableTextFromJson(block.content)),
          ])
          .join(" ")
          .toLowerCase();
        const planText = `${item.title} ${item.subjectLabel} ${sectionText}`.toLowerCase();
        return planText.includes(queryTerm);
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        status: item.status,
        subjectLabel: item.subjectLabel,
        templateKind: item.preferences.templateKind,
        publishedSlug: item.publishedSlug,
      }));

    const sorted = sortSummaries(allItems, sort);
    const total = sorted.length;
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(1, options.limit ?? 20);
    const items = sorted.slice(offset, offset + limit);

    return { items, total };
  }

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .select("id,title,created_at,updated_at,status,subject_label,template_kind,published_slug,course_id")
    .eq("teacher_id", client.teacherId);

  if (error) {
    throw new Error("读取教案列表失败");
  }

  const rows = (data ?? []) as Array<
    Pick<
      Database["public"]["Tables"]["lesson_plans"]["Row"],
      "id" | "title" | "created_at" | "updated_at" | "status" | "subject_label" | "template_kind" | "published_slug" | "course_id"
    >
  >;

  let filteredRows = rows.filter((row) => matchesStatus(row.status as PublicLessonPlanSummary["status"], statusFilter));

  if (options.courseId) {
    filteredRows = filteredRows.filter((row) => row.course_id === options.courseId);
  }

  if (queryTerm) {
    const initialMatchedIds = new Set<string>();
    filteredRows.forEach((row) => {
      const text = `${row.title} ${row.subject_label}`.toLowerCase();
      if (text.includes(queryTerm)) {
        initialMatchedIds.add(row.id);
      }
    });

    const unmatchedIds = filteredRows
      .map((row) => row.id)
      .filter((id) => !initialMatchedIds.has(id));

    if (unmatchedIds.length > 0) {
      const { data: sectionRows, error: sectionError } = await client.supabase!
        .from("lesson_plan_sections")
        .select("lesson_plan_id,title,summary")
        .in("lesson_plan_id", unmatchedIds);

      if (sectionError) {
        throw new Error("读取教案章节搜索索引失败");
      }

      (sectionRows ?? []).forEach((row) => {
        const text = `${row.title ?? ""} ${row.summary ?? ""}`.toLowerCase();
        if (text.includes(queryTerm)) {
          initialMatchedIds.add(row.lesson_plan_id);
        }
      });
    }

    const stillUnmatchedIds = filteredRows
      .map((row) => row.id)
      .filter((id) => !initialMatchedIds.has(id));

    if (stillUnmatchedIds.length > 0) {
      const { data: blockRows, error: blockError } = await client.supabase!
        .from("lesson_plan_blocks")
        .select("lesson_plan_id,content")
        .in("lesson_plan_id", stillUnmatchedIds);

      if (blockError) {
        throw new Error("读取教案内容搜索索引失败");
      }

      (blockRows ?? []).forEach((row) => {
        const blockText = extractSearchableTextFromJson(row.content).join(" ").toLowerCase();
        if (blockText.includes(queryTerm)) {
          initialMatchedIds.add(row.lesson_plan_id);
        }
      });
    }

    filteredRows = filteredRows.filter((row) => initialMatchedIds.has(row.id));
  }

  const summaries = filteredRows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status as PublicLessonPlanSummary["status"],
    subjectLabel: row.subject_label,
    templateKind: row.template_kind as PublicLessonPlanSummary["templateKind"],
    publishedSlug: row.published_slug,
  }));

  const sorted = sortSummaries(summaries, sort);
  const total = sorted.length;
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit ?? 20);
  const items = sorted.slice(offset, offset + limit);

  return { items, total };
}

export async function listLessonPlans(client: StoreClient): Promise<PublicLessonPlanSummary[]> {
  const { items } = await queryLessonPlans(client, {
    status: "active",
    sort: "updated_desc",
    limit: 200,
    offset: 0,
  });
  return items;
}

async function loadPlanRows(client: StoreClient, planId: string) {
  if (!client.supabase) {
    throw new Error("missing supabase client");
  }

  const { data: planData, error: planError } = await client.supabase!
    .from("lesson_plans")
    .select(LESSON_PLAN_SELECT)
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (planError || !planData) {
    return null;
  }
  const plan = planData as unknown as Database["public"]["Tables"]["lesson_plans"]["Row"];

  const { data: sectionData, error: sectionError } = await client.supabase!
    .from("lesson_plan_sections")
    .select(LESSON_PLAN_SECTION_SELECT)
    .eq("lesson_plan_id", planId)
    .order("sort_order", { ascending: true });

  if (sectionError) {
    throw new Error("读取章节失败");
  }

  const { data: blockData, error: blockError } = await client.supabase!
    .from("lesson_plan_blocks")
    .select(LESSON_PLAN_BLOCK_SELECT)
    .eq("lesson_plan_id", planId)
    .order("sort_order", { ascending: true });

  if (blockError) {
    throw new Error("读取内容块失败");
  }

  return {
    plan,
    sections:
      (sectionData ?? []) as unknown as Database["public"]["Tables"]["lesson_plan_sections"]["Row"][],
    blocks:
      (blockData ?? []) as unknown as Database["public"]["Tables"]["lesson_plan_blocks"]["Row"][],
  };
}

type LessonPlanOwnershipMeta = {
  id: string;
  status: LessonPlanDocument["status"];
  title: string;
  publishedSlug: string | null;
};

async function ensureLessonPlanOwned(client: StoreClient, planId: string): Promise<LessonPlanOwnershipMeta> {
  if (!client.supabase) {
    throw new Error("missing supabase client");
  }

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .select("id,status,title,published_slug")
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取教案失败");
  }

  if (!data) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }

  return {
    id: data.id,
    status: data.status as LessonPlanDocument["status"],
    title: data.title,
    publishedSlug: data.published_slug,
  };
}

export async function getLessonPlanById(client: StoreClient, planId: string) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    return mock.plans.get(planId) ?? null;
  }

  const rows = await loadPlanRows(client, planId);
  if (!rows) return null;
  return mapPlanDocument(rows);
}

export async function getPublicLessonPlanBySlug(
  client: Pick<StoreClient, "isMock" | "supabase">,
  slug: string,
) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    return (
      Array.from(mock.plans.values()).find(
        (item) => item.publishedSlug === slug && item.status === "published",
      ) ?? null
    );
  }

  const { data: planData, error: planError } = await client.supabase!
    .from("lesson_plans")
    .select(LESSON_PLAN_SELECT)
    .eq("published_slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (planError || !planData) {
    return null;
  }
  const plan = planData as unknown as Database["public"]["Tables"]["lesson_plans"]["Row"];

  const { data: sectionData } = await client.supabase!
    .from("lesson_plan_sections")
    .select(LESSON_PLAN_SECTION_SELECT)
    .eq("lesson_plan_id", plan.id)
    .order("sort_order", { ascending: true });

  const { data: blockData } = await client.supabase!
    .from("lesson_plan_blocks")
    .select(LESSON_PLAN_BLOCK_SELECT)
    .eq("lesson_plan_id", plan.id)
    .order("sort_order", { ascending: true });

  return mapPlanDocument({
    plan,
    sections:
      (sectionData ?? []) as unknown as Database["public"]["Tables"]["lesson_plan_sections"]["Row"][],
    blocks:
      (blockData ?? []) as unknown as Database["public"]["Tables"]["lesson_plan_blocks"]["Row"][],
  });
}

export async function createLessonPlanShell(client: StoreClient, input: {
  title: string;
  sourcePrompt: string;
  subjectLabel: string;
  courseId: string | null;
  unitId: string | null;
  topicIds: string[];
  learningObjectiveCodes: string[];
  essentialKnowledge: CedObjective[];
  preferences: LessonPlanPreferences;
}) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const now = new Date().toISOString();
    const id = randomUUID();
    const doc: LessonPlanDocument = {
      id,
      title: input.title,
      sourcePrompt: input.sourcePrompt,
      subjectLabel: input.subjectLabel,
      courseId: input.courseId,
      unitId: input.unitId,
      topicIds: input.topicIds,
      learningObjectiveCodes: input.learningObjectiveCodes,
      essentialKnowledge: input.essentialKnowledge,
      preferences: input.preferences,
      status: "draft",
      publishedSlug: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      sections: [],
    };
    mock.plans.set(id, doc);
    return id;
  }

  const payload: Database["public"]["Tables"]["lesson_plans"]["Insert"] = {
    teacher_id: client.teacherId,
    title: input.title,
    source_prompt: input.sourcePrompt,
    subject_label: input.subjectLabel,
    course_id: input.courseId,
    unit_id: input.unitId,
    topic_ids: input.topicIds,
    learning_objective_codes: input.learningObjectiveCodes,
    essential_knowledge: input.essentialKnowledge as unknown as Json,
    ...toDbPreferences(input.preferences),
    status: "draft",
  };

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error("创建教案失败");
  }

  return data.id;
}

export async function appendLessonPlanSection(
  client: StoreClient,
  planId: string,
  section: LessonPlanSection,
) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const current = mock.plans.get(planId);
    if (!current) throw new Error("教案不存在");

    const sections = [...current.sections, section].sort((a, b) => a.sortOrder - b.sortOrder);
    const updated: LessonPlanDocument = {
      ...current,
      sections,
      updatedAt: new Date().toISOString(),
    };
    mock.plans.set(planId, updated);
    return;
  }

  const ownedPlan = await ensureLessonPlanOwned(client, planId);
  if (ownedPlan.status === "archived") {
    throw new Error("LESSON_PLAN_ARCHIVED_PUBLISH_BLOCKED");
  }

  const sectionInsert: Database["public"]["Tables"]["lesson_plan_sections"]["Insert"] = {
    id: section.id,
    lesson_plan_id: planId,
    title: section.title,
    summary: section.summary,
    duration_minutes: section.durationMinutes,
    sort_order: section.sortOrder,
  };

  const { error: sectionError } = await client.supabase!
    .from("lesson_plan_sections")
    .insert(sectionInsert);

  if (sectionError) {
    throw new Error("写入章节失败");
  }

  const blockRows: Database["public"]["Tables"]["lesson_plan_blocks"]["Insert"][] =
    section.blocks.map((block) => ({
      id: block.id,
      lesson_plan_id: planId,
      section_id: section.id,
      block_type: block.type,
      block_subtype: block.subtype ?? null,
      sort_order: block.sortOrder,
      content: block.content as unknown as Json,
      ced_codes: block.cedCodes,
      teacher_note: block.teacherNote ?? null,
    }));

  if (blockRows.length > 0) {
    const { error: blockError } = await client.supabase!
      .from("lesson_plan_blocks")
      .insert(blockRows);

    if (blockError) {
      throw new Error("写入章节内容失败");
    }
  }
}

export async function replaceLessonPlan(
  client: StoreClient,
  planId: string,
  payload: {
    title: string;
    sourcePrompt: string;
    subjectLabel: string;
    courseId: string | null;
    unitId: string | null;
    topicIds: string[];
    learningObjectiveCodes: string[];
    essentialKnowledge: CedObjective[];
    preferences: LessonPlanPreferences;
    sections: LessonPlanSection[];
  },
) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const current = mock.plans.get(planId);
    if (!current) {
      throw new Error("教案不存在");
    }

    const now = new Date().toISOString();
    mock.plans.set(planId, {
      ...current,
      title: payload.title,
      sourcePrompt: payload.sourcePrompt,
      subjectLabel: payload.subjectLabel,
      courseId: payload.courseId,
      unitId: payload.unitId,
      topicIds: payload.topicIds,
      learningObjectiveCodes: payload.learningObjectiveCodes,
      essentialKnowledge: payload.essentialKnowledge,
      preferences: payload.preferences,
      sections: payload.sections,
      updatedAt: now,
    });
    return;
  }

  await ensureLessonPlanOwned(client, planId);

  const updateData: Database["public"]["Tables"]["lesson_plans"]["Update"] = {
    title: payload.title,
    source_prompt: payload.sourcePrompt,
    subject_label: payload.subjectLabel,
    course_id: payload.courseId,
    unit_id: payload.unitId,
    topic_ids: payload.topicIds,
    learning_objective_codes: payload.learningObjectiveCodes,
    essential_knowledge: payload.essentialKnowledge as unknown as Json,
    first_section_summary: payload.sections[0]?.summary ?? null,
    ...toDbPreferences(payload.preferences),
  };

  const { data: updatedPlan, error: planError } = await client.supabase!
    .from("lesson_plans")
    .update(updateData)
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .select("id")
    .maybeSingle();

  if (planError) {
    throw new Error("更新教案失败");
  }
  if (!updatedPlan) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }

  const { error: deleteSectionError } = await client.supabase!
    .from("lesson_plan_sections")
    .delete()
    .eq("lesson_plan_id", planId);

  if (deleteSectionError) {
    throw new Error("重建章节失败");
  }

  if (payload.sections.length === 0) {
    return;
  }

  const sectionRows: Database["public"]["Tables"]["lesson_plan_sections"]["Insert"][] =
    payload.sections.map((section) => ({
      id: section.id,
      lesson_plan_id: planId,
      title: section.title,
      summary: section.summary,
      duration_minutes: section.durationMinutes,
      sort_order: section.sortOrder,
    }));

  const { error: sectionInsertError } = await client.supabase!
    .from("lesson_plan_sections")
    .insert(sectionRows);

  if (sectionInsertError) {
    throw new Error("写入章节失败");
  }

  const blockRows: Database["public"]["Tables"]["lesson_plan_blocks"]["Insert"][] =
    payload.sections.flatMap((section) =>
      section.blocks.map((block) => ({
        id: block.id,
        lesson_plan_id: planId,
        section_id: section.id,
        block_type: block.type,
        block_subtype: block.subtype ?? null,
        sort_order: block.sortOrder,
        content: block.content as unknown as Json,
        ced_codes: block.cedCodes,
        teacher_note: block.teacherNote ?? null,
      })),
    );

  if (blockRows.length > 0) {
    const { error: blockInsertError } = await client.supabase!
      .from("lesson_plan_blocks")
      .insert(blockRows);

    if (blockInsertError) {
      throw new Error("写入内容块失败");
    }
  }
}

export async function publishLessonPlan(client: StoreClient, planId: string) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const current = mock.plans.get(planId);
    if (!current) {
      throw new Error("教案不存在");
    }

    const slug = current.publishedSlug ?? generateSlug();
    const now = new Date().toISOString();
    mock.plans.set(planId, {
      ...current,
      status: "published",
      publishedSlug: slug,
      publishedAt: now,
      updatedAt: now,
    });
    return slug;
  }

  await ensureLessonPlanOwned(client, planId);

  let slug = generateSlug();
  for (let i = 0; i < 4; i += 1) {
    const { data: conflict } = await client.supabase!
      .from("lesson_plans")
      .select("id")
      .eq("published_slug", slug)
      .maybeSingle();

    if (!conflict) {
      break;
    }

    slug = generateSlug();
  }

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .update({
      status: "published",
      published_slug: slug,
      published_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .select("published_slug")
    .maybeSingle();

  if (error || !data?.published_slug) {
    throw new Error("发布失败");
  }

  return data.published_slug;
}

export async function unpublishLessonPlan(client: StoreClient, planId: string) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const current = mock.plans.get(planId);
    if (!current) {
      throw new Error("教案不存在");
    }

    const now = new Date().toISOString();
    mock.plans.set(planId, {
      ...current,
      status: "draft",
      publishedSlug: null,
      publishedAt: null,
      updatedAt: now,
    });
    return;
  }

  await ensureLessonPlanOwned(client, planId);

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .update({
      status: "draft",
      published_slug: null,
      published_at: null,
    })
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("取消发布失败");
  }
  if (!data) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }
}

export async function archiveLessonPlan(client: StoreClient, planId: string) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const current = mock.plans.get(planId);
    if (!current) {
      throw new Error("LESSON_PLAN_NOT_FOUND");
    }

    const now = new Date().toISOString();
    mock.plans.set(planId, {
      ...current,
      status: "archived",
      publishedSlug: null,
      publishedAt: null,
      updatedAt: now,
    });
    return;
  }

  await ensureLessonPlanOwned(client, planId);

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .update({
      status: "archived",
      published_slug: null,
      published_at: null,
    })
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("归档教案失败");
  }
  if (!data) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }
}

export async function restoreLessonPlan(client: StoreClient, planId: string) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const current = mock.plans.get(planId);
    if (!current) {
      throw new Error("LESSON_PLAN_NOT_FOUND");
    }

    const now = new Date().toISOString();
    mock.plans.set(planId, {
      ...current,
      status: "draft",
      publishedSlug: null,
      publishedAt: null,
      updatedAt: now,
    });
    return;
  }

  await ensureLessonPlanOwned(client, planId);

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .update({
      status: "draft",
      published_slug: null,
      published_at: null,
    })
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("恢复教案失败");
  }
  if (!data) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }
}

function duplicatePlanSections(sections: LessonPlanSection[]) {
  return sections
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section, sectionIndex) => ({
      ...section,
      id: randomUUID(),
      sortOrder: sectionIndex,
      blocks: section.blocks
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((block, blockIndex) => ({
          ...block,
          id: randomUUID(),
          sortOrder: blockIndex,
        })),
    }));
}

export async function copyLessonPlan(client: StoreClient, planId: string) {
  const original = await getLessonPlanById(client, planId);
  if (!original) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }

  const copyId = await createLessonPlanShell(client, {
    title: `${original.title} (Copy)`,
    sourcePrompt: original.sourcePrompt,
    subjectLabel: original.subjectLabel,
    courseId: original.courseId,
    unitId: original.unitId,
    topicIds: original.topicIds,
    learningObjectiveCodes: original.learningObjectiveCodes,
    essentialKnowledge: original.essentialKnowledge,
    preferences: original.preferences,
  });

  const duplicatedSections = duplicatePlanSections(original.sections);
  for (const section of duplicatedSections) {
    await appendLessonPlanSection(client, copyId, section);
  }

  const copiedPlan = await getLessonPlanById(client, copyId);
  if (!copiedPlan) {
    throw new Error("复制教案失败");
  }

  return copiedPlan;
}

export async function deleteLessonPlan(client: StoreClient, planId: string) {
  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const current = mock.plans.get(planId);
    if (!current) {
      throw new Error("LESSON_PLAN_NOT_FOUND");
    }
    if (current.status === "published") {
      throw new Error("LESSON_PLAN_PUBLISHED_DELETE_BLOCKED");
    }
    mock.plans.delete(planId);
    return;
  }

  const ownedPlan = await ensureLessonPlanOwned(client, planId);
  if (ownedPlan.status === "published") {
    throw new Error("LESSON_PLAN_PUBLISHED_DELETE_BLOCKED");
  }

  const { data, error } = await client.supabase!
    .from("lesson_plans")
    .delete()
    .eq("id", planId)
    .eq("teacher_id", client.teacherId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("删除教案失败");
  }
  if (!data) {
    throw new Error("LESSON_PLAN_NOT_FOUND");
  }
}

export async function bulkArchiveLessonPlans(client: StoreClient, planIds: string[]) {
  const uniquePlanIds = Array.from(new Set(planIds));
  if (uniquePlanIds.length === 0) {
    return { archivedIds: [], missingIds: [] as string[] };
  }

  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const archivedIds: string[] = [];
    const missingIds: string[] = [];

    uniquePlanIds.forEach((planId) => {
      const current = mock.plans.get(planId);
      if (!current) {
        missingIds.push(planId);
        return;
      }
      mock.plans.set(planId, {
        ...current,
        status: "archived",
        publishedSlug: null,
        publishedAt: null,
        updatedAt: new Date().toISOString(),
      });
      archivedIds.push(planId);
    });

    return { archivedIds, missingIds };
  }

  const { data: existing, error: readError } = await client.supabase!
    .from("lesson_plans")
    .select("id")
    .in("id", uniquePlanIds)
    .eq("teacher_id", client.teacherId);

  if (readError) {
    throw new Error("读取教案失败");
  }

  const existingIds = new Set((existing ?? []).map((row) => row.id));
  const missingIds = uniquePlanIds.filter((id) => !existingIds.has(id));
  const archivableIds = uniquePlanIds.filter((id) => existingIds.has(id));

  if (archivableIds.length > 0) {
    const { error: updateError } = await client.supabase!
      .from("lesson_plans")
      .update({
        status: "archived",
        published_slug: null,
        published_at: null,
      })
      .in("id", archivableIds)
      .eq("teacher_id", client.teacherId);

    if (updateError) {
      throw new Error("批量归档失败");
    }
  }

  return {
    archivedIds: archivableIds,
    missingIds,
  };
}

export async function bulkRestoreLessonPlans(client: StoreClient, planIds: string[]) {
  const uniquePlanIds = Array.from(new Set(planIds));
  if (uniquePlanIds.length === 0) {
    return { restoredIds: [], missingIds: [] as string[] };
  }

  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const restoredIds: string[] = [];
    const missingIds: string[] = [];

    uniquePlanIds.forEach((planId) => {
      const current = mock.plans.get(planId);
      if (!current) {
        missingIds.push(planId);
        return;
      }
      mock.plans.set(planId, {
        ...current,
        status: "draft",
        publishedSlug: null,
        publishedAt: null,
        updatedAt: new Date().toISOString(),
      });
      restoredIds.push(planId);
    });

    return { restoredIds, missingIds };
  }

  const { data: existing, error: readError } = await client.supabase!
    .from("lesson_plans")
    .select("id")
    .in("id", uniquePlanIds)
    .eq("teacher_id", client.teacherId);

  if (readError) {
    throw new Error("读取教案失败");
  }

  const existingIds = new Set((existing ?? []).map((row) => row.id));
  const missingIds = uniquePlanIds.filter((id) => !existingIds.has(id));
  const restorableIds = uniquePlanIds.filter((id) => existingIds.has(id));

  if (restorableIds.length > 0) {
    const { error: updateError } = await client.supabase!
      .from("lesson_plans")
      .update({
        status: "draft",
        published_slug: null,
        published_at: null,
      })
      .in("id", restorableIds)
      .eq("teacher_id", client.teacherId);

    if (updateError) {
      throw new Error("批量恢复失败");
    }
  }

  return {
    restoredIds: restorableIds,
    missingIds,
  };
}

export async function bulkDeleteLessonPlans(client: StoreClient, planIds: string[]) {
  const uniquePlanIds = Array.from(new Set(planIds));
  if (uniquePlanIds.length === 0) {
    return {
      deletedIds: [] as string[],
      blockedPublishedIds: [] as string[],
      missingIds: [] as string[],
    };
  }

  if (shouldUseMockStore(client)) {
    const mock = getMockStore();
    const deletedIds: string[] = [];
    const blockedPublishedIds: string[] = [];
    const missingIds: string[] = [];

    uniquePlanIds.forEach((planId) => {
      const current = mock.plans.get(planId);
      if (!current) {
        missingIds.push(planId);
        return;
      }
      if (current.status === "published") {
        blockedPublishedIds.push(planId);
        return;
      }
      mock.plans.delete(planId);
      deletedIds.push(planId);
    });

    return { deletedIds, blockedPublishedIds, missingIds };
  }

  const { data: existingRows, error: readError } = await client.supabase!
    .from("lesson_plans")
    .select("id,status")
    .in("id", uniquePlanIds)
    .eq("teacher_id", client.teacherId);

  if (readError) {
    throw new Error("读取教案失败");
  }

  const statusById = new Map((existingRows ?? []).map((row) => [row.id, row.status]));
  const missingIds = uniquePlanIds.filter((id) => !statusById.has(id));
  const blockedPublishedIds = uniquePlanIds.filter((id) => statusById.get(id) === "published");
  const deletableIds = uniquePlanIds.filter((id) => {
    const status = statusById.get(id);
    return status === "draft" || status === "archived";
  });

  if (deletableIds.length > 0) {
    const { error: deleteError } = await client.supabase!
      .from("lesson_plans")
      .delete()
      .in("id", deletableIds)
      .eq("teacher_id", client.teacherId);

    if (deleteError) {
      throw new Error("批量删除失败");
    }
  }

  return {
    deletedIds: deletableIds,
    blockedPublishedIds,
    missingIds,
  };
}

declare global {
  var __lessonPlanMockStore:
    | {
        preferences: Map<string, LessonPlanPreferences>;
        plans: Map<string, LessonPlanDocument>;
      }
    | undefined;
}
