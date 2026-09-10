import type { AppRole } from "@/lib/auth/roles";
import { getRoleLabel } from "@/lib/auth/roles";

export type ShellIconKey =
  | "plus"
  | "folder-open"
  | "database"
  | "message-square-text"
  | "file-text"
  | "graduation-cap"
  | "layout-dashboard";

export type ShellNavItem = {
  id: string;
  href: string;
  matchPrefix: string;
  label: {
    zh: string;
    en: string;
  };
  icon: ShellIconKey;
  testId: string;
  tourId?: string;
  mobile: boolean;
  roles: AppRole[];
};

export type ShellNavigationState = {
  primaryItems: ShellNavItem[];
  mobileItems: ShellNavItem[];
  actorLabel: {
    zh: string;
    en: string;
  } | null;
  showQuota: boolean;
};

function resolveNavigationRoles(roles: AppRole[], activeRole: AppRole | null) {
  if (activeRole === "subject_teacher") {
    return ["subject_teacher"] satisfies AppRole[];
  }

  return Array.from(
    new Set(
      roles.filter((role) => role === "subject_teacher" || role === "admin"),
    ),
  );
}

const NAV_ITEMS: ShellNavItem[] = [
  {
    id: "new-chat",
    href: "/main/agent",
    matchPrefix: "__never_match__",
    label: { zh: "新建对话", en: "New chat" },
    icon: "plus",
    testId: "sidebar-nav-new-chat",
    tourId: "nav-new-chat",
    mobile: false,
    roles: ["subject_teacher", "admin"],
  },
  {
    id: "content-assets",
    href: "/main/content-assets",
    matchPrefix: "/main/content-assets",
    label: { zh: "内容库", en: "Assets" },
    icon: "folder-open",
    testId: "sidebar-nav-content-assets",
    tourId: "nav-content-assets",
    mobile: true,
    roles: ["subject_teacher", "admin"],
  },
  {
    id: "question-bank",
    href: "/main/question-bank",
    matchPrefix: "/main/question-bank",
    label: { zh: "题库", en: "Question Bank" },
    icon: "database",
    testId: "sidebar-nav-question-bank",
    tourId: "nav-question-bank",
    mobile: true,
    roles: ["subject_teacher", "admin"],
  },
  {
    id: "feedback",
    href: "/main/feedback",
    matchPrefix: "/main/feedback",
    label: { zh: "反馈", en: "Feedback" },
    icon: "message-square-text",
    testId: "sidebar-nav-feedback",
    tourId: "nav-feedback",
    mobile: false,
    roles: ["subject_teacher", "admin"],
  },
  {
    id: "exam-agent",
    href: "/main/exam-agent",
    matchPrefix: "/main/exam-agent",
    label: { zh: "出卷", en: "Exam Agent" },
    icon: "file-text",
    testId: "sidebar-nav-exam-agent",
    mobile: false,
    roles: ["subject_teacher", "admin"],
  },
];

export function buildShellNavigation(roles: AppRole[], activeRole: AppRole | null): ShellNavigationState {
  const visibleRoles = resolveNavigationRoles(roles, activeRole);
  const primaryItems = NAV_ITEMS.filter((item) =>
    item.roles.some((role) => visibleRoles.includes(role)),
  );

  const mobileItems = primaryItems.filter((item) => item.mobile).slice(0, 4);
  const labelRole = activeRole ?? roles[0] ?? null;

  return {
    primaryItems,
    mobileItems,
    actorLabel: labelRole
      ? {
          zh: getRoleLabel(labelRole, "zh"),
          en: getRoleLabel(labelRole, "en"),
        }
      : null,
    showQuota: activeRole === "subject_teacher",
  };
}
