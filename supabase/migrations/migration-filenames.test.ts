import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");

describe("migration filenames", () => {
  it("uses CLI-compatible timestamped sql migration filenames", () => {
    const invalidFiles = readdirSync(migrationsDir)
      .filter((entry) => entry.endsWith(".sql"))
      .filter((entry) => !/^\d{14}_[a-z0-9_]+\.sql$/i.test(entry));

    expect(invalidFiles).toEqual([]);
  });
});
