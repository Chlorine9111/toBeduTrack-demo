import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { deriveMaterialTopics, type TopicDerivationMaterial } from "@/lib/pbl/topic-derivation";
import type { PblMaterialTopicAssignment } from "@/lib/pbl/topic-seeds";

type MaterialRecord = TopicDerivationMaterial & {
  id: string;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function main() {
  const shouldWrite = process.argv.includes("--write");

  const baseDir = resolve(process.cwd(), "data", "pbl");
  const materials = readJson<MaterialRecord[]>(resolve(baseDir, "materials.collected.json"));
  const assignments: PblMaterialTopicAssignment[] = materials
    .map((material) => ({
      materialId: material.id,
      topics: deriveMaterialTopics(material),
    }))
    .filter((item) => item.topics.length > 0);

  const uniqueTopicNames = new Set(
    assignments.flatMap((item) =>
      item.topics.map((topic) => (typeof topic === "string" ? topic.trim() : topic.name.trim())).filter(Boolean),
    ),
  );

  const summary = {
    materials: materials.length,
    materialsWithTopics: assignments.length,
    topicEntries: assignments.reduce((count, item) => count + item.topics.length, 0),
    uniqueTopics: uniqueTopicNames.size,
    output: resolve(baseDir, "material-topics.seed.json"),
  };

  if (shouldWrite) {
    writeFileSync(resolve(baseDir, "material-topics.seed.json"), `${JSON.stringify(assignments, null, 2)}\n`, "utf-8");
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
