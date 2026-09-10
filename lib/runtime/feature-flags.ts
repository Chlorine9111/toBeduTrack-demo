import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { internalTable } from "@/lib/runtime/internal-table";

type FeatureFlagSnapshot = {
  enabled: boolean;
  source: "env" | "db" | "default";
  updatedAt: string | null;
  payload?: Record<string, unknown> | null;
};

const FLAG_CACHE_TTL_MS = 30_000;
const flagCache = new Map<string, { expiresAt: number; value: FeatureFlagSnapshot }>();

function toEnvKey(flagKey: string) {
  return `FEATURE_${flagKey.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
}

function parseEnvBoolean(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export async function getFeatureFlagSnapshot(
  flagKey: string,
  options?: { defaultValue?: boolean; bypassCache?: boolean },
): Promise<FeatureFlagSnapshot> {
  const envValue = parseEnvBoolean(process.env[toEnvKey(flagKey)]);
  if (envValue !== null) {
    return {
      enabled: envValue,
      source: "env",
      updatedAt: null,
      payload: null,
    };
  }

  const defaultValue = options?.defaultValue ?? false;
  const now = Date.now();
  const cached = flagCache.get(flagKey);
  if (!options?.bypassCache && cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await internalTable(admin, "app_feature_flags")
      .select("enabled, updated_at, payload")
      .eq("key", flagKey)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "读取 feature flag 失败");
    }

    if (!data) {
      const snapshot = {
        enabled: defaultValue,
        source: "default" as const,
        updatedAt: null,
        payload: null,
      };
      flagCache.set(flagKey, { expiresAt: now + FLAG_CACHE_TTL_MS, value: snapshot });
      return snapshot;
    }

    const snapshot = {
      enabled: Boolean((data as { enabled?: unknown }).enabled),
      source: "db" as const,
      updatedAt:
        typeof (data as { updated_at?: unknown }).updated_at === "string"
          ? ((data as { updated_at?: string }).updated_at ?? null)
          : null,
      payload:
        (data as { payload?: Record<string, unknown> | null }).payload ?? null,
    };
    flagCache.set(flagKey, { expiresAt: now + FLAG_CACHE_TTL_MS, value: snapshot });
    return snapshot;
  } catch {
    const snapshot = {
      enabled: defaultValue,
      source: "default" as const,
      updatedAt: null,
      payload: null,
    };
    flagCache.set(flagKey, { expiresAt: now + FLAG_CACHE_TTL_MS, value: snapshot });
    return snapshot;
  }
}

export async function isFeatureEnabled(flagKey: string, defaultValue = false) {
  const snapshot = await getFeatureFlagSnapshot(flagKey, { defaultValue });
  return snapshot.enabled;
}

export function clearFeatureFlagCache(flagKey?: string) {
  if (flagKey) {
    flagCache.delete(flagKey);
    return;
  }
  flagCache.clear();
}
