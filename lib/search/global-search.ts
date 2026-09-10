import type { SupabaseClient } from "@supabase/supabase-js";
import { listConversations } from "@/lib/assistant/store";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";
import { queryLessonPlans } from "@/lib/lesson-plan/store";
import type {
  GlobalSearchItem,
  GlobalSearchMatchSource,
  GlobalSearchResultType,
} from "@/lib/search/types";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

type ContentLibraryBootstrapRow = {
  id: string;
  content_type: string | null;
  title: string | null;
  custom_title: string | null;
  course_label: string | null;
  unit_label: string | null;
  updated_at: string;
};

type QuestionBootstrapRow = {
  id: string;
  question_text: string | null;
  source_file_name: string | null;
  updated_at: string;
  course?: { name?: string | null } | { name?: string | null }[] | null;
  unit?: { unit_number?: number | string | null; title?: string | null } | Array<{
    unit_number?: number | string | null;
    title?: string | null;
  }> | null;
};

type PblBootstrapRow = {
  id: string;
  title: string | null;
  status: string | null;
  updated_at: string;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function toTitlePreview(value: string | null | undefined, fallback: string, limit = 72) {
  const normalized = cleanText(value);
  if (!normalized) return fallback;
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatUnitLabel(unit: { unit_number?: number | string | null; title?: string | null } | null) {
  if (!unit) return "";
  const unitNumber = cleanText(`${unit.unit_number ?? ""}`);
  const title = cleanText(unit.title);
  if (unitNumber && title) return `Unit ${unitNumber} ${title}`;
  return unitNumber ? `Unit ${unitNumber}` : title;
}

function buildSubtitle(parts: Array<string | null | undefined>) {
  return parts.map((part) => cleanText(part)).filter(Boolean).join(" · ");
}

function buildRoute(type: GlobalSearchResultType, params: {
  id: string;
  title?: string | null;
}) {
  if (type === "content_library_item") {
    return buildContentAssetsRoute({ itemId: params.id });
  }
  if (type === "question") {
    const query = encodeURIComponent(toTitlePreview(params.title, "", 48));
    const suffix = query ? `&q=${query}` : "";
    return `/main/question-bank?questionId=${encodeURIComponent(params.id)}${suffix}`;
  }
  if (type === "lesson_plan") {
    return `/lesson-plans?planId=${encodeURIComponent(params.id)}`;
  }
  if (type === "pbl_project") {
    return `/main/pbl/${encodeURIComponent(params.id)}`;
  }
  return `/main/agent?conversationId=${encodeURIComponent(params.id)}`;
}

function buildItem(params: {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string;
  updatedAt: string;
  keywords?: Array<string | null | undefined>;
  matchSource: GlobalSearchMatchSource;
}) {
  return {
    id: params.id,
    type: params.type,
    title: params.title,
    subtitle: params.subtitle,
    route: buildRoute(params.type, { id: params.id, title: params.title }),
    updatedAt: params.updatedAt,
    keywords: (params.keywords ?? []).map((value) => cleanText(value)).filter(Boolean),
    matchSource: params.matchSource,
  } satisfies GlobalSearchItem;
}

function scoreTextMatch(item: Pick<GlobalSearchItem, "title" | "subtitle" | "keywords" | "updatedAt">, query: string) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) return 0;

  const title = item.title.toLowerCase();
  const subtitle = item.subtitle.toLowerCase();
  const keywordText = item.keywords.join(" ").toLowerCase();
  let score = 0;
  let matched = false;

  if (title === normalizedQuery) {
    score += 1200;
    matched = true;
  } else if (title.startsWith(normalizedQuery)) {
    score += 950;
    matched = true;
  } else if (title.includes(normalizedQuery)) {
    score += 760;
    matched = true;
  }

  if (subtitle.startsWith(normalizedQuery)) {
    score += 260;
    matched = true;
  } else if (subtitle.includes(normalizedQuery)) {
    score += 180;
    matched = true;
  }

  if (keywordText.includes(normalizedQuery)) {
    score += 140;
    matched = true;
  }

  if (!matched) return 0;

  const dateValue = Date.parse(item.updatedAt);
  if (Number.isFinite(dateValue)) {
    score += Math.max(0, 90 - Math.floor((Date.now() - dateValue) / (1000 * 60 * 60 * 24)));
  }

  return score;
}

