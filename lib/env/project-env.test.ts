import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { loadProjectEnvFallback, resolveProjectEnvFallbackPath } from "@/lib/env/project-env"

const tempDirs: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createProjectRoot() {
  const parentDir = mkdtempSync(join(tmpdir(), "toBeduTrack-env-parent-"))
  const projectRoot = join(parentDir, "toBeduTrack")
  mkdirSync(projectRoot, { recursive: true })
  mkdirSync(join(parentDir, "env"), { recursive: true })
  tempDirs.push(parentDir)
  return projectRoot
}

describe("resolveProjectEnvFallbackPath", () => {
  it("returns the shared env file when the project root env file is missing", () => {
    const projectRoot = createProjectRoot()
    const sharedEnvPath = join(dirname(projectRoot), "env", ".env.local")
    writeFileSync(sharedEnvPath, "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\n")

    expect(resolveProjectEnvFallbackPath(projectRoot)).toBe(sharedEnvPath)
  })

  it("returns null when neither root nor shared env file exists", () => {
    const projectRoot = createProjectRoot()

    expect(resolveProjectEnvFallbackPath(projectRoot)).toBeNull()
  })
})

describe("loadProjectEnvFallback", () => {
  it("loads missing env vars from the shared env file", () => {
    const projectRoot = createProjectRoot()
    const sharedEnvPath = join(dirname(projectRoot), "env", ".env.local")
    writeFileSync(
      sharedEnvPath,
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY=service-role",
      ].join("\n"),
    )
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const loadedPath = loadProjectEnvFallback(projectRoot)

    expect(loadedPath).toBe(sharedEnvPath)
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co")
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role")
  })
})
