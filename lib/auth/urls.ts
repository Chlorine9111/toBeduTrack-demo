function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function sanitizeNextPath(next: string | null | undefined, fallback = "/main/agent") {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  return trimmed;
}

export function getAppOrigin() {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  return "http://127.0.0.1:3001";
}

export function buildAuthCallbackUrl(next?: string | null) {
  const safeNext = sanitizeNextPath(next, "/main/agent");
  return `${getAppOrigin()}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}

export function buildRecoveryRedirectUrl(next?: string | null) {
  const safeNext = sanitizeNextPath(next, "/main/agent");
  const recoveryPath =
    safeNext === "/main/agent"
      ? "/auth/update-password"
      : `/auth/update-password?next=${encodeURIComponent(safeNext)}`;
  return `${getAppOrigin()}${recoveryPath}`;
}

export function buildLoginUrl(options?: {
  notice?: string | null;
  next?: string | null;
}) {
  const params = new URLSearchParams();

  if (options?.notice?.trim()) {
    params.set("notice", options.notice.trim());
  }

  const safeNext = sanitizeNextPath(options?.next, "/main/agent");
  if (safeNext !== "/main/agent") {
    params.set("next", safeNext);
  }

  const query = params.toString();
  return query ? `/auth/login?${query}` : "/auth/login";
}
