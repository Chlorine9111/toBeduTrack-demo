import type {
  ContentLibraryDetail,
  ContentLibraryListItem,
} from "@/lib/content-library/types";

export type CurriculumCourseOption = {
  id: string;
  name: string;
  code: string;
};

export type CurriculumUnitOption = {
  id: string;
  course_id: string;
  unit_number: number;
  title: string;
};

export type ContentCardOverride = {
  displayTitle: string;
  note: string | null;
  courseId: string | null;
  unitId: string | null;
  courseName: string | null;
  unitName: string | null;
  updatedAt: string;
};

export type NormalizeMetadataSaveResult =
  | {
      ok: true;
      normalizedTitle: string | null;
      normalizedNote: string | null;
      normalizedCourseId: string;
      normalizedUnitId: string;
      classificationChanged: boolean;
      savedCourse: CurriculumCourseOption | null;
      savedUnit: CurriculumUnitOption | null;
    }
  | {
      ok: false;
      error:
        | "course_not_found"
        | "unit_not_found"
        | "unit_without_course"
        | "unit_course_mismatch";
    };

export function buildCardOverrideFromDetail(detail: ContentLibraryDetail): ContentCardOverride {
  return {
    displayTitle: detail.displayTitle,
    note: detail.note,
    courseId: detail.courseId,
    unitId: detail.unitId,
    courseName: detail.courseName,
    unitName: detail.unitName,
    updatedAt: detail.updatedAt,
  };
}

export function formatUnitNameFromOption(unit: Pick<CurriculumUnitOption, "unit_number" | "title"> | null) {
  if (!unit) return null;
  const unitNumber = `${unit.unit_number}`.trim();
  return unitNumber ? `Unit ${unitNumber} · ${unit.title}` : unit.title;
}

export function mergeListItemWithOverride(
  item: ContentLibraryListItem,
  override: ContentCardOverride | null | undefined,
): ContentLibraryListItem {
  if (!override) return item;
  return {
    ...item,
    displayTitle: override.displayTitle || item.displayTitle,
    note: override.note,
    courseId: override.courseId,
    unitId: override.unitId,
    courseName: override.courseName,
    unitName: override.unitName,
    updatedAt: override.updatedAt || item.updatedAt,
  };
}

export function normalizeMetadataSaveDraft(params: {
  draftTitle: string;
  draftNote: string;
  detailCourseId: string;
  detailUnitId: string;
  currentCourseId: string | null;
  currentUnitId: string | null;
  courses: CurriculumCourseOption[];
  units: CurriculumUnitOption[];
}): NormalizeMetadataSaveResult {
  const normalizedTitle = params.draftTitle.trim() || null;
  const normalizedNote = params.draftNote.trim() || null;
  const savedCourse = params.detailCourseId
    ? params.courses.find((course) => course.id === params.detailCourseId) ?? null
    : null;
  const savedUnit = params.detailUnitId
    ? params.units.find((unit) => unit.id === params.detailUnitId) ?? null
    : null;

  if (params.detailCourseId && !savedCourse) {
    return { ok: false, error: "course_not_found" };
  }
  if (params.detailUnitId && !savedUnit) {
    return { ok: false, error: "unit_not_found" };
  }
  if (!savedCourse && savedUnit) {
    return { ok: false, error: "unit_without_course" };
  }
  if (savedCourse && savedUnit && savedUnit.course_id !== savedCourse.id) {
    return { ok: false, error: "unit_course_mismatch" };
  }

  const normalizedCourseId = savedCourse?.id ?? "";
  const normalizedUnitId = savedUnit?.id ?? "";
  const classificationChanged =
    normalizedCourseId !== (params.currentCourseId ?? "") ||
    normalizedUnitId !== (params.currentUnitId ?? "");

  return {
    ok: true,
    normalizedTitle,
    normalizedNote,
    normalizedCourseId,
    normalizedUnitId,
    classificationChanged,
    savedCourse,
    savedUnit,
  };
}
