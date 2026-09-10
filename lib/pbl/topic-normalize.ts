import type { PblTopicSeed } from "@/lib/pbl/topic-seeds";

export type NormalizedPblTopicSeed = {
  name: string;
  slug: string;
  aliases: string[];
  relevance: "primary" | "supporting";
};

export function slugifyTopicName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[()（）[\]【】]/g, " ")
    .replace(/[\/_,+]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeTopicSeed(topic: PblTopicSeed): NormalizedPblTopicSeed | null {
  if (typeof topic === "string") {
    const name = topic.trim();
    const slug = slugifyTopicName(name);
    if (!name || !slug) return null;

    return {
      name,
      slug,
      aliases: [],
      relevance: "primary",
    };
  }

  const name = topic.name.trim();
  const slug = slugifyTopicName(topic.slug?.trim() || topic.name);
  if (!name || !slug) return null;

  return {
    name,
    slug,
    aliases: Array.from(new Set((topic.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))),
    relevance: topic.relevance === "supporting" ? "supporting" : "primary",
  };
}
