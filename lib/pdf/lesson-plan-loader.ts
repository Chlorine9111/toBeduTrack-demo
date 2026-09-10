import type {
  BlockType,
  CalloutSubtype,
  LessonPlanSection,
} from "@/lib/lesson-plan/types";
import type { LessonPlanPdfInput } from "@/lib/pdf/templates/lesson-plan-template";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type AppSupabaseClient = SupabaseClient<Database>;

type LessonPlanRow = Pick<
  Database["public"]["Tables"]["lesson_plans"]["Row"],
  | "id"
  | "title"
  | "duration_minutes"
  | "student_level"
  | "show_ced_codes"
  | "include_teacher_notes"
> & {
  course: { name: string } | { name: string }[] | null;
  unit: { unit_number: string; title: string } | { unit_number: string; title: string }[] | null;
};

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export async function loadLessonPlanForPdf(
  supabase: AppSupabaseClient,
  lessonPlanId: string,
  teacherId: string,
): Promise<LessonPlanPdfInput | null> {
  const { data: lessonPlan, error: lessonPlanError } = await supabase
    .from("lesson_plans")
    .select(
      "id,title,duration_minutes,student_level,show_ced_codes,include_teacher_notes,course:courses(name),unit:units(unit_number,title)",
    )
    .eq("id", lessonPlanId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (lessonPlanError || !lessonPlan) {
    return null;
  }

  const plan = lessonPlan as LessonPlanRow;

  const { data: sectionRows, error: sectionError } = await supabase
    .from("lesson_plan_sections")
    .select("id,title,summary,duration_minutes,sort_order")
    .eq("lesson_plan_id", lessonPlanId)
    .order("sort_order", { ascending: true });

  if (sectionError || !sectionRows) {
    return null;
  }

  const { data: blockRows, error: blockError } = await supabase
    .from("lesson_plan_blocks")
    .select(
      "id,section_id,block_type,block_subtype,sort_order,content,ced_codes,teacher_note",
    )
    .eq("lesson_plan_id", lessonPlanId)
    .order("sort_order", { ascending: true });

  if (blockError || !blockRows) {
    return null;
  }

  const groupedBlocks = new Map<string, LessonPlanSection["blocks"]>();

  blockRows.forEach((block) => {
    const list = groupedBlocks.get(block.section_id) ?? [];
    list.push({
      id: block.id,
      type: block.block_type as BlockType,
      subtype: (block.block_subtype as CalloutSubtype | null) ?? undefined,
      sortOrder: block.sort_order,
      content: toRecord(block.content),
      cedCodes: toStringArray(block.ced_codes),
      teacherNote: block.teacher_note,
    });
    groupedBlocks.set(block.section_id, list);
  });

  const sections: LessonPlanSection[] = sectionRows.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary ?? "",
    durationMinutes: section.duration_minutes ?? 0,
    sortOrder: section.sort_order,
    blocks: (groupedBlocks.get(section.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
  }));

  const course = pickFirst(plan.course);
  const unit = pickFirst(plan.unit);

  const unitName = unit
    ? `${unit.unit_number ? `Unit ${unit.unit_number} ` : ""}${unit.title}`.trim()
    : null;

  return {
    title: plan.title,
    courseName: course?.name ?? null,
    unitName,
    totalMinutes: plan.duration_minutes,
    level: plan.student_level,
    sections,
  };
}
