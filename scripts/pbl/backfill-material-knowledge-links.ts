import { createClient } from "@supabase/supabase-js";

type MaterialRow = {
  id: string;
  display_code: string | null;
  title: string;
  source: string;
  type: "competition" | "pbl_case" | "driving_question" | "curriculum_map";
  original_content: string | null;
};

type MaterialTagRow = {
  material_id: string;
  tag_id: string;
};

type TagRow = {
  id: string;
  name: string;
};

type KnowledgePointRow = {
  id: string;
  code: string;
  curriculum_system: "AP" | "IB" | "CN";
  subject: string;
  name: string;
};

type MaterialContext = {
  id: string;
  displayCode: string;
  text: string;
  curriculum: "AP" | "IB" | "CN" | null;
  buckets: Set<string>;
};

type ScoredMatch = {
  materialId: string;
  knowledgePointId: string;
  relevance: "primary" | "supporting";
  score: number;
};

const SUBJECT_BUCKET_KEYWORDS: Record<string, string[]> = {
  math: ["calculus", "precalculus", "statistics", "mathematics", "math", "数学"],
  cs: ["computer science", "coding", "program", "计算机"],
  physics: ["physics", "mechanics", "electricity", "magnetism", "物理"],
  chemistry: ["chemistry", "化学"],
  biology: ["biology", "生态", "生物"],
  env: ["environmental", "生态", "环境"],
  english: ["english", "language", "literature", "latin", "语文", "英语"],
  history: ["history", "african american", "historical", "历史"],
  government: ["government", "politics", "公民", "政治"],
  economics: ["economics", "macroeconomics", "microeconomics", "经济"],
  geography: ["geography", "地理"],
  psychology: ["psychology", "心理"],
  arts: ["art", "music", "艺术"],
  interdisciplinary: ["seminar", "research", "project", "跨学科"],
};

function getEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function normalize(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectCurriculum(text: string, displayCode: string) {
  const lower = text.toLowerCase();

  if (displayCode.startsWith("APCED-") || /\bap\b|advanced placement|college board|ap central/.test(lower)) {
    return "AP" as const;
  }
  if (/\bib\b|international baccalaureate|ibo|diploma programme/.test(lower)) {
    return "IB" as const;
  }
  if (/课程标准|教育部|国家中小学|高中/.test(lower)) {
    return "CN" as const;
  }

  return null;
}

function detectSubjectBuckets(text: string) {
  const lower = text.toLowerCase();
  const buckets = new Set<string>();

  Object.entries(SUBJECT_BUCKET_KEYWORDS).forEach(([bucket, keywords]) => {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      buckets.add(bucket);
    }
  });

  return buckets;
}

function tokenizeName(name: string) {
  return name
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 || /[\u4e00-\u9fa5]/.test(token));
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || /Could not find the table/i.test(error.message ?? "");
}