function rankItems(items: GlobalSearchItem[], query: string, limit: number) {
  return items
    .map((item) => ({
      item,
      score: scoreTextMatch(item, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return `${right.item.updatedAt}`.localeCompare(`${left.item.updatedAt}`);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

async function readContentLibraryBootstrapItems(
  supabase: AppSupabase,
  teacherId: string,
  matchSource: GlobalSearchMatchSource,
) {
  const { data, error } = await supabase
    .from("content_library_items")
    .select("id,content_type,title,custom_title,course_label,unit_label,updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    throw new Error(`读取内容库搜索索引失败: ${error.message}`);
  }

  return ((data ?? []) as ContentLibraryBootstrapRow[]).map((row) =>
    buildItem({
      id: row.id,
      type: "content_library_item",
      title: cleanText(row.custom_title) || cleanText(row.title) || "未命名内容",
      subtitle: buildSubtitle([
        "内容库",
        cleanText(row.content_type),
        row.course_label,
        row.unit_label,
      ]),
      updatedAt: row.updated_at,
      keywords: [row.title, row.custom_title, row.course_label, row.unit_label, row.content_type],
      matchSource,
    }),
  );
}

async function searchContentLibraryTextItems(
  supabase: AppSupabase,
  teacherId: string,
  query: string,
  limit: number,
) {
  const { data, error } = await supabase
    .from("content_library_items")
    .select("id,content_type,title,custom_title,course_label,unit_label,updated_at")
    .eq("teacher_id", teacherId)
    .ilike("search_text", `%${cleanText(query)}%`)
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 2, 8));

  if (error) {
    throw new Error(`读取内容库文本搜索结果失败: ${error.message}`);
  }

  const items = ((data ?? []) as ContentLibraryBootstrapRow[]).map((row) =>
    buildItem({
      id: row.id,
      type: "content_library_item",
      title: cleanText(row.custom_title) || cleanText(row.title) || "未命名内容",
      subtitle: buildSubtitle(["内容库", cleanText(row.content_type), row.course_label, row.unit_label]),
      updatedAt: row.updated_at,
      keywords: [row.title, row.custom_title, row.course_label, row.unit_label, row.content_type],
      matchSource: "text",
    }),
  );

  return rankItems(items, query, limit);
}

async function readQuestionBootstrapItems(
  supabase: AppSupabase,
  teacherId: string,
  matchSource: GlobalSearchMatchSource,
) {
  const { data, error } = await supabase
    .from("exercises")
    .select(
      `
        id,
        question_text,
        source_file_name,
        updated_at,
        course:courses(name),
        unit:units(unit_number,title)
      `,
    )
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(`读取题库搜索索引失败: ${error.message}`);
  }

  return ((data ?? []) as QuestionBootstrapRow[]).map((row) => {
    const course = pickFirst(row.course);
    const unit = pickFirst(row.unit);
    const title = toTitlePreview(row.question_text, "未命名题目");
    return buildItem({
      id: row.id,
      type: "question",
      title,
      subtitle: buildSubtitle([
        "题库",
        cleanText(row.source_file_name),
        course?.name,
        formatUnitLabel(unit),
      ]),
      updatedAt: row.updated_at,
      keywords: [row.question_text, row.source_file_name, course?.name, unit?.title],
      matchSource,
    });
  });
}

async function searchQuestionTextItems(
  supabase: AppSupabase,
  teacherId: string,
  query: string,
  limit: number,
) {
  const safe = cleanText(query).replace(/,/g, " ").replace(/\./g, " ");
  const { data, error } = await supabase
    .from("exercises")
    .select(
      `
        id,
        question_text,
        source_file_name,
        updated_at,
        course:courses(name),
        unit:units(unit_number,title)
      `,
    )
    .eq("teacher_id", teacherId)
    .or(
      `question_text.ilike.%${safe}%,source_file_name.ilike.%${safe}%,teacher_prompt.ilike.%${safe}%,knowledge_subskill_label.ilike.%${safe}%`,
    )
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 2, 8));

  if (error) {
    throw new Error(`读取题库文本搜索结果失败: ${error.message}`);
  }

  const items = ((data ?? []) as QuestionBootstrapRow[]).map((row) => {
    const course = pickFirst(row.course);
    const unit = pickFirst(row.unit);
    const title = toTitlePreview(row.question_text, "未命名题目");
    return buildItem({
      id: row.id,
      type: "question",
      title,
      subtitle: buildSubtitle([
        "题库",
        cleanText(row.source_file_name),
        course?.name,
        formatUnitLabel(unit),
      ]),
      updatedAt: row.updated_at,
      keywords: [row.question_text, row.source_file_name, course?.name, unit?.title],
      matchSource: "text",
    });
  });

  return rankItems(items, query, limit);
}

