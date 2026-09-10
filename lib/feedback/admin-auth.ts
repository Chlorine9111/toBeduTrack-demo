import { getTeacherIdentity, type TeacherIdentity } from "@/lib/api/teacher-context"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

export type FeedbackAdminAccess = TeacherIdentity & {
  allowed: boolean
  source: "auth_bypass" | "auth_metadata" | "env" | "table" | null
}

const ADMIN_ROLE_VALUES = new Set(["admin", "feedback_admin"])

function hasAdminRoleInMetadata(appMetadata: TeacherIdentity["appMetadata"]) {
  if (!appMetadata || typeof appMetadata !== "object") {
    return false
  }

  const role =
    typeof appMetadata.role === "string" ? appMetadata.role.trim().toLowerCase() : null
  if (role && ADMIN_ROLE_VALUES.has(role)) {
    return true
  }

  if (appMetadata.admin === true || appMetadata.is_admin === true) {
    return true
  }

  const roles = appMetadata.roles
  if (Array.isArray(roles)) {
    return roles.some(
      (value) => typeof value === "string" && ADMIN_ROLE_VALUES.has(value.trim().toLowerCase()),
    )
  }

  return false
}

function readConfiguredFeedbackAdminIds() {
  return new Set(
    `${process.env.FEEDBACK_ADMIN_USER_IDS ?? ""}`
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function isMissingFeedbackAdminTable(error: unknown) {
  if (!error || typeof error !== "object") return false

  const code = "code" in error ? String(error.code ?? "") : ""
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : ""
  return code === "PGRST205" || message.includes("public.feedback_admins")
}

export async function getFeedbackAdminAccess(
  identity?: TeacherIdentity,
): Promise<FeedbackAdminAccess> {
  const currentIdentity = identity ?? (await getTeacherIdentity())

  if (!currentIdentity.teacherId) {
    return {
      ...currentIdentity,
      allowed: false,
      source: null,
    }
  }

  if (currentIdentity.authBypass) {
    return {
      ...currentIdentity,
      allowed: true,
      source: "auth_bypass",
    }
  }

  if (hasAdminRoleInMetadata(currentIdentity.appMetadata)) {
    return {
      ...currentIdentity,
      allowed: true,
      source: "auth_metadata",
    }
  }

  const configuredIds = readConfiguredFeedbackAdminIds()
  if (configuredIds.has(currentIdentity.teacherId)) {
    return {
      ...currentIdentity,
      allowed: true,
      source: "env",
    }
  }

  try {
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from("feedback_admins")
      .select("teacher_id")
      .eq("teacher_id", currentIdentity.teacherId)
      .maybeSingle()

    if (error) {
      if (isMissingFeedbackAdminTable(error)) {
        return {
          ...currentIdentity,
          allowed: false,
          source: null,
        }
      }
      console.error("读取反馈管理员权限失败", error)
      return {
        ...currentIdentity,
        allowed: false,
        source: null,
      }
    }

    return {
      ...currentIdentity,
      allowed: Boolean(data?.teacher_id),
      source: data?.teacher_id ? "table" : null,
    }
  } catch (error) {
    console.error("验证反馈管理员权限失败", error)
    return {
      ...currentIdentity,
      allowed: false,
      source: null,
    }
  }
}
