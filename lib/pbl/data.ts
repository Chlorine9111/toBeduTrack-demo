import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { normalizeTopicSeed } from "@/lib/pbl/topic-normalize";
import { mergeMaterialTopicAssignments, type PblMaterialTopicAssignment, type PblTopicSeed } from "@/lib/pbl/topic-seeds";
import type {
  PblKnowledgePoint,
  PblMaterial,
  PblMaterialCurriculumScope,
  PblMaterialKnowledgeLink,
  PblMaterialTag,
  PblMaterialTagGroups,
  PblMaterialTopicLink,
  PblTagDimension,
} from "@/lib/pbl/types";

type MaterialRow = {
  id: string;
  display_code: string | null;
  title: string;
  type: PblMaterial["type"];
  source: string;
  year: number | null;
  url: string | null;
  original_content: string | null;
  curriculum_scope: PblMaterialCurriculumScope | null;
};

type LocalMaterialSeed = {
  id: string;
  title: string;
  type: PblMaterial["type"];
  source: string;
  year: number;
  curriculumScope?: PblMaterialCurriculumScope;
  tags: string[];
  topics?: PblTopicSeed[];
  link: string;
  originalContent?: string;
  content?: string;
};

type MaterialTagRow = {
  material_id: string;
  tag_id: string;
};

type TagRow = {
  id: string;
  name: string;
  dimension: PblTagDimension;
};

type MaterialKnowledgeLinkRow = {
  material_id: string;
  knowledge_point_id: string;
  relevance: "primary" | "supporting" | null;
};

type MaterialTopicLinkRow = {
  material_id: string;
  topic_id: string;
  relevance: "primary" | "supporting" | null;
};

type KnowledgePointLookupRow = {
  id: string;
  code: string;
  curriculum_system: "AP" | "IB" | "CN";
  subject: string;
  name: string;
};

type KnowledgePointRow = {
  code: string;
  curriculum_system: "AP" | "IB" | "CN";
  subject: string;
  hierarchy_label: string;
  name: string;
  description: string | null;
  project_potential: "high" | "medium" | "low" | null;
};

type TopicLookupRow = {
  id: string;
  slug: string;
  name: string;
};

