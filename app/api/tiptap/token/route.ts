import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { jsonError } from "@/lib/api/response";
import { createTiptapHs256Jwt } from "@/lib/tiptap/jwt";

export async function GET() {
  const { teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const secret = process.env.TIPTAP_CLOUD_AI_SECRET?.trim();
  const appId =
    process.env.NEXT_PUBLIC_TIPTAP_APP_ID?.trim() ||
    process.env.TIPTAP_APP_ID?.trim() ||
    "";

  if (!secret) {
    return jsonError("SERVICE_UNAVAILABLE", "未配置 TipTap AI 密钥", 503);
  }

  if (!appId) {
    return jsonError("SERVICE_UNAVAILABLE", "未配置 TipTap App ID", 503);
  }

  const token = createTiptapHs256Jwt({}, secret);
  return NextResponse.json({
    appId,
    token,
    expiresInSeconds: 3600,
  });
}
