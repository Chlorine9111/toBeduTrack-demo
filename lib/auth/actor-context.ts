import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import {
  ACTIVE_ROLE_OVERRIDE_COOKIE,
  parseActiveRoleOverride,
} from "@/lib/auth/role-override";
import {
  expandRoleAccess,
  isAppRole,
  sortRoles,
  type AppRole,
} from "@/lib/auth/roles";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  default_role: AppRole | null;
};

type MembershipRow = {
  role: AppRole;
  status: "active" | "disabled";
};

export type ActorContext = {
  userId: string | null;
  user: User | null;
  isAuthenticated: boolean;
  authBypass: boolean;
  roles: AppRole[];
  defaultRole: AppRole | null;
  activeRole: AppRole | null;
  displayName: string | null;
  email: string | null;
};

function pickString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveDisplayName(user: User | null, profile: ProfileRow | null) {
  return (
    pickString(profile?.display_name) ||
    pickString(user?.user_metadata?.display_name) ||
    pickString(user?.user_metadata?.full_name) ||
    pickString(user?.user_metadata?.name) ||
    pickString(user?.email?.split("@")[0]) ||
    null
  );
}

function resolveDefaultRole(
  roles: AppRole[],
  profileDefaultRole: AppRole | null,
  roleHint?: AppRole | null,
) {
  if (roleHint && roles.includes(roleHint)) {
    return roleHint;
  }
  if (profileDefaultRole && roles.includes(profileDefaultRole)) {
    return profileDefaultRole;
  }
  return roles[0] ?? null;
}

function resolveActiveRole(
  roles: AppRole[],
  defaultRole: AppRole | null,
  roleHint?: AppRole | null,
) {
  if (roleHint && roles.includes(roleHint)) {
    return roleHint;
  }
  if (defaultRole && roles.includes(defaultRole)) {
    return defaultRole;
  }
  return roles[0] ?? null;
}

async function inferLegacyRoles(userId: string, userEmail?: string | null) {
  const supabase = await createServerSupabaseClient();
  const roleSet = new Set<AppRole>();

  const teacherResult = await supabase.from("teachers").select("id").eq("id", userId).maybeSingle();

  if (teacherResult.data?.id) {
    roleSet.add("subject_teacher");
  }

  const adminEmails = new Set(
    `${process.env.DESKMATE_ADMIN_EMAILS ?? ""}`
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  if (userEmail && adminEmails.has(userEmail.toLowerCase())) {
    roleSet.add("admin");
  }

  return sortRoles(expandRoleAccess(Array.from(roleSet)));
}

async function readProfileAndMembershipsWithClient(
  supabase:
    | Awaited<ReturnType<typeof createServerSupabaseClient>>
    | ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
) {
  const [profileResult, membershipResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id,display_name,email,default_role")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_role_memberships")
      .select("role,status")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const missingProfileTable =
    profileResult.error &&
    /relation .*user_profiles.* does not exist/i.test(profileResult.error.message);
  const missingMembershipTable =
    membershipResult.error &&
    /relation .*user_role_memberships.* does not exist/i.test(membershipResult.error.message);

  return {
    profile: missingProfileTable ? null : ((profileResult.data ?? null) as ProfileRow | null),
    memberships: missingMembershipTable
      ? []
      : ((membershipResult.data ?? []) as MembershipRow[]),
    missingRoleTables: Boolean(missingProfileTable || missingMembershipTable),
  };
}

async function readProfileAndMemberships(userId: string) {
  const supabase = await createServerSupabaseClient();
  return readProfileAndMembershipsWithClient(supabase, userId);
}

async function buildBypassActorContext(params: {
  userId: string | null;
  bypassRole: AppRole;
  roleOverride: AppRole | null;
}): Promise<ActorContext> {
  if (!params.userId) {
    const roles = sortRoles(expandRoleAccess([params.bypassRole]));
    return {
      userId: null,
      user: null,
      isAuthenticated: false,
      authBypass: true,
      roles,
      defaultRole: params.bypassRole,
      activeRole: resolveActiveRole(roles, params.bypassRole, params.roleOverride),
      displayName: "Auth Bypass User",
      email: null,
    };
  }

  const admin = createAdminSupabaseClient();
  const { profile, memberships } = await readProfileAndMembershipsWithClient(admin, params.userId);

  const rolesFromMemberships = sortRoles(
    expandRoleAccess(
      memberships
        .map((membership) => membership.role)
        .filter((role): role is AppRole => isAppRole(role)),
    ),
  );

  const roles =
    rolesFromMemberships.length > 0
      ? rolesFromMemberships
      : sortRoles(expandRoleAccess([params.bypassRole]));
  const defaultRole = resolveDefaultRole(
    roles,
    profile?.default_role && isAppRole(profile.default_role) ? profile.default_role : params.bypassRole,
  );

  return {
    userId: params.userId,
    user: null,
    isAuthenticated: true,
    authBypass: true,
    roles,
    defaultRole,
    activeRole: resolveActiveRole(roles, defaultRole, params.roleOverride),
    displayName: pickString(profile?.display_name) ?? "Auth Bypass User",
    email: profile?.email ?? null,
  };
}

export async function getActorContext(params?: {
  roleHint?: string | null;
}): Promise<ActorContext> {
  const authBypass = isAuthBypassEnabled();
  const hintedRole = isAppRole(params?.roleHint) ? params?.roleHint : null;
  const cookieStore = await cookies();
  const cookieRoleOverride = parseActiveRoleOverride(
    cookieStore.get(ACTIVE_ROLE_OVERRIDE_COOKIE)?.value,
  );
  const roleOverride = hintedRole ?? cookieRoleOverride;

  if (authBypass) {
    const userId = `${process.env.AUTH_BYPASS_USER_ID ?? ""}`.trim() || null;
    const bypassRole = isAppRole(process.env.AUTH_BYPASS_ROLE)
      ? process.env.AUTH_BYPASS_ROLE
      : "subject_teacher";
    return buildBypassActorContext({
      userId,
      bypassRole,
      roleOverride,
    });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      user: null,
      isAuthenticated: false,
      authBypass: false,
      roles: [],
      defaultRole: null,
      activeRole: null,
      displayName: null,
      email: null,
    };
  }

  const { profile, memberships, missingRoleTables } = await readProfileAndMemberships(user.id);

  let roles = sortRoles(
    expandRoleAccess(
      memberships
        .map((membership) => membership.role)
        .filter((role): role is AppRole => isAppRole(role)),
    ),
  );

  if (roles.length === 0 || missingRoleTables) {
    roles = await inferLegacyRoles(user.id, user.email ?? profile?.email ?? null);
  }

  const defaultRole = resolveDefaultRole(
    roles,
    profile?.default_role && isAppRole(profile.default_role) ? profile.default_role : null,
    hintedRole,
  );

  return {
    userId: user.id,
    user,
    isAuthenticated: true,
    authBypass: false,
    roles,
    defaultRole,
    activeRole: resolveActiveRole(roles, defaultRole, roleOverride),
    displayName: deriveDisplayName(user, profile),
    email: user.email ?? profile?.email ?? null,
  };
}
