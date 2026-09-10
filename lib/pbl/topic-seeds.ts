export type PblTopicSeed =
  | string
  | {
      name: string;
      slug?: string;
      aliases?: string[];
      relevance?: "primary" | "supporting";
    };

export type PblMaterialTopicAssignment = {
  materialId: string;
  topics: PblTopicSeed[];
};

function normalizeTopicKey(topic: PblTopicSeed) {
  if (typeof topic === "string") {
    return topic.trim().toLowerCase();
  }

  const base = topic.slug?.trim() || topic.name.trim();
  return base.toLowerCase();
}

function toTopicObject(topic: PblTopicSeed) {
  const base: {
    name: string;
    slug?: string;
    aliases: string[];
    relevance: "primary" | "supporting";
  } =
    typeof topic === "string"
      ? {
          name: topic.trim(),
          aliases: [],
          relevance: "primary",
        }
      : {
          name: topic.name.trim(),
          slug: topic.slug?.trim() || undefined,
          aliases: Array.from(new Set((topic.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))),
          relevance: topic.relevance === "supporting" ? "supporting" : "primary",
        };

  return base;
}

export function dedupeTopicSeeds(topics: PblTopicSeed[]) {
  const dedup = new Map<string, ReturnType<typeof toTopicObject>>();

  topics.forEach((topic) => {
    const key = normalizeTopicKey(topic);
    if (!key) return;

    const normalized = toTopicObject(topic);
    if (!normalized.name) return;

    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, normalized);
      return;
    }

    const merged: ReturnType<typeof toTopicObject> = {
      ...existing,
      name: existing.name.length >= normalized.name.length ? existing.name : normalized.name,
      slug: existing.slug ?? normalized.slug,
      aliases: Array.from(new Set([...existing.aliases, ...normalized.aliases])),
      relevance:
        existing.relevance === "primary" || normalized.relevance === "primary" ? "primary" : "supporting",
    };

    dedup.set(key, merged);
  });

  return Array.from(dedup.values());
}

export function mergeMaterialTopicAssignments<T extends { id: string; topics?: PblTopicSeed[] }>(
  materials: T[],
  assignments: PblMaterialTopicAssignment[],
) {
  if (assignments.length === 0) return materials;

  const topicsByMaterialId = new Map(
    assignments
      .filter((item) => item.materialId.trim().length > 0 && item.topics.length > 0)
      .map((item) => [item.materialId, dedupeTopicSeeds(item.topics)]),
  );

  return materials.map((material) => {
    const extraTopics = topicsByMaterialId.get(material.id) ?? [];
    if (extraTopics.length === 0) return material;

    const topics = dedupeTopicSeeds([...(material.topics ?? []), ...extraTopics]);
    return {
      ...material,
      topics,
    };
  });
}
