import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type AppSupabaseClient = SupabaseClient<Database>;
type TeacherInsert = Database["public"]["Tables"]["teachers"]["Insert"];

type UserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class EnsureTeacherError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const ENSURE_TEACHER_CACHE_TTL_MS = 60_000;
const ensuredTeacherCache = new Map<string, number>();
const ensuredTeacherInflight = new Map<string, Promise<void>>();

function buildEnsureTeacherCacheKey(teacherId: string, isBypass: boolean) {
  return `${isBypass ? "bypass" : "user"}:${teacherId}`;
}

function readEnsuredTeacherCache(key: string) {
  const expiresAt = ensuredTeacherCache.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    ensuredTeacherCache.delete(key);
    return false;
  }
  return true;
}

function writeEnsuredTeacherCache(key: string) {
  ensuredTeacherCache.set(key, Date.now() + ENSURE_TEACHER_CACHE_TTL_MS);
}

async function withEnsuredTeacherCache(key: string, task: () => Promise<void>) {
  if (readEnsuredTeacherCache(key)) {
    return;
  }

  const inflight = ensuredTeacherInflight.get(key);
  if (inflight) {
    await inflight;
    return;
  }

  const next = task()
    .then(() => {
      writeEnsuredTeacherCache(key);
    })
    .finally(() => {
      ensuredTeacherInflight.delete(key);
    });

  ensuredTeacherInflight.set(key, next);
  await next;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => pickString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 10);
}

function pickMetadataValue(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = pickString(metadata[key]);
    if (value) return value;
  }
  return null;
}

function buildTeacherInsert(user: UserLike | null, teacherId: string): TeacherInsert {
  const metadata = user?.user_metadata ?? undefined;
  const insertData: TeacherInsert = { id: teacherId };

  const fullName = pickMetadataValue(metadata, ["full_name", "name"]);
  const displayName = pickMetadataValue(metadata, [
    "display_name",
    "preferred_name",
    "name",
  ]);
  const avatarUrl = pickMetadataValue(metadata, ["avatar_url", "picture"]);
  const schoolName = pickMetadataValue(metadata, ["school_name"]);
  const roleTitle = pickMetadataValue(metadata, ["role_title", "job_title"]);
  const teachingSubjects = pickStringArray(metadata?.teaching_subjects);

  if (fullName) insertData.full_name = fullName;
  if (displayName) insertData.display_name = displayName;
  if (avatarUrl) insertData.avatar_url = avatarUrl;
  if (schoolName) insertData.school_name = schoolName;
  if (roleTitle) insertData.role_title = roleTitle;
  if (teachingSubjects.length > 0) insertData.teaching_subjects = teachingSubjects;

  return insertData;
}

function buildBypassUserLike(teacherId: string): UserLike {
  return {
    id: teacherId,
    email: `auth-bypass+${teacherId}@local.deskmate.dev`,
    user_metadata: {
      full_name: "Auth Bypass Teacher",
      display_name: "Auth Bypass Teacher",
      school_name: "Local Verification School",
      role_title: "Teacher",
      teaching_subjects: ["AP"],
      auth_bypass: true,
    },
  };
}

async function ensureBypassAuthUser(admin: AppSupabaseClient, teacherId: string) {
  const bypassUser = buildBypassUserLike(teacherId);
  const bypassEmail = `auth-bypass+${teacherId}@local.deskmate.dev`;

  try {
    const { data, error } = await admin.auth.admin.getUserById(teacherId);
    if (data?.user) {
      return bypassUser;
    }
    if (error && !/user not found/i.test(error.message)) {
      console.warn("ensureTeacher: bypass 模式读取 auth 用户失败，继续尝试创建。", error);
    }
  } catch (error) {
    console.warn("ensureTeacher: bypass 模式读取 auth 用户异常，继续尝试创建。", error);
  }

  try {
    const { error: createError } = await admin.auth.admin.createUser({
      id: teacherId,
      email: bypassEmail,
      password: `Bypass-${teacherId.slice(0, 8)}-Teacher!`,
      email_confirm: true,
      user_metadata: bypassUser.user_metadata,
    });
    if (
      createError &&
      !/already exists|already registered|duplicate/i.test(createError.message)
    ) {
      console.warn("ensureTeacher: bypass 模式创建 auth 用户失败。", createError);
    }
  } catch (error) {
    console.warn("ensureTeacher: bypass 模式创建 auth 用户异常。", error);
  }

  return bypassUser;
}

export async function ensureTeacher(params: {
  supabase: AppSupabaseClient;
  user: UserLike | null;
  authBypass: boolean;
}): Promise<{
  teacherId: string;
  supabase: AppSupabaseClient;
  isBypass: boolean;
}> {
  const { supabase, user, authBypass } = params;
  const isE2E = process.env.E2E_TEST === "1";

  if (authBypass) {
    const teacherId = process.env.AUTH_BYPASS_USER_ID;
    if (!teacherId) {
      throw new EnsureTeacherError("AUTH_BYPASS_USER_ID 未配置", 500);
    }
    if (!UUID_REGEX.test(teacherId)) {
      throw new EnsureTeacherError("AUTH_BYPASS_USER_ID 格式不合法", 500);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      if (isE2E) {
        console.warn("ensureTeacher: E2E 环境未配置 SUPABASE_SERVICE_ROLE_KEY，跳过教师表校验。");
        return { teacherId, supabase, isBypass: true };
      }
      throw new EnsureTeacherError("SUPABASE_SERVICE_ROLE_KEY 未配置", 500);
    }

    const admin = createAdminSupabaseClient();
    const cacheKey = buildEnsureTeacherCacheKey(teacherId, true);

    if (readEnsuredTeacherCache(cacheKey)) {
      return { teacherId, supabase: admin, isBypass: true };
    }

    const bypassUser = await ensureBypassAuthUser(admin, teacherId);

    try {
      await withEnsuredTeacherCache(cacheKey, async () => {
        const { data: existing, error: selectError } = await admin
          .from("teachers")
          .select("id")
          .eq("id", teacherId)
          .maybeSingle();

        if (selectError) {
          throw selectError;
        }

        if (!existing) {
          const insertData = buildTeacherInsert(bypassUser, teacherId);
          const { error: insertError } = await admin
            .from("teachers")
            .insert(insertData);

          if (insertError && insertError.code !== "23505") {
            throw insertError;
          }
        }
      });
    } catch (error) {
      console.warn("ensureTeacher: bypass 模式教师校验失败，降级放行。", error);
    }

    return { teacherId, supabase: admin, isBypass: true };
  }

  if (!user) {
    throw new EnsureTeacherError("未登录", 401);
  }

  const cacheKey = buildEnsureTeacherCacheKey(user.id, false);

  await withEnsuredTeacherCache(cacheKey, async () => {
    const { data: existing, error: selectError } = await supabase
      .from("teachers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (selectError) {
      throw new EnsureTeacherError("读取教师信息失败", 500);
    }

    if (!existing) {
      const insertData = buildTeacherInsert(user, user.id);
      const { error: insertError } = await supabase
        .from("teachers")
        .insert(insertData);

      if (insertError && insertError.code !== "23505") {
        throw new EnsureTeacherError("创建教师信息失败", 500);
      }
    }
  });

  return { teacherId: user.id, supabase, isBypass: false };
}
