/**
 * Rubric domain types and AI output formats.
 */

export type RubricStatus = "draft" | "published";
export type RubricLevelId = "excellent" | "good" | "passing" | "failing";

export interface Rubric {
  id: string;
  teacherId: string;
  courseId: string;
  unitId?: string | null;
  title: string;
  status: RubricStatus;
  teacherPrompt?: string | null;
  isAiGenerated: boolean;
  teacherModified: boolean;
  createdAt: string;
  updatedAt: string;
  dimensions?: RubricDimension[];
}

export interface RubricDimension {
  id: string;
  rubricId: string;
  name: string;
  description?: string | null;
  weight: number;
  sortOrder: number;
  levels?: RubricLevel[];
}

export interface RubricLevel {
  id: string;
  dimensionId: string;
  level: RubricLevelId;
  score: 1 | 2 | 3 | 4;
  description: string;
}

export interface RubricCourseMeta {
  id: string;
  name: string;
  code: string;
}

export interface RubricUnitMeta {
  id: string;
  unitNumber: string;
  title: string;
}

export interface RubricDetailPayload {
  id: string;
  courseId: string;
  unitId?: string | null;
  title: string;
  status: RubricStatus;
  teacherPrompt?: string | null;
  isAiGenerated: boolean;
  teacherModified: boolean;
  createdAt: string;
  updatedAt: string;
  course: RubricCourseMeta;
  unit?: RubricUnitMeta | null;
  dimensions: Array<{
    id: string;
    name: string;
    description: string;
    weight: number;
    sortOrder: number;
    levels: RubricLevel[];
  }>;
}

export interface RubricListItem {
  id: string;
  title: string;
  status: RubricStatus;
  courseName: string;
  courseCode: string;
  unitTitle?: string | null;
  unitNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditableRubricDimension {
  clientId: string;
  name: string;
  description: string;
  weight: number;
  levels: Record<RubricLevelId, string>;
}

export interface EditableRubric {
  id: string;
  title: string;
  status: RubricStatus;
  dimensions: EditableRubricDimension[];
}

// AI tool-use output format (flattened JSON, not normalized tables).
export interface RubricAIOutput {
  title: string;
  dimensions: Array<{
    name: string;
    description: string;
    weight: number;
    levels: Record<RubricLevelId, string>;
  }>;
}
