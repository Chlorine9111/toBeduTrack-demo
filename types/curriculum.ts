/**
 * Curriculum domain types used across AI generation and worksheet assembly.
 */

export type CourseFramework = "AP" | "IB" | "A_LEVEL";

export interface Course {
  id: string;
  framework: CourseFramework;
  name: string;
  code: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  courseId: string;
  unitNumber: string;
  title: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurriculumObjective {
  code: string;
  description: string;
}

export interface Topic {
  id: string;
  unitId: string;
  topicNumber: string;
  title: string;
  learningObjectives: CurriculumObjective[];
  essentialKnowledge: CurriculumObjective[];
  mathPractices: string[];
  createdAt: string;
  updatedAt: string;
}
