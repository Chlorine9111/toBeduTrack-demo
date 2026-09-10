import type { DayKey, ScheduleInput } from "./types";

export const DEFAULT_DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function createSampleScheduleInput(): ScheduleInput {
  return {
    days: DEFAULT_DAYS,
    periodsPerDay: 8,
    teachers: [
      { id: "t_math", name: "王老师(数学)", unavailable: ["Tue-1", "Thu-6"] },
      { id: "t_english", name: "李老师(英语)", unavailable: ["Mon-8"] },
      { id: "t_physics", name: "张老师(物理)", unavailable: ["Wed-2", "Wed-3"] },
      { id: "t_chem", name: "赵老师(化学)", unavailable: ["Fri-7"] },
      { id: "t_cn", name: "陈老师(语文)", unavailable: ["Tue-8"] }
    ],
    classes: [
      { id: "c_g10_1", name: "高一(1)班" },
      { id: "c_g10_2", name: "高一(2)班" }
    ],
    courses: [
      { id: "course_math", name: "数学" },
      { id: "course_english", name: "英语" },
      { id: "course_physics", name: "物理" },
      { id: "course_chem", name: "化学" },
      { id: "course_cn", name: "语文" }
    ],
    rooms: [
      { id: "r_101", name: "101" },
      { id: "r_102", name: "102" },
      { id: "r_201", name: "201" },
      { id: "r_202", name: "202" }
    ],
    demands: [
      { id: "d_101_math", classId: "c_g10_1", courseId: "course_math", teacherId: "t_math", sessionsPerWeek: 5 },
      { id: "d_101_english", classId: "c_g10_1", courseId: "course_english", teacherId: "t_english", sessionsPerWeek: 4 },
      { id: "d_101_physics", classId: "c_g10_1", courseId: "course_physics", teacherId: "t_physics", sessionsPerWeek: 3 },
      { id: "d_101_chem", classId: "c_g10_1", courseId: "course_chem", teacherId: "t_chem", sessionsPerWeek: 3 },
      { id: "d_101_cn", classId: "c_g10_1", courseId: "course_cn", teacherId: "t_cn", sessionsPerWeek: 5 },

      { id: "d_102_math", classId: "c_g10_2", courseId: "course_math", teacherId: "t_math", sessionsPerWeek: 5 },
      { id: "d_102_english", classId: "c_g10_2", courseId: "course_english", teacherId: "t_english", sessionsPerWeek: 4 },
      { id: "d_102_physics", classId: "c_g10_2", courseId: "course_physics", teacherId: "t_physics", sessionsPerWeek: 3 },
      { id: "d_102_chem", classId: "c_g10_2", courseId: "course_chem", teacherId: "t_chem", sessionsPerWeek: 3 },
      { id: "d_102_cn", classId: "c_g10_2", courseId: "course_cn", teacherId: "t_cn", sessionsPerWeek: 5 }
    ],
    lockedLessons: []
  };
}
