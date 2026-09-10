import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { jsonError } from "@/lib/api/response";
import { createTiptapHs256Jwt } from "@/lib/tiptap/jwt";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const aiSecret = process.env.TIPTAP_CLOUD_AI_SECRET?.trim();
  const convertSecret = process.env.TIPTAP_CONVERT_SECRET?.trim();
  const appId =
    process.env.NEXT_PUBLIC_TIPTAP_APP_ID?.trim() ||
    process.env.TIPTAP_APP_ID?.trim() ||
    "";

  if (!aiSecret) {
    return jsonError("SERVICE_UNAVAILABLE", "未配置 Tiptap AI Secret", 503);
  }

  if (!appId) {
    return jsonError("SERVICE_UNAVAILABLE", "未配置 Tiptap App ID", 503);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = createTiptapHs256Jwt(
    { sub: teacherId },
    aiSecret,
    60 * 60,
  );

  const convertToken = convertSecret
    ? createTiptapHs256Jwt({ sub: teacherId }, convertSecret, 60 * 60)
    : null;

  return NextResponse.json(
    {
      token,
      convertToken,
      appId: appId || null,
      expiresAt: now + 60 * 60,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    },
  );
}
