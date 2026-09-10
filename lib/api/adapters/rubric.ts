import type {
  MockRubric,
  MockRubricDimension,
} from "@/types/chatflow"

type LevelName = "excellent" | "good" | "passing" | "failing"

const LEVEL_NAMES: LevelName[] = ["excellent", "good", "passing", "failing"]
const COLUMN_LABEL_KEYS = [
  "dimension",
  "excellent",
  "good",
  "passing",
  "failing",
  "weight",
  "actions",
] as const

function adaptLevels(
  levels: unknown
): MockRubricDimension["levels"] {
  const result: MockRubricDimension["levels"] = {
    excellent: "",
    good: "",
    passing: "",
    failing: "",
  }

  if (!Array.isArray(levels)) return result

  for (const item of levels) {
    if (item == null || typeof item !== "object") continue
    const level = (item as Record<string, unknown>).level as string
    const description = String(
      (item as Record<string, unknown>).description ?? ""
    )
    if (LEVEL_NAMES.includes(level as LevelName)) {
      result[level as LevelName] = description
    }
  }

  return result
}

function adaptDimension(
  raw: Record<string, unknown>,
  index: number
): MockRubricDimension {
  return {
    id: String(raw.id ?? `dim-${index + 1}`),
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    weight: Number(raw.weight ?? 0),
    levels: adaptLevels(raw.levels),
  }
}

function adaptColumnLabels(
  value: unknown
): MockRubric["columnLabels"] | undefined {
  if (!value || typeof value !== "object") return undefined

  const source = value as Record<string, unknown>
  const result: NonNullable<MockRubric["columnLabels"]> = {}

  for (const key of COLUMN_LABEL_KEYS) {
    const text = source[key]
    if (typeof text === "string" && text.trim()) {
      result[key] = text.trim()
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

export function adaptRubric(response: {
  rubric: Record<string, unknown>
}): MockRubric {
  const rubric = response?.rubric ?? {}
  const dimensions = Array.isArray(rubric.dimensions)
    ? rubric.dimensions
    : []

  return {
    id: String(rubric.id ?? "rubric-1"),
    title: String(rubric.title ?? ""),
    dimensions: dimensions.map((d: Record<string, unknown>, i: number) =>
      adaptDimension(d ?? {}, i)
    ),
    columnLabels: adaptColumnLabels(rubric.columnLabels),
  }
}
