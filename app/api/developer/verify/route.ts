import { NextResponse } from "next/server"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"

async function buildVerifyResponse() {
  const access = await getFeedbackAdminAccess()

  return NextResponse.json(
    {
      valid: access.allowed,
      teacherId: access.teacherId,
      source: access.source,
      error: access.allowed ? null : "当前账号无反馈后台权限",
    },
    { status: access.allowed ? 200 : access.teacherId ? 403 : 401 },
  )
}

export async function GET() {
  return buildVerifyResponse()
}

export async function POST() {
  return buildVerifyResponse()
}
