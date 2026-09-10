import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import type { AppRole } from "@/lib/auth/roles";

const DEV_SWITCHABLE_ROLE_ORDER: AppRole[] = [
  "admin",
  "subject_teacher",
];

type DevRoleSwitcherActor = {
  activeRole?: AppRole | null;
  authBypass: boolean;
  email?: string | null;
  roles?: AppRole[];
  userId?: string | null;
};

function parseCsvValues(value: string | undefined, mode: "raw" | "lowercase") {
  return new Set(
    `${value ?? ""}`
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (mode === "lowercase" ? item.toLowerCase() : item)),
  );
}

function getAllowedDeveloperUserIds() {
  return parseCsvValues(process.env.DEV_ROLE_SWITCHER_USER_IDS, "raw");
}

function getAllowedDeveloperEmails() {
  return parseCsvValues(process.env.DEV_ROLE_SWITCHER_EMAILS, "lowercase");
}

function hasExplicitDeveloperAllowlist() {
  return getAllowedDeveloperUserIds().size > 0 || getAllowedDeveloperEmails().size > 0;
}

export function isDevRoleSwitcherEnabled() {
  return hasExplicitDeveloperAllowlist() || isAuthBypassEnabled();
}

export function getSwitchableDevRoles(roles: AppRole[]) {
  const roleSet = new Set(roles);
  return DEV_SWITCHABLE_ROLE_ORDER.filter((role) => roleSet.has(role));
}

export function canUseDevRoleSwitcher(
  actor: DevRoleSwitcherActor,
  switchableRoles: AppRole[],
) {
  if (switchableRoles.length < 2) {
    return false;
  }

  const userId = actor.userId?.trim() ?? "";
  const email = actor.email?.trim().toLowerCase() ?? "";
  const allowedUserIds = getAllowedDeveloperUserIds();
  const allowedEmails = getAllowedDeveloperEmails();

  if (allowedUserIds.size > 0 || allowedEmails.size > 0) {
    return allowedUserIds.has(userId) || allowedEmails.has(email);
  }

  const bypassUserId = `${process.env.AUTH_BYPASS_USER_ID ?? ""}`.trim();
  return actor.authBypass && Boolean(userId) && userId === bypassUserId;
}

export function resolveDevRoleSwitcherProps(actor: DevRoleSwitcherActor) {
  const switchableRoles = getSwitchableDevRoles(actor.roles ?? []);

  if (!canUseDevRoleSwitcher(actor, switchableRoles)) {
    return null;
  }

  const activeRole =
    actor.activeRole && switchableRoles.includes(actor.activeRole) ? actor.activeRole : null;

  return {
    activeRole,
    roles: switchableRoles,
  };
}

export function shouldHideFloatingDevRoleSwitcher(pathname: string | null | undefined) {
  return typeof pathname === "string" && pathname.startsWith("/responsive-lab");
}
