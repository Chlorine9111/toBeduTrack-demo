import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import {
  renameFolder,
  deleteFolder,
  moveFolder,
} from "@/lib/content-assets/folders";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: RouteContext,
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

  try {
    const { id } = await context.params;
    const body = await request.json();

    // 重命名
    if (typeof body.name === "string") {
      const folder = await renameFolder(
        { teacherId, supabase },
        id,
        body.name,
      );
      revalidateContentAssets(teacherId);
      return NextResponse.json({ folder });
    }

    // 移动
    if (body.parentId !== undefined) {
      const newParentId =
        typeof body.parentId === "string" && body.parentId
          ? body.parentId
          : null;
      const folder = await moveFolder(
        { teacherId, supabase },
        id,
        newParentId,
      );
      revalidateContentAssets(teacherId);
      return NextResponse.json({ folder });
    }

    return jsonError("VALIDATION_ERROR", "请提供 name 或 parentId", 400);
  } catch (error) {
    if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") {
      return jsonError("NOT_FOUND", "文件夹不存在", 404);
    }
    if (
      error instanceof Error &&
      error.message === "SYSTEM_FOLDER_RENAME_BLOCKED"
    ) {
      return jsonError("FORBIDDEN", "系统文件夹不可重命名", 403);
    }
    if (
      error instanceof Error &&
      error.message === "SYSTEM_FOLDER_MOVE_BLOCKED"
    ) {
      return jsonError("FORBIDDEN", "系统文件夹不可移动", 403);
    }
    console.error("[content-assets/folders/[id]] PATCH 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "更新失败",
      500,
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
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

  try {
    const { id } = await context.params;
    await deleteFolder({ teacherId, supabase }, id);
    revalidateContentAssets(teacherId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") {
      return jsonError("NOT_FOUND", "文件夹不存在", 404);
    }
    if (
      error instanceof Error &&
      error.message === "SYSTEM_FOLDER_DELETE_BLOCKED"
    ) {
      return jsonError("FORBIDDEN", "系统文件夹不可删除", 403);
    }
    console.error("[content-assets/folders/[id]] DELETE 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "删除失败",
      500,
    );
  }
}