async function readLessonPlanBootstrapItems(
  supabase: AppSupabase,
  teacherId: string,
  matchSource: GlobalSearchMatchSource,
) {
  const { data, error } = await supabase
    .from("lesson_plans")
    .select("id,title,subject_label,status,updated_at")
    .eq("teacher_id", teacherId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`读取教案搜索索引失败: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    id: string;
    title: string | null;
    subject_label: string | null;
    status: string | null;
    updated_at: string;
  }>).map((row) =>
    buildItem({
      id: row.id,
      type: "lesson_plan",
      title: cleanText(row.title) || "未命名教案",
      subtitle: buildSubtitle(["教案", row.subject_label, row.status]),
      updatedAt: row.updated_at,
      keywords: [row.title, row.subject_label, row.status],
      matchSource,
    }),
  );
}

async function searchLessonPlanTextItems(
  supabase: AppSupabase,
  teacherId: string,
  query: string,
  limit: number,
) {
  const result = await queryLessonPlans(
    {
      teacherId,
      supabase,
      isMock: false,
    },
    {
      status: "active",
      sort: "updated_desc",
      query,
      limit: Math.max(limit * 2, 8),
      offset: 0,
    },
  );

  const items = result.items.map((row) =>
    buildItem({
      id: row.id,
      type: "lesson_plan",
      title: cleanText(row.title) || "未命名教案",
      subtitle: buildSubtitle(["教案", row.subjectLabel, row.status]),
      updatedAt: row.updatedAt,
      keywords: [row.title, row.subjectLabel, row.status],
      matchSource: "text",
    }),
  );

  return rankItems(items, query, limit);
}

async function readPblBootstrapItems(
  supabase: AppSupabase,
  teacherId: string,
  matchSource: GlobalSearchMatchSource,
) {
  const { data, error } = await supabase
    .from("pbl_project_plans")
    .select("id,title,status,updated_at")
    .eq("teacher_id", teacherId)
    .order("updated_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`读取 PBL 搜索索引失败: ${error.message}`);
  }

  return ((data ?? []) as PblBootstrapRow[]).map((row) =>
    buildItem({
      id: row.id,
      type: "pbl_project",
      title: cleanText(row.title) || "未命名 PBL 项目",
      subtitle: buildSubtitle(["PBL", row.status]),
      updatedAt: row.updated_at,
      keywords: [row.title, row.status],
      matchSource,
    }),
  );
}

async function searchPblTextItems(
  supabase: AppSupabase,
  teacherId: string,
  query: string,
  limit: number,
) {
  const { data, error } = await supabase
    .from("pbl_project_plans")
    .select("id,title,status,updated_at")
    .eq("teacher_id", teacherId)
    .ilike("title", `%${cleanText(query)}%`)
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 2, 8));

  if (error) {
    throw new Error(`读取 PBL 文本搜索结果失败: ${error.message}`);
  }

  const items = ((data ?? []) as PblBootstrapRow[]).map((row) =>
    buildItem({
      id: row.id,
      type: "pbl_project",
      title: cleanText(row.title) || "未命名 PBL 项目",
      subtitle: buildSubtitle(["PBL", row.status]),
      updatedAt: row.updated_at,
      keywords: [row.title, row.status],
      matchSource: "text",
    }),
  );

  return rankItems(items, query, limit);
}

async function readConversationItems(
  supabase: AppSupabase,
  teacherId: string,
  matchSource: GlobalSearchMatchSource,
) {
  const conversations = await listConversations(supabase, teacherId);
  return conversations.slice(0, 60).map((row) =>
    buildItem({
      id: row.id,
      type: "conversation",
      title: cleanText(row.title) || "未命名对话",
      subtitle: "最近对话",
      updatedAt: row.updatedAt,
      keywords: [row.title],
      matchSource,
    }),
  );
}

async function searchConversationTextItems(
  supabase: AppSupabase,
  teacherId: string,
  query: string,
  limit: number,
) {
  const items = await readConversationItems(supabase, teacherId, "text");
  return rankItems(items, query, limit);
}

function dedupeItems(items: GlobalSearchItem[]) {
  const deduped = new Map<string, GlobalSearchItem>();

  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

export async function listGlobalSearchBootstrap(params: {
  supabase: AppSupabase;
  teacherId: string;
}) {
  const [contentItems, questionItems, lessonPlanItems, pblItems, conversationItems] =
    await Promise.all([
      readContentLibraryBootstrapItems(params.supabase, params.teacherId, "bootstrap"),
      readQuestionBootstrapItems(params.supabase, params.teacherId, "bootstrap"),
      readLessonPlanBootstrapItems(params.supabase, params.teacherId, "bootstrap"),
      readPblBootstrapItems(params.supabase, params.teacherId, "bootstrap"),
      readConversationItems(params.supabase, params.teacherId, "bootstrap"),
    ]);

  return dedupeItems([
    ...contentItems,
    ...questionItems,
    ...lessonPlanItems,
    ...pblItems,
    ...conversationItems,
  ]).sort((left, right) => `${right.updatedAt}`.localeCompare(`${left.updatedAt}`));
}

export async function searchGlobalText(params: {
  supabase: AppSupabase;
  teacherId: string;
  query: string;
  limit?: number;
}) {
  const normalizedQuery = cleanText(params.query);
  if (!normalizedQuery) return [] as GlobalSearchItem[];

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 20);
  const perBucketLimit = Math.min(Math.max(Math.ceil(limit / 2), 4), 8);

  const [contentItems, questionItems, lessonPlanItems, pblItems, conversationItems] =
    await Promise.all([
      searchContentLibraryTextItems(params.supabase, params.teacherId, normalizedQuery, perBucketLimit),
      searchQuestionTextItems(params.supabase, params.teacherId, normalizedQuery, perBucketLimit),
      searchLessonPlanTextItems(params.supabase, params.teacherId, normalizedQuery, perBucketLimit),
      searchPblTextItems(params.supabase, params.teacherId, normalizedQuery, perBucketLimit),
      searchConversationTextItems(params.supabase, params.teacherId, normalizedQuery, Math.min(4, perBucketLimit)),
    ]);

  return rankItems(
    dedupeItems([
      ...contentItems,
      ...questionItems,
      ...lessonPlanItems,
      ...pblItems,
      ...conversationItems,
    ]),
    normalizedQuery,
    limit,
  );
}
