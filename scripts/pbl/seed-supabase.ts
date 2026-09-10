import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { normalizeTopicSeed } from "@/lib/pbl/topic-normalize";
import {
  mergeMaterialTopicAssignments,
  type PblMaterialTopicAssignment,
  type PblTopicSeed,
} from "@/lib/pbl/topic-seeds";

type MaterialSeed = {
  id: string;
  title: string;
  type: "competition" | "pbl_case" | "driving_question" | "curriculum_map";
  source: string;
  year: number;
  curriculumScope?: "AP" | "IB" | "CN" | "GENERIC";
  tags: string[];
  topics?: PblTopicSeed[];
  link: string;
  content?: string;
  originalContent?: string;
};

type KnowledgePointSeed = {
  code: string;
  curriculumSystem: "AP" | "IB" | "CN";
  subject: string;
  hierarchyLabel: string;
  name: string;
  description?: string;
  projectPotential: "high" | "medium" | "low";
};

type CrossAlignmentSeed = {
  ap?: string;
  ib?: string;
  cn?: string;
  alignment: "high" | "partial" | "none";
};

type MaterialRow = {
  id: string;
  display_code: string;
};

type TagRow = {
  id: string;
  dimension: "A" | "B" | "C" | "D";
  name: string;
};

type TopicRow = {
  id: string;
  slug: string;
  name: string;
};

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const dedup = new Map<string, T>();

  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  });

  return Array.from(dedup.values());
}

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

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function readJsonOr<T>(filePath: string, fallback: T): T {
  try {
    return readJson<T>(filePath);
  } catch {
    return fallback;
  }
}

function getEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function resolveDimension(tag: string): "A" | "B" | "C" | "D" {
  if (SUBJECT_TAGS.has(tag)) return "A";
  if (FORM_TAGS.has(tag)) return "B";
  if (THEME_TAGS.has(tag)) return "C";
  if (COGNITIVE_TAGS.has(tag)) return "D";
  return "C";
}

function deriveSubjectAbbr(code: string) {
  const parts = code.split("-");
  if (parts.length >= 2) {
    return parts[1] ?? "GEN";
  }
  return "GEN";
}

function deriveLevel(code: string, system: "AP" | "IB" | "CN") {
  if (system === "IB") {
    const parts = code.split("-");
    return parts[2] ?? null;
  }
  if (system === "CN") {
    const parts = code.split("-");
    return parts[2] ?? null;
  }
  return null;
}

function composeOriginalContent(material: MaterialSeed) {
  const candidate = material.originalContent?.trim() || material.content?.trim();
  if (candidate && candidate.length >= 80) {
    return candidate;
  }

  return [
    `素材标题：${material.title}`,
    `来源机构：${material.source}`,
    `发布时间：${material.year}`,
    `资源类型：${material.type}`,
    `标签：${material.tags.join("、")}`,
    `原始链接：${material.link}`,
    `摘要：该素材可用于教师项目生成中的“背景证据 + 任务设定 + 评价依据”环节，建议结合标签（${material.tags.join(" / ")}）进行项目化设计。`,
  ].join("\n\n");
}

