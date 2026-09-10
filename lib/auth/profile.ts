type UserMetadata = Record<string, unknown> | null | undefined;

function readString(metadata: UserMetadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function getAuthDisplayName(params: {
  email?: string | null;
  metadata?: UserMetadata;
}) {
  const fromMetadata =
    readString(params.metadata, "display_name") ??
    readString(params.metadata, "full_name") ??
    readString(params.metadata, "name");

  if (fromMetadata) return fromMetadata;
  if (!params.email) return "未命名用户";
  return params.email.split("@")[0] ?? "未命名用户";
}

export function getAuthSchoolName(metadata?: UserMetadata) {
  return readString(metadata, "school_name");
}

export function getAuthInitials(displayName: string, email?: string | null) {
  const text = displayName.trim() || email?.trim() || "U";
  const segments = text
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (segments.length >= 2) {
    return `${segments[0][0] ?? ""}${segments[1][0] ?? ""}`.toUpperCase();
  }

  return text.slice(0, 2).toUpperCase();
}
