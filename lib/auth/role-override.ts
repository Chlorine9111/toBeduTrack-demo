import { isAppRole, type AppRole } from "@/lib/auth/roles";

export const ACTIVE_ROLE_OVERRIDE_COOKIE = "deskmate-active-role";

export function parseActiveRoleOverride(value: string | null | undefined): AppRole | null {
  return isAppRole(value) ? value : null;
}

export function getRoleLandingPath(role: AppRole) {
  switch (role) {
    case "subject_teacher":
    case "admin":
    default:
      return "/main/agent";
  }
}
