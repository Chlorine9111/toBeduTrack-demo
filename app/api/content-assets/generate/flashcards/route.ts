import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { generateFlashcards } from "@/lib/content-assets/generate/flashcards";

export async function POST(request: Request) {
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = await request.json();
    const sourceAssetIds: unknown = body.sourceAssetIds;
    const count: unknown = body.count;
    const title: unknown = body.title;

    if (
      !Array.isArray(sourceAssetIds) ||
      sourceAssetIds.length === 0 ||
      !sourceAssetIds.every((id) => typeof id === "string")
    ) {
      return jsonError("VALIDATION_ERROR", "sourceAssetIds 必须为非空字符串数组", 400);
    }

    const result = await generateFlashcards({
      teacherId,
      sourceAssetIds: sourceAssetIds as string[],
      count: typeof count === "number" && count > 0 ? count : undefined,
      title: typeof title === "string" && title.trim() ? title.trim() : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[flashcards] 生成失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Flashcard 生成失败",
      500,
    );
  }
}
