import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const { setId } = await params;

  try {
    const { data: set, error: setError } = await supabase
      .from("flashcard_sets")
      .select("*")
      .eq("id", setId)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (setError) {
      throw new Error("读取 Flashcard 集合失败");
    }

    if (!set) {
      return jsonError("NOT_FOUND", "未找到该 Flashcard 集合", 404);
    }

    const { data: cards, error: cardsError } = await supabase
      .from("flashcards")
      .select("*")
      .eq("set_id", setId)
      .order("sort_order", { ascending: true });

    if (cardsError) {
      throw new Error("读取 Flashcard 卡片失败");
    }

    return NextResponse.json({ set, cards: cards ?? [] });
  } catch (error) {
    console.error("[flashcards] 查询失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "查询失败",
      500,
    );
  }
}
