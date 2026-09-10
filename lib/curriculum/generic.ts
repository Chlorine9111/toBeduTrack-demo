import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export const GENERIC_COURSE_CODE = "GENERAL_UNCLASSIFIED";
export const GENERIC_COURSE_NAME = "通用";
export const GENERIC_UNIT_NUMBER = "";
export const GENERIC_UNIT_TITLE = "通用单元";
export const GENERIC_TOPIC_NUMBER = "";
export const GENERIC_TOPIC_TITLE = "通用知识点";

type GenericCourseRow = {
  id: string;
  name: string;
  code: string;
};

type GenericUnitRow = {
  id: string;
  course_id: string;
  unit_number: string;
  title: string;
};

type GenericTopicRow = {
  id: string;
  unit_id: string;
  topic_number: string;
  title: string;
};

export type GenericCurriculumBucket = {
  courseId: string;
  courseLabel: string;
  unitId: string;
  unitLabel: string;
  topicId: string;
  topicLabel: string;
};

export function isGenericCourseCode(code: string | null | undefined) {
  return `${code ?? ""}`.trim().toUpperCase() === GENERIC_COURSE_CODE;
}

export async function readGenericCurriculumBucket(
  supabase: AppSupabase,
): Promise<GenericCurriculumBucket | null> {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id,name,code")
    .eq("code", GENERIC_COURSE_CODE)
    .maybeSingle();

  if (courseError) {
    throw new Error(`读取通用课程桶失败: ${courseError.message}`);
  }
  if (!course) return null;

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id,course_id,unit_number,title")
    .eq("course_id", course.id)
    .eq("unit_number", GENERIC_UNIT_NUMBER)
    .maybeSingle();

  if (unitError) {
    throw new Error(`读取通用单元桶失败: ${unitError.message}`);
  }
  if (!unit) return null;

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id,unit_id,topic_number,title")
    .eq("unit_id", unit.id)
    .eq("topic_number", GENERIC_TOPIC_NUMBER)
    .maybeSingle();

  if (topicError) {
    throw new Error(`读取通用知识点桶失败: ${topicError.message}`);
  }
  if (!topic) return null;

  return {
    courseId: (course as GenericCourseRow).id,
    courseLabel: (course as GenericCourseRow).name,
    unitId: (unit as GenericUnitRow).id,
    unitLabel: (unit as GenericUnitRow).title,
    topicId: (topic as GenericTopicRow).id,
    topicLabel: (topic as GenericTopicRow).title,
  };
}

export async function readCourseFallbackUnitBucket(
  supabase: AppSupabase,
  courseId: string,
): Promise<{ unitId: string; unitLabel: string } | null> {
  const { data: unit, error } = await supabase
    .from("units")
    .select("id,course_id,unit_number,title")
    .eq("course_id", courseId)
    .eq("unit_number", GENERIC_UNIT_NUMBER)
    .maybeSingle();

  if (error) {
    throw new Error(`读取课程通用单元桶失败: ${error.message}`);
  }
  if (!unit) return null;

  return {
    unitId: (unit as GenericUnitRow).id,
    unitLabel: (unit as GenericUnitRow).title,
  };
}

export async function readUnitFallbackTopicBucket(
  supabase: AppSupabase,
  unitId: string,
): Promise<{ topicId: string; topicLabel: string } | null> {
  const { data: topic, error } = await supabase
    .from("topics")
    .select("id,unit_id,topic_number,title")
    .eq("unit_id", unitId)
    .eq("topic_number", GENERIC_TOPIC_NUMBER)
    .maybeSingle();

  if (error) {
    throw new Error(`读取单元通用知识点桶失败: ${error.message}`);
  }
  if (!topic) return null;

  return {
    topicId: (topic as GenericTopicRow).id,
    topicLabel: (topic as GenericTopicRow).title,
  };
}
