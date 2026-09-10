import { createClient } from "@supabase/supabase-js";
import { normalizeTopicSeed } from "@/lib/pbl/topic-normalize";
import { deriveMaterialTopics } from "@/lib/pbl/topic-derivation";

type MaterialRow = {
  id: string;
  display_code: string | null;
  title: string;
  source: string | null;
  type: "competition" | "pbl_case" | "driving_question" | "curriculum_map";
  original_content: string | null;
};

type MaterialTopicLinkRow = {
  material_id: string;
  topic_id: string;
};

type TopicRow = {
  id: string;
  slug: string;
  name: string;
};

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const dedup = new Map<string, T>();

  items.forEach((item) => {
    const key = getKey(item);
    if (!key || dedup.has(key)) return;
    dedup.set(key, item);
  });

  return Array.from(dedup.values());
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const replaceExisting = process.argv.includes("--replace-existing");

  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: materials, error: materialsError } = await supabase
    .from("pbl_materials")
    .select("id, display_code, title, source, type, original_content")
    .eq("visibility", "public")
    .like("display_code", "APCED-%")
    .limit(5000);

  if (materialsError || !materials) {
    throw new Error(`Load APCED materials failed: ${materialsError?.message ?? "unknown"}`);
  }

  const typedMaterials = materials as MaterialRow[];
  const materialIds = typedMaterials.map((item) => item.id);

  const { data: existingLinks, error: existingLinksError } = materialIds.length
    ? await supabase.from("pbl_material_topics").select("material_id, topic_id").in("material_id", materialIds)
    : { data: [] as MaterialTopicLinkRow[] | null, error: null as { message?: string } | null };

  if (existingLinksError) {
    throw new Error(`Load existing material topics failed: ${existingLinksError.message}`);
  }

  const linkedMaterialIds = new Set(
    ((existingLinks ?? []) as MaterialTopicLinkRow[]).map((item) => item.material_id),
  );

  const materialsMissingTopics = typedMaterials.filter((item) => !linkedMaterialIds.has(item.id));
  const targetMaterials = replaceExisting ? typedMaterials : materialsMissingTopics;

  const normalizedMaterialTopics = targetMaterials.flatMap((material) =>
    deriveMaterialTopics({
      title: material.title,
      type: material.type,
      source: material.source ?? undefined,
      originalContent: material.original_content ?? undefined,
    })
      .map((topic) => {
        const normalized = normalizeTopicSeed(topic);
        if (!normalized) return null;

        return {
          materialId: material.id,
          displayCode: material.display_code ?? material.id,
          title: material.title,
          ...normalized,
        };
      })
      .filter(
        (
          item,
        ): item is {
          materialId: string;
          displayCode: string;
          title: string;
          name: string;
          slug: string;
          aliases: string[];
          relevance: "primary" | "supporting";
        } => Boolean(item),
      ),
  );

  const backfilledMaterialIds = new Set(normalizedMaterialTopics.map((item) => item.materialId));
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

  const materialPreview = Array.from(
    normalizedMaterialTopics.reduce((map, item) => {
      const current = map.get(item.materialId) ?? {
        displayCode: item.displayCode,
        title: item.title,
        topics: [] as string[],
      };

      if (!current.topics.includes(item.name)) {
        current.topics.push(item.name);
      }

      map.set(item.materialId, current);
      return map;
    }, new Map<string, { displayCode: string; title: string; topics: string[] }>()),
  )
    .slice(0, 8)
    .map(([, item]) => item);

  const summary = {
    dryRun,
    replaceExisting,
    apcedMaterials: typedMaterials.length,
    missingBefore: materialsMissingTopics.length,
    materialsTargeted: targetMaterials.length,
    materialsBackfilled: backfilledMaterialIds.size,
    skippedWithoutTopics: targetMaterials.length - backfilledMaterialIds.size,
    topicsUpserted: uniqueTopics.length,
    topicAliasesUpserted: dedupeByKey(
      normalizedMaterialTopics.flatMap((item) =>
        item.aliases.map((alias) => ({
          slug: item.slug,
          alias,
        })),
      ),
      (item) => `${item.slug}:::${item.alias.toLowerCase()}`,
    ).length,
    materialTopicLinksUpserted: dedupeByKey(
      normalizedMaterialTopics.map((item) => ({
        material_id: item.materialId,
        topic_slug: item.slug,
      })),
      (item) => `${item.material_id}:::${item.topic_slug}`,
    ).length,
    sample: materialPreview,
  };

  if (dryRun || normalizedMaterialTopics.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (replaceExisting && targetMaterials.length > 0) {
    const { error: deleteError } = await supabase
      .from("pbl_material_topics")
      .delete()
      .in(
        "material_id",
        targetMaterials.map((item) => item.id),
      );

    if (deleteError) {
      throw new Error(`Delete APCED material topics failed: ${deleteError.message}`);
    }
  }

  const { data: topicRows, error: topicError } = await supabase
    .from("pbl_topics")
    .upsert(uniqueTopics, { onConflict: "slug", ignoreDuplicates: false })
    .select("id, slug, name");

  if (topicError) {
    throw new Error(`Upsert APCED topics failed: ${topicError.message}`);
  }

  const topicRowsBySlug = new Map(((topicRows ?? []) as TopicRow[]).map((row) => [row.slug, row]));

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
      throw new Error(`Upsert APCED topic aliases failed: ${aliasError.message}`);
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
      throw new Error(`Upsert APCED material topics failed: ${materialTopicError.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        replaceExisting,
        apcedMaterials: typedMaterials.length,
        missingBefore: materialsMissingTopics.length,
        materialsTargeted: targetMaterials.length,
        materialsBackfilled: backfilledMaterialIds.size,
        skippedWithoutTopics: targetMaterials.length - backfilledMaterialIds.size,
        topicsUpserted: uniqueTopics.length,
        topicAliasesUpserted: topicAliasPayload.length,
        materialTopicLinksUpserted: materialTopicPayload.length,
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