type TopicAliasRow = {
  topic_id: string;
  alias: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

const MATERIAL_CACHE_TTL_MS = 2 * 60 * 1000;
const KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;

const SUBJECT_TAGS = new Set([
  "物理",
  "化学",
  "生物",
  "数学",
  "地理",
  "历史",
  "政治",
  "经济",
  "计算机",
  "工程",
  "环境科学",
  "心理学",
  "语文",
  "英语",
  "艺术",
  "哲学",
  "社会学",
  "跨学科",
]);

const FORM_TAGS = new Set([
  "实验探究",
  "数学建模",
  "工程设计",
  "社会调研",
  "数据分析",
  "文献研究",
  "方案设计",
  "创意表达",
]);

const THEME_TAGS = new Set([
  "环境与生态",
  "健康与医学",
  "科技与创新",
  "城市与社区",
  "经济与商业",
  "文化与传承",
  "教育与发展",
  "伦理与治理",
  "食品与农业",
  "能源与材料",
]);

const COGNITIVE_TAGS = new Set(["应用", "分析", "评价", "创造"]);

let publicMaterialsCache:
  | {
      expiresAt: number;
      data: PblMaterial[];
    }
  | null = null;

let knowledgePointsCache:
  | {
      expiresAt: number;
      data: PblKnowledgePoint[];
    }
  | null = null;

function getDataDir() {
  return path.join(process.cwd(), "data", "pbl");
}

function allowLocalSeedFallback() {
  return process.env.E2E_TEST === "1" || process.env.PBL_ALLOW_LOCAL_SEED_FALLBACK === "1";
}

function getPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

function isMissingTableError(error: SupabaseErrorLike | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST205" || /Could not find the table/i.test(message);
}

function createEmptyTagGroups(): PblMaterialTagGroups {
  return {
    A: [],
    B: [],
    C: [],
    D: [],
  };
}

function inferTagDimension(name: string): PblTagDimension | null {
  if (SUBJECT_TAGS.has(name)) return "A";
  if (FORM_TAGS.has(name)) return "B";
  if (THEME_TAGS.has(name)) return "C";
  if (COGNITIVE_TAGS.has(name)) return "D";
  return null;
}

function buildTagGroups(tagDetails: PblMaterialTag[]): PblMaterialTagGroups {
  const groups = createEmptyTagGroups();

  tagDetails.forEach((tag) => {
    const list = groups[tag.dimension];
    if (!list.includes(tag.name)) {
      list.push(tag.name);
    }
  });

  return groups;
}

function buildTagDetailsFromNames(tagNames: string[]): PblMaterialTag[] {
  return tagNames
    .map((name) => {
      const dimension = inferTagDimension(name);
      if (!dimension) return null;

      return {
        name,
        dimension,
      } satisfies PblMaterialTag;
    })
    .filter((tag): tag is PblMaterialTag => Boolean(tag));
}

function buildTopicLinksFromSeed(topics: LocalMaterialSeed["topics"]): PblMaterialTopicLink[] {
  if (!topics || topics.length === 0) return [];

  const dedup = new Map<string, PblMaterialTopicLink>();

  topics.forEach((entry) => {
    const normalized = normalizeTopicSeed(entry);
    if (!normalized) return;
    if (!normalized.name || !normalized.slug) return;

    dedup.set(normalized.slug, {
      slug: normalized.slug,
      name: normalized.name,
      aliases: normalized.aliases,
      relevance: normalized.relevance,
    });
  });

  return Array.from(dedup.values());
}

function inferMaterialCurriculumScopeFromText(input: {
  title: string;
  source: string;
  tags: string[];
}): PblMaterialCurriculumScope {
  const text = `${input.title} ${input.source} ${input.tags.join(" ")}`.toLowerCase();
  const hasAP =
    text.includes(" ap ") ||
    text.startsWith("ap ") ||
    text.includes("apcentral") ||
    text.includes("college board");
  const hasIB =
    text.includes(" ib ") ||
    text.includes("ibo") ||
    text.includes("diploma programme") ||
    text.includes("international baccalaureate");
  const hasCN =
    text.includes("课程标准") ||
    text.includes("教育部") ||
    text.includes("国家中小学") ||
    text.includes("普通高中");

  const matches = [hasAP && "AP", hasIB && "IB", hasCN && "CN"].filter(
    Boolean,
  ) as PblMaterialCurriculumScope[];

  if (matches.length === 1) return matches[0];
  return "GENERIC";
}

function resolveMaterialCurriculumScope(params: {
  explicitScope?: PblMaterialCurriculumScope | null;
  knowledgeLinks?: PblMaterialKnowledgeLink[];
  title: string;
  source: string;
  tags: string[];
}): PblMaterialCurriculumScope {
  if (params.explicitScope) return params.explicitScope;

  const knowledgeScopes = Array.from(
    new Set((params.knowledgeLinks ?? []).map((link) => link.curriculumSystem)),
  );
  if (knowledgeScopes.length === 1) return knowledgeScopes[0];
  if (knowledgeScopes.length > 1) return "GENERIC";

  return inferMaterialCurriculumScopeFromText({
    title: params.title,
    source: params.source,
    tags: params.tags,
  });
}

async function readJsonFile<T>(filename: string, fallback: T): Promise<T> {
  try {
    const fullPath = path.join(getDataDir(), filename);
    const content = await fs.readFile(fullPath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function loadPublicMaterialsFromDb(): Promise<PblMaterial[] | null> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) {
    if (allowLocalSeedFallback()) return null;
    throw new Error("PBL 公共素材库未配置 Supabase 连接");
  }

  const { data: materials, error: materialError } = await supabase
    .from("pbl_materials")
    .select("id, display_code, title, type, source, year, url, original_content, curriculum_scope")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (materialError) {
    throw new Error(`读取 PBL 公共素材失败：${materialError.message ?? "未知错误"}`);
  }
  if (!materials || materials.length === 0) return null;

  const typedMaterials = materials as MaterialRow[];
  const materialIds = typedMaterials.map((item) => item.id);

  const { data: links, error: linksError } = await supabase
    .from("pbl_material_tags")
    .select("material_id, tag_id")
    .in("material_id", materialIds);

  if (linksError) {
    console.warn("[pbl:data] failed to load material-tag links", linksError.message);
  }

  const tagIds = Array.from(new Set((links as MaterialTagRow[] | null)?.map((item) => item.tag_id) ?? []));

  const { data: tags, error: tagsError } = tagIds.length
    ? await supabase.from("pbl_tags").select("id, name, dimension").in("id", tagIds)
    : { data: [] as TagRow[] | null, error: null as SupabaseErrorLike | null };

  if (tagsError) {
    console.warn("[pbl:data] failed to load tags", tagsError.message);
  }

  const tagById = new Map((tags as TagRow[] | null)?.map((item) => [item.id, item]) ?? []);
  const tagDetailsByMaterialId = new Map<string, PblMaterialTag[]>();

  (links as MaterialTagRow[] | null)?.forEach((item) => {
    const tag = tagById.get(item.tag_id);
    if (!tag) return;

    const list = tagDetailsByMaterialId.get(item.material_id) ?? [];
    list.push({
      id: tag.id,
      name: tag.name,
      dimension: tag.dimension,
    });
    tagDetailsByMaterialId.set(item.material_id, list);
  });

  const knowledgeLinksByMaterialId = new Map<string, PblMaterialKnowledgeLink[]>();
  const topicLinksByMaterialId = new Map<string, PblMaterialTopicLink[]>();

  const { data: rawKnowledgeLinks, error: rawKnowledgeLinksError } = await supabase
    .from("pbl_material_knowledge_points")
    .select("material_id, knowledge_point_id, relevance")
    .in("material_id", materialIds);

  if (rawKnowledgeLinksError && !isMissingTableError(rawKnowledgeLinksError)) {
    console.warn("[pbl:data] failed to load material-knowledge links", rawKnowledgeLinksError.message);
  }

  if (!rawKnowledgeLinksError && rawKnowledgeLinks && rawKnowledgeLinks.length > 0) {
    const typedKnowledgeLinks = rawKnowledgeLinks as MaterialKnowledgeLinkRow[];
    const knowledgePointIds = Array.from(
      new Set(typedKnowledgeLinks.map((item) => item.knowledge_point_id).filter(Boolean)),
    );

    if (knowledgePointIds.length > 0) {
      const { data: rawKnowledgePoints, error: rawKnowledgePointsError } = await supabase
        .from("pbl_knowledge_points")
        .select("id, code, curriculum_system, subject, name")
        .in("id", knowledgePointIds);

      if (rawKnowledgePointsError) {
        console.warn("[pbl:data] failed to load knowledge point rows", rawKnowledgePointsError.message);
      }

      const knowledgePointById = new Map(
        (rawKnowledgePoints as KnowledgePointLookupRow[] | null)?.map((item) => [item.id, item]) ?? [],
      );

      typedKnowledgeLinks.forEach((item) => {
        const knowledgePoint = knowledgePointById.get(item.knowledge_point_id);
        if (!knowledgePoint) return;

        const next: PblMaterialKnowledgeLink = {
          knowledgePointId: knowledgePoint.id,
          code: knowledgePoint.code,
          name: knowledgePoint.name,
          curriculumSystem: knowledgePoint.curriculum_system,
          subject: knowledgePoint.subject,
          relevance: item.relevance === "supporting" ? "supporting" : "primary",
        };

        const list = knowledgeLinksByMaterialId.get(item.material_id) ?? [];
        list.push(next);
        knowledgeLinksByMaterialId.set(item.material_id, list);
      });
    }
  }

  const { data: rawTopicLinks, error: rawTopicLinksError } = await supabase
    .from("pbl_material_topics")
    .select("material_id, topic_id, relevance")
    .in("material_id", materialIds);

  if (rawTopicLinksError && !isMissingTableError(rawTopicLinksError)) {
    console.warn("[pbl:data] failed to load material-topic links", rawTopicLinksError.message);
  }

  if (!rawTopicLinksError && rawTopicLinks && rawTopicLinks.length > 0) {
    const typedTopicLinks = rawTopicLinks as MaterialTopicLinkRow[];
    const topicIds = Array.from(new Set(typedTopicLinks.map((item) => item.topic_id).filter(Boolean)));

    if (topicIds.length > 0) {
      const { data: rawTopics, error: rawTopicsError } = await supabase
        .from("pbl_topics")
        .select("id, slug, name")
        .in("id", topicIds);

      if (rawTopicsError) {
        console.warn("[pbl:data] failed to load topic rows", rawTopicsError.message);
      }

      const { data: rawTopicAliases, error: rawTopicAliasesError } = await supabase
        .from("pbl_topic_aliases")
        .select("topic_id, alias")
        .in("topic_id", topicIds);

      if (rawTopicAliasesError && !isMissingTableError(rawTopicAliasesError)) {
        console.warn("[pbl:data] failed to load topic aliases", rawTopicAliasesError.message);
      }

      const topicById = new Map(
        (rawTopics as TopicLookupRow[] | null)?.map((item) => [item.id, item]) ?? [],
      );
      const aliasesByTopicId = new Map<string, string[]>();

      (rawTopicAliases as TopicAliasRow[] | null)?.forEach((item) => {
        const list = aliasesByTopicId.get(item.topic_id) ?? [];
        if (!list.includes(item.alias)) {
          list.push(item.alias);
          aliasesByTopicId.set(item.topic_id, list);
        }
      });

      typedTopicLinks.forEach((item) => {
        const topic = topicById.get(item.topic_id);
        if (!topic) return;

        const next: PblMaterialTopicLink = {
          topicId: topic.id,
          slug: topic.slug,
          name: topic.name,
          aliases: aliasesByTopicId.get(topic.id) ?? [],
          relevance: item.relevance === "supporting" ? "supporting" : "primary",
        };

        const list = topicLinksByMaterialId.get(item.material_id) ?? [];
        list.push(next);
        topicLinksByMaterialId.set(item.material_id, list);
      });
    }
  }

  return typedMaterials.map((item) => {
    const mappedKnowledgeLinks = knowledgeLinksByMaterialId.get(item.id) ?? [];
    const mappedTopicLinks = topicLinksByMaterialId.get(item.id) ?? [];
    const tagDetails = tagDetailsByMaterialId.get(item.id) ?? [];

    return {
      id: item.display_code || item.id,
      title: item.title,
      type: item.type,
      source: item.source,
      year: item.year ?? new Date().getFullYear(),
      curriculumScope: resolveMaterialCurriculumScope({
        explicitScope: item.curriculum_scope,
        knowledgeLinks: mappedKnowledgeLinks,
        title: item.title,
        source: item.source,
        tags: tagDetails.map((tag) => tag.name),
      }),
      tags: tagDetails.map((tag) => tag.name),
      tagDetails,
      tagsByDimension: buildTagGroups(tagDetails),
      link: item.url ?? "",
      originalContent: item.original_content ?? undefined,
      knowledgePointLinks: mappedKnowledgeLinks,
      topicLinks: mappedTopicLinks,
      visibility: "public",
      ownerId: null,
    } satisfies PblMaterial;
  });
}

async function loadKnowledgePointsFromDb(): Promise<PblKnowledgePoint[] | null> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) {
    if (allowLocalSeedFallback()) return null;
    throw new Error("PBL 知识点库未配置 Supabase 连接");
  }

  const { data, error } = await supabase
    .from("pbl_knowledge_points")
    .select("code, curriculum_system, subject, hierarchy_label, name, description, project_potential")
    .order("code", { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`读取 PBL 知识点失败：${error.message ?? "未知错误"}`);
  }
  if (!data || data.length === 0) return null;

  return (data as KnowledgePointRow[]).map((item) => ({
    code: item.code,
    curriculumSystem: item.curriculum_system,
    subject: item.subject,
    hierarchyLabel: item.hierarchy_label,
    name: item.name,
    description: item.description ?? undefined,
    projectPotential: item.project_potential ?? "medium",
  }));
}