function scoreKnowledgeMatch(material: MaterialContext, kp: KnowledgePointRow): number {
  const kpText = `${kp.code} ${kp.subject} ${kp.name}`.toLowerCase();
  const kpBuckets = detectSubjectBuckets(kpText);

  let score = 0;

  if (material.curriculum && kp.curriculum_system === material.curriculum) {
    score += 3;
  } else if (material.curriculum && kp.curriculum_system !== material.curriculum) {
    score -= 2;
  }

  if (kpBuckets.size > 0) {
    let matchedBuckets = 0;
    kpBuckets.forEach((bucket) => {
      if (material.buckets.has(bucket)) matchedBuckets += 1;
    });
    score += matchedBuckets * 3;
  }

  if (material.text.includes(kp.code.toLowerCase())) {
    score += 9;
  }

  if (material.text.includes(kp.name.toLowerCase())) {
    score += 7;
  }

  const tokenHits = tokenizeName(kp.name).filter((token) => material.text.includes(token)).length;
  score += Math.min(tokenHits, 3);

  if (
    material.curriculum === "AP" &&
    kp.curriculum_system === "AP" &&
    material.text.includes("course and exam description")
  ) {
    score += 2;
  }

  return score;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error: probeError } = await supabase
    .from("pbl_material_knowledge_points")
    .select("material_id")
    .limit(1);

  if (probeError && isMissingTableError(probeError)) {
    throw new Error(
      "Table public.pbl_material_knowledge_points is missing. Apply migration 20260305224000 first.",
    );
  }

  if (probeError && !isMissingTableError(probeError)) {
    throw new Error(`Probe pbl_material_knowledge_points failed: ${probeError.message}`);
  }

  const { data: materials, error: materialsError } = await supabase
    .from("pbl_materials")
    .select("id, display_code, title, source, type, original_content")
    .eq("visibility", "public")
    .limit(5000);

  if (materialsError || !materials) {
    throw new Error(`Load materials failed: ${materialsError?.message ?? "unknown"}`);
  }

  const typedMaterials = materials as MaterialRow[];
  const materialIds = typedMaterials.map((item) => item.id);

  const { data: links, error: linksError } = await supabase
    .from("pbl_material_tags")
    .select("material_id, tag_id")
    .in("material_id", materialIds);

  if (linksError) {
    throw new Error(`Load material tags failed: ${linksError.message}`);
  }

  const tagIds = Array.from(new Set(((links as MaterialTagRow[] | null) ?? []).map((item) => item.tag_id)));

  const { data: tags, error: tagsError } = tagIds.length
    ? await supabase.from("pbl_tags").select("id, name").in("id", tagIds)
    : { data: [] as TagRow[] | null, error: null as { message?: string } | null };

  if (tagsError) {
    throw new Error(`Load tags failed: ${tagsError.message}`);
  }

  const tagNameById = new Map((tags as TagRow[] | null)?.map((item) => [item.id, item.name]) ?? []);
  const tagNamesByMaterialId = new Map<string, string[]>();

  (links as MaterialTagRow[] | null)?.forEach((item) => {
    const list = tagNamesByMaterialId.get(item.material_id) ?? [];
    const tagName = tagNameById.get(item.tag_id);
    if (tagName) list.push(tagName);
    tagNamesByMaterialId.set(item.material_id, list);
  });

  const { data: rawKnowledgePoints, error: rawKnowledgePointsError } = await supabase
    .from("pbl_knowledge_points")
    .select("id, code, curriculum_system, subject, name")
    .limit(5000);

  if (rawKnowledgePointsError || !rawKnowledgePoints) {
    throw new Error(`Load knowledge points failed: ${rawKnowledgePointsError?.message ?? "unknown"}`);
  }

  const knowledgePoints = rawKnowledgePoints as KnowledgePointRow[];

  const materialContexts: MaterialContext[] = typedMaterials.map((item) => {
    const tagsForMaterial = tagNamesByMaterialId.get(item.id) ?? [];
    const rawText = [item.title, item.source, tagsForMaterial.join(" "), item.original_content ?? ""]
      .join(" ")
      .slice(0, 12000);

    const text = normalize(rawText);
    const displayCode = item.display_code ?? item.id;

    return {
      id: item.id,
      displayCode,
      text,
      curriculum: detectCurriculum(text, displayCode),
      buckets: detectSubjectBuckets(`${item.title} ${tagsForMaterial.join(" ")}`),
    };
  });

  const matches: ScoredMatch[] = [];

  for (const material of materialContexts) {
    const scored = knowledgePoints
      .map((kp) => ({
        kp,
        score: scoreKnowledgeMatch(material, kp),
      }))
      .filter((item) => item.score >= 6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    scored.forEach((item, index) => {
      matches.push({
        materialId: material.id,
        knowledgePointId: item.kp.id,
        relevance: index === 0 ? "primary" : "supporting",
        score: item.score,
      });
    });
  }

  if (!dryRun && matches.length > 0) {
    const payload = matches.map((item) => ({
      material_id: item.materialId,
      knowledge_point_id: item.knowledgePointId,
      relevance: item.relevance,
      created_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("pbl_material_knowledge_points")
      .upsert(payload, { onConflict: "material_id,knowledge_point_id", ignoreDuplicates: false });

    if (upsertError) {
      throw new Error(`Upsert material-knowledge links failed: ${upsertError.message}`);
    }
  }

  const materialCovered = new Set(matches.map((item) => item.materialId)).size;
  const knowledgeCovered = new Set(matches.map((item) => item.knowledgePointId)).size;

  const summary = {
    ok: true,
    dryRun,
    totalMaterials: materialContexts.length,
    totalKnowledgePoints: knowledgePoints.length,
    generatedLinks: matches.length,
    coveredMaterials: materialCovered,
    coveredKnowledgePoints: knowledgeCovered,
    primaryLinks: matches.filter((item) => item.relevance === "primary").length,
    supportingLinks: matches.filter((item) => item.relevance === "supporting").length,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