function inferMaterialCurriculumScope(material: MaterialSeed): "AP" | "IB" | "CN" | "GENERIC" {
  if (material.curriculumScope) return material.curriculumScope;

  const text = `${material.title} ${material.source} ${material.tags.join(" ")}`.toLowerCase();
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
  ) as Array<"AP" | "IB" | "CN">;

  if (matches.length === 1) return matches[0];
  return "GENERIC";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const baseDir = resolve(process.cwd(), "data", "pbl");
  const collectedMaterials = readJson<MaterialSeed[]>(resolve(baseDir, "materials.collected.json"));
  const topicAssignments = readJsonOr<PblMaterialTopicAssignment[]>(
    resolve(baseDir, "material-topics.seed.json"),
    [],
  );
  const materials = mergeMaterialTopicAssignments(collectedMaterials, topicAssignments);
  const knowledgePoints = readJson<KnowledgePointSeed[]>(resolve(baseDir, "knowledgepoints.seed.json"));
  const crossAlign = readJson<CrossAlignmentSeed[]>(
    resolve(baseDir, "cross-system-alignment.seed.json"),
  );

  if (dryRun) {
    const normalizedTopics = materials.flatMap((item) => (item.topics ?? []).map(normalizeTopicSeed).filter(Boolean));
    const uniqueTopicSlugs = new Set(normalizedTopics.map((item) => item?.slug));
    const aliasRows = dedupeByKey(
      normalizedTopics.flatMap((item) =>
        (item?.aliases ?? []).map((alias) => ({
          slug: item?.slug ?? "",
          alias,
        })),
      ),
      (item) => `${item.slug}:::${item.alias.toLowerCase()}`,
    );
    const aliasCount = aliasRows.length;
    const materialsWithTopics = materials.filter((item) => (item.topics ?? []).length > 0).length;

    console.log(
      JSON.stringify(
        {
          dryRun: true,
          materials: materials.length,
          materialsWithTopics,
          topicEntries: normalizedTopics.length,
          uniqueTags: Array.from(new Set(materials.flatMap((item) => item.tags))).length,
          uniqueTopics: uniqueTopicSlugs.size,
          topicAliases: aliasCount,
          knowledgePoints: knowledgePoints.length,
          crossAlignments: crossAlign.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const materialPayload = materials.map((item) => ({
    display_code: item.id,
    title: item.title,
    type: item.type,
    source: item.source,
    year: item.year,
    curriculum_scope: inferMaterialCurriculumScope(item),
    difficulty: "standard_hs",
    original_content: composeOriginalContent(item),
    driving_question: null,
    downgrade_suggestion: null,
    url: item.link,
    visibility: "public",
    owner_id: null,
    quality_score: 4,
    updated_at: new Date().toISOString(),
  }));

  const { data: materialRows, error: materialError } = await supabase
    .from("pbl_materials")
    .upsert(materialPayload, { onConflict: "display_code", ignoreDuplicates: false })
    .select("id, display_code");

  if (materialError) {
    throw new Error(`Upsert materials failed: ${materialError.message}`);
  }

  const typedMaterialRows = (materialRows ?? []) as MaterialRow[];
  const materialIdByCode = new Map(typedMaterialRows.map((row) => [row.display_code, row.id]));

  const uniqueTags = Array.from(new Set(materials.flatMap((item) => item.tags)));
  const tagPayload = uniqueTags.map((name) => ({
    dimension: resolveDimension(name),
    name,
    description: null,
  }));

  const { data: tagRows, error: tagError } = await supabase
    .from("pbl_tags")
    .upsert(tagPayload, { onConflict: "dimension,name", ignoreDuplicates: false })
    .select("id, dimension, name");

  if (tagError) {
    throw new Error(`Upsert tags failed: ${tagError.message}`);
  }

  const typedTagRows = (tagRows ?? []) as TagRow[];
  const tagIdByKey = new Map(typedTagRows.map((row) => [`${row.dimension}:${row.name}`, row.id]));

  const materialTagPayload = materials.flatMap((material) => {
    const materialId = materialIdByCode.get(material.id);
    if (!materialId) return [];

    return material.tags
      .map((tag) => {
        const key = `${resolveDimension(tag)}:${tag}`;
        const tagId = tagIdByKey.get(key);
        if (!tagId) return null;

        return {
          material_id: materialId,
          tag_id: tagId,
        };
      })
      .filter((item): item is { material_id: string; tag_id: string } => Boolean(item));
  });

  if (materialTagPayload.length > 0) {
    const { error: linkError } = await supabase
      .from("pbl_material_tags")
      .upsert(materialTagPayload, { onConflict: "material_id,tag_id", ignoreDuplicates: false });

    if (linkError) {
      throw new Error(`Upsert material tags failed: ${linkError.message}`);
    }
  }

  const normalizedMaterialTopics = materials.flatMap((material) => {
    const materialId = materialIdByCode.get(material.id);
    if (!materialId) return [];

    return (material.topics ?? [])
      .map((topic) => {
        const normalized = normalizeTopicSeed(topic);
        if (!normalized) return null;

        return {
          materialId,
          ...normalized,
        };
      })
      .filter(
        (
          item,
        ): item is {
          materialId: string;
          name: string;
          slug: string;
          aliases: string[];
          relevance: "primary" | "supporting";
        } => Boolean(item),
      );
  });

  const uniqueTopics = Array.from(
    normalizedMaterialTopics.reduce((map, item) => {
      if (!map.has(item.slug)) {
        map.set(item.slug, {
          slug: item.slug,
          name: item.name,
          description: null,
        });
      }
      return map;
    }, new Map<string, { slug: string; name: string; description: null }>()),
  ).map((entry) => entry[1]);

  let topicRowsBySlug = new Map<string, TopicRow>();

  if (uniqueTopics.length > 0) {
    const { data: topicRows, error: topicError } = await supabase
      .from("pbl_topics")
      .upsert(uniqueTopics, { onConflict: "slug", ignoreDuplicates: false })
      .select("id, slug, name");

    if (topicError) {
      throw new Error(`Upsert topics failed: ${topicError.message}`);
    }

    topicRowsBySlug = new Map(((topicRows ?? []) as TopicRow[]).map((row) => [row.slug, row]));

    const topicAliasPayload = dedupeByKey(
      normalizedMaterialTopics.flatMap((item) => {
        const topicRow = topicRowsBySlug.get(item.slug);
        if (!topicRow) return [];

        return item.aliases.map((alias) => ({
          topic_id: topicRow.id,
          alias,
        }));
      }),
      (item) => `${item.topic_id}:::${item.alias.toLowerCase()}`,
    );

    if (topicAliasPayload.length > 0) {
      const { error: aliasError } = await supabase
        .from("pbl_topic_aliases")
        .upsert(topicAliasPayload, { onConflict: "topic_id,alias", ignoreDuplicates: false });

      if (aliasError) {
        throw new Error(`Upsert topic aliases failed: ${aliasError.message}`);
      }
    }

    const materialTopicPayload = dedupeByKey(
      normalizedMaterialTopics.flatMap((item) => {
        const topicRow = topicRowsBySlug.get(item.slug);
        if (!topicRow) return [];

        return [
          {
            material_id: item.materialId,
            topic_id: topicRow.id,
            relevance: item.relevance,
          },
        ];
      }),
      (item) => `${item.material_id}:::${item.topic_id}`,
    );

    if (materialTopicPayload.length > 0) {
      const { error: materialTopicError } = await supabase
        .from("pbl_material_topics")
        .upsert(materialTopicPayload, { onConflict: "material_id,topic_id", ignoreDuplicates: false });

      if (materialTopicError) {
        throw new Error(`Upsert material topics failed: ${materialTopicError.message}`);
      }
    }
  }

  const knowledgePayload = knowledgePoints.map((item) => ({
    code: item.code,
    curriculum_system: item.curriculumSystem,
    subject: item.subject,
    subject_abbr: deriveSubjectAbbr(item.code),
    level: deriveLevel(item.code, item.curriculumSystem),
    parent_id: null,
    depth: 2,
    hierarchy_label: item.hierarchyLabel,
    name: item.name,
    description: item.description ?? null,
    project_potential: item.projectPotential,
  }));

  const { error: kpError } = await supabase
    .from("pbl_knowledge_points")
    .upsert(knowledgePayload, { onConflict: "code", ignoreDuplicates: false });

  if (kpError) {
    throw new Error(`Upsert knowledge points failed: ${kpError.message}`);
  }

  const alignPayload = crossAlign.map((item) => ({
    fingerprint: `${item.ap ?? ""}|${item.ib ?? ""}|${item.cn ?? ""}`,
    ap_code: item.ap ?? null,
    ib_code: item.ib ?? null,
    cn_code: item.cn ?? null,
    alignment_degree: item.alignment,
    notes: null,
  }));

  if (alignPayload.length > 0) {
    const { error: alignError } = await supabase
      .from("pbl_cross_system_alignments")
      .upsert(alignPayload, { onConflict: "fingerprint", ignoreDuplicates: false });

    if (alignError) {
      throw new Error(`Upsert alignments failed: ${alignError.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        materials: materials.length,
        tags: uniqueTags.length,
        materialTagLinks: materialTagPayload.length,
        topics: uniqueTopics.length,
        materialTopicLinks: normalizedMaterialTopics.length,
        knowledgePoints: knowledgePoints.length,
        alignments: alignPayload.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
