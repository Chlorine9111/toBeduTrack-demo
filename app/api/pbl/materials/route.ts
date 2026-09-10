import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { loadPublicMaterials } from "@/lib/pbl/data";
import { listPrivateMaterials } from "@/lib/pbl/store";
import { searchMaterialsWithBuckets } from "@/lib/pbl/tools/search-materials";
import type { PblMaterial } from "@/lib/pbl/types";

function splitCsv(input: string | null) {
  if (!input) return [];
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const url = new URL(request.url);
    const subjects = splitCsv(url.searchParams.get("subjects"));
    const themes = splitCsv(url.searchParams.get("themes"));
    const forms = splitCsv(url.searchParams.get("forms"));
    const topic = url.searchParams.get("topic")?.trim() || undefined;
    const curriculumSystemParam = url.searchParams.get("curriculumSystem");
    const curriculumSystem =
      curriculumSystemParam === "AP" || curriculumSystemParam === "IB" || curriculumSystemParam === "CN"
        ? curriculumSystemParam
        : undefined;
    const difficultyParam = url.searchParams.get("difficulty");
    const difficulty =
      difficultyParam === "basic" || difficultyParam === "challenge" ? difficultyParam : "advanced";

    const bucketed = await searchMaterialsWithBuckets({
      subjects,
      themes,
      forms,
      topic,
      curriculumSystem,
      difficulty,
    });

    const privateMaterials = await listPrivateMaterials(contextResult.value);
    const publicMaterials = await loadPublicMaterials();
    const filterByCurriculum = (materials: PblMaterial[]) =>
      curriculumSystem
        ? materials.filter(
            (item) => item.curriculumScope === curriculumSystem || item.curriculumScope === "GENERIC",
          )
        : materials;

    const all = bucketed.materials.length > 0 ? bucketed.materials : filterByCurriculum(publicMaterials);
    const visiblePrivate = filterByCurriculum(privateMaterials);

    return NextResponse.json({
      materials: [...visiblePrivate, ...all],
      buckets: bucketed.buckets,
      privateCount: visiblePrivate.length,
      publicCount: all.length,
    });
  } catch (error) {
    console.error("PBL 素材检索失败", error);
    return jsonError("INTERNAL_ERROR", "素材检索失败", 500);
  }
}
