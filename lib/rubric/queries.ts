import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RubricDetailPayload,
  RubricLevelId,
  RubricListItem,
  RubricStatus,
} from "@/types/rubric";
import type { Database } from "@/types/database";

type RubricRow = {
  id: string;
  course_id: string;
  unit_id: string | null;
  title: string;
  status: string;
  teacher_prompt: string | null;
  is_ai_generated: boolean;
  teacher_modified: boolean;
  created_at: string;
  updated_at: string;
  course?: { id: string; name: string; code: string } | Array<{ id: string; name: string; code: string }> | null;
  unit?: { id: string; unit_number: string; title: string } | Array<{ id: string; unit_number: string; title: string }> | null;
  dimensions?: Array<{
    id: string;
    name: string;
    description: string | null;
    weight: number | string;
    sort_order: number;
    levels?: Array<{
      id: string;
      level: RubricLevelId;
      score: number;
      description: string;
    }>;
  }>;
};

type AppSupabaseClient = SupabaseClient<Database>;

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

export async function getRubricList(): Promise<RubricListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("rubrics")
    .select(
      "id,title,status,created_at,updated_at,course:courses(id,name,code),unit:units(id,unit_number,title)",
    )
    .order("updated_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as RubricRow[]).map((row) => {
    const course = pickFirst(row.course);
    const unit = pickFirst(row.unit);
    return {
      id: row.id,
      title: row.title,
      status: row.status as RubricStatus,
      courseName: course?.name ?? "Unknown course",
      courseCode: course?.code ?? "",
      unitTitle: unit?.title ?? null,
      unitNumber: unit?.unit_number ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function getRubricDetail(
  rubricId: string,
  supabaseOverride?: AppSupabaseClient,
  options?: { teacherId?: string },
): Promise<RubricDetailPayload | null> {
  const supabase = supabaseOverride ?? (await createServerSupabaseClient());
  let query = supabase
    .from("rubrics")
    .select(
      `
        id,
        course_id,
        unit_id,
        title,
        status,
        teacher_prompt,
        is_ai_generated,
        teacher_modified,
        created_at,
        updated_at,
        course:courses(id,name,code),
        unit:units(id,unit_number,title),
        dimensions:rubric_dimensions(
          id,
          name,
          description,
          weight,
          sort_order,
          levels:rubric_levels(id,level,score,description)
        )
      `,
    )
    .eq("id", rubricId);

  if (options?.teacherId) {
    query = query.eq("teacher_id", options.teacherId);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as RubricRow;
  const course = pickFirst(row.course);
  const unit = pickFirst(row.unit);
  const dimensions =
    row.dimensions
      ?.slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((dimension) => ({
        id: dimension.id,
        name: dimension.name,
        description: dimension.description ?? "",
        weight: Number(dimension.weight),
        sortOrder: dimension.sort_order,
        levels:
          dimension.levels
            ?.slice()
            .sort((a, b) => b.score - a.score)
            .map((level) => ({
              id: level.id,
              level: level.level,
              score: level.score as 1 | 2 | 3 | 4,
              description: level.description,
              dimensionId: dimension.id,
            })) ?? [],
      })) ?? [];

  return {
    id: row.id,
    courseId: row.course_id,
    unitId: row.unit_id,
    title: row.title,
    status: row.status as RubricStatus,
    teacherPrompt: row.teacher_prompt,
    isAiGenerated: row.is_ai_generated,
    teacherModified: row.teacher_modified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    course: {
      id: course?.id ?? row.course_id,
      name: course?.name ?? "Unknown course",
      code: course?.code ?? "",
    },
    unit: unit
      ? {
          id: unit.id,
          unitNumber: unit.unit_number,
          title: unit.title,
        }
      : null,
    dimensions,
  };
}
