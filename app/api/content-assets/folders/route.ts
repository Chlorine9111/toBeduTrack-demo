import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import {
  listFolders,
  createFolder,
  ensureDefaultFolders,
} from "@/lib/content-assets/folders";

export async function GET() {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const folders = await listFolders({ teacherId, supabase });

    // 首次使用（无文件夹）时才创建默认文件夹
    if (folders.length === 0) {
      await ensureDefaultFolders({ teacherId, supabase });
      const refreshed = await listFolders({ teacherId, supabase });
      return NextResponse.json({ folders: refreshed });
    }

    return NextResponse.json({ folders }, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("[content-assets/folders] GET 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "查询失败",
      500,
    );
  }
}

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
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
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return jsonError("VALIDATION_ERROR", "文件夹名称不能为空", 400);
    }

    const parentId =
      typeof body.parentId === "string" && body.parentId
        ? body.parentId
        : null;

    const folder = await createFolder(
      { teacherId, supabase },
      { name, parentId },
    );

    revalidateContentAssets(teacherId);

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    console.error("[content-assets/folders] POST 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "创建失败",
      500,
    );
  }
}
