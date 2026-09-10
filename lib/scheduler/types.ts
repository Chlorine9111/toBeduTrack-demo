export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export interface Teacher {
  id: string;
  name: string;
  unavailable: string[];
}

export interface ClassGroup {
  id: string;
  name: string;
}

export interface Course {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface LessonDemand {
  id: string;
  classId: string;
  courseId: string;
  teacherId: string;
  sessionsPerWeek: number;
}

export interface Slot {
  day: DayKey;
  period: number;
  key: string;
}

export interface LessonSession {
  id: string;
  demandId: string;
  classId: string;
  courseId: string;
  teacherId: string;
}

export interface Placement {
  sessionId: string;
  slotKey: string;
  roomId: string;
}

export interface ScheduleInput {
  days: DayKey[];
  periodsPerDay: number;
  teachers: Teacher[];
  classes: ClassGroup[];
  courses: Course[];
  rooms: Room[];
  demands: LessonDemand[];
  lockedLessons: LockedLesson[];
}

export interface LockedLesson {
  id: string;
  classId: string;
  courseId: string;
  slotKey: string;
}

export interface AnnealingConfig {
  iterations: number;
  initialTemperature: number;
  coolingRate: number;
  hardPenaltyWeight: number;
}

export interface ScoredSolution {
  placements: Placement[];
  hardViolations: number;
  softPenalty: number;
  score: number;
}

export interface TimetableCell {
  courseId: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
}

export interface ClassTimetable {
  classId: string;
  className: string;
  rows: Array<{
    slotKey: string;
    day: DayKey;
    period: number;
    cell: TimetableCell | null;
  }>;
}

export interface SolverResult {
  solution: ScoredSolution;
  byClass: ClassTimetable[];
  warnings: string[];
}