export async function loadPublicMaterials(): Promise<PblMaterial[]> {
  const now = Date.now();
  if (publicMaterialsCache && publicMaterialsCache.expiresAt > now) {
    return publicMaterialsCache.data;
  }

  const fromDb = await loadPublicMaterialsFromDb();
  if (fromDb && fromDb.length > 0) {
    publicMaterialsCache = {
      expiresAt: now + MATERIAL_CACHE_TTL_MS,
      data: fromDb,
    };
    return fromDb;
  }

  if (!allowLocalSeedFallback()) {
    throw new Error("PBL 公共素材库为空，请先运行 npm run pbl:seed");
  }

  const seeds = await readJsonFile<LocalMaterialSeed[]>("materials.seed.json", []);
  const collected = await readJsonFile<LocalMaterialSeed[]>("materials.collected.json", []);
  const topicAssignments = await readJsonFile<PblMaterialTopicAssignment[]>("material-topics.seed.json", []);

  const combined = mergeMaterialTopicAssignments([...seeds, ...collected], topicAssignments);
  const dedup = new Map<string, PblMaterial>();
  combined.forEach((item) => {
    const tagDetails = buildTagDetailsFromNames(item.tags);
    const topicLinks = buildTopicLinksFromSeed(item.topics);

    dedup.set(item.id, {
      id: item.id,
      title: item.title,
      type: item.type,
      source: item.source,
      year: item.year,
      curriculumScope: resolveMaterialCurriculumScope({
        explicitScope: item.curriculumScope ?? null,
        title: item.title,
        source: item.source,
        tags: item.tags,
      }),
      tags: item.tags,
      tagDetails,
      tagsByDimension: buildTagGroups(tagDetails),
      link: item.link,
      originalContent: item.originalContent ?? item.content,
      topicLinks,
      visibility: "public",
      ownerId: null,
    });
  });

  const fallback = Array.from(dedup.values());
  publicMaterialsCache = {
    expiresAt: now + MATERIAL_CACHE_TTL_MS,
    data: fallback,
  };

  return fallback;
}

export async function loadKnowledgePoints(): Promise<PblKnowledgePoint[]> {
  const now = Date.now();
  if (knowledgePointsCache && knowledgePointsCache.expiresAt > now) {
    return knowledgePointsCache.data;
  }

  const fromDb = await loadKnowledgePointsFromDb();
  if (fromDb && fromDb.length > 0) {
    knowledgePointsCache = {
      expiresAt: now + KNOWLEDGE_CACHE_TTL_MS,
      data: fromDb,
    };
    return fromDb;
  }

  if (!allowLocalSeedFallback()) {
    throw new Error("PBL 知识点库为空，请先运行 npm run pbl:seed");
  }

  const fallback = await readJsonFile<PblKnowledgePoint[]>("knowledgepoints.seed.json", []);
  knowledgePointsCache = {
    expiresAt: now + KNOWLEDGE_CACHE_TTL_MS,
    data: fallback,
  };

  return fallback;
}
