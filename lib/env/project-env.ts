import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

const REQUIRED_SUPABASE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const

function hasRequiredSupabaseEnv() {
  return REQUIRED_SUPABASE_ENV_KEYS.every((key) => Boolean(process.env[key]?.trim()))
}

export function resolveProjectEnvFallbackPath(projectRoot: string) {
  const rootEnvPath = join(projectRoot, ".env.local")
  if (existsSync(rootEnvPath)) {
    return null
  }

  const sharedEnvPath = join(dirname(projectRoot), "env", ".env.local")
  return existsSync(sharedEnvPath) ? sharedEnvPath : null
}

export function loadProjectEnvFallback(projectRoot: string) {
  if (hasRequiredSupabaseEnv() || typeof process.loadEnvFile !== "function") {
    return null
  }

  const envPath = resolveProjectEnvFallbackPath(projectRoot)
  if (!envPath) {
    return null
  }

  process.loadEnvFile(envPath)
  return envPath
}
