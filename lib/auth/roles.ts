export const APP_ROLES = [
  "subject_teacher",
  "admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const SUBJECT_TEACHER_ACCESS_ROLES: AppRole[] = ["subject_teacher", "admin"];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function expandRoleAccess(roles: AppRole[]): AppRole[] {
  const expanded = new Set<AppRole>(roles);
  if (expanded.has("admin")) {
    expanded.add("subject_teacher");
  }
  return Array.from(expanded);
}

export function getRolePriority(role: AppRole) {
  switch (role) {
    case "admin":
      return 0;
    case "subject_teacher":
      return 1;
    default:
      return 99;
  }
}

export function sortRoles(roles: AppRole[]) {
  return [...roles].sort((left, right) => getRolePriority(left) - getRolePriority(right));
}

export function getRoleLabel(role: AppRole, locale: "zh" | "en" = "zh") {
  const labels: Record<AppRole, { zh: string; en: string }> = {
    subject_teacher: { zh: "教师", en: "Teacher" },
    admin: { zh: "管理员", en: "Admin" },
  };
  return labels[role][locale];
}
