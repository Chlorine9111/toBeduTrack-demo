import type {
  AnnealingConfig,
  ClassTimetable,
  LessonSession,
  Placement,
  ScheduleInput,
  ScoredSolution,
  Slot,
  SolverResult,
  TimetableCell
} from "./types";

const DEFAULT_CONFIG: AnnealingConfig = {
  iterations: 12000,
  initialTemperature: 12,
  coolingRate: 0.997,
  hardPenaltyWeight: 1000
};

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}

function buildSlots(input: ScheduleInput): Slot[] {
  const slots: Slot[] = [];
  for (const day of input.days) {
    for (let period = 1; period <= input.periodsPerDay; period += 1) {
      slots.push({ day, period, key: `${day}-${period}` });
    }
  }
  return slots;
}

function expandSessions(input: ScheduleInput): LessonSession[] {
  const sessions: LessonSession[] = [];
  for (const demand of input.demands) {
    for (let i = 0; i < demand.sessionsPerWeek; i += 1) {
      sessions.push({
        id: `${demand.id}#${i + 1}`,
        demandId: demand.id,
        classId: demand.classId,
        courseId: demand.courseId,
        teacherId: demand.teacherId
      });
    }
  }
  return sessions;
}

function createInitialPlacements(sessions: LessonSession[], slots: Slot[], roomIds: string[]): Placement[] {
  return sessions.map((session) => ({
    sessionId: session.id,
    slotKey: randomFrom(slots).key,
    roomId: randomFrom(roomIds)
  }));
}

function scoreSolution(
  placements: Placement[],
  sessionsById: Map<string, LessonSession>,
  input: ScheduleInput,
  slotsByKey: Map<string, Slot>,
  weight: number
): ScoredSolution {
  const teacherUnavailable = new Map<string, Set<string>>();
  for (const teacher of input.teachers) {
    teacherUnavailable.set(teacher.id, new Set(teacher.unavailable));
  }

  const teacherSlotCount = new Map<string, number>();
  const classSlotCount = new Map<string, number>();
  const roomSlotCount = new Map<string, number>();
  const classDayCourseCount = new Map<string, number>();
  const classDayPeriods = new Map<string, number[]>();
  const teacherDayLoad = new Map<string, number>();

  let hardViolations = 0;
  let softPenalty = 0;

  for (const placement of placements) {
    const session = sessionsById.get(placement.sessionId);
    if (!session) {
      hardViolations += 1;
      continue;
    }

    const slot = slotsByKey.get(placement.slotKey);
    if (!slot) {
      hardViolations += 1;
      continue;
    }

    if (!placement.roomId) {
      hardViolations += 1;
    }

    if (teacherUnavailable.get(session.teacherId)?.has(placement.slotKey)) {
      hardViolations += 1;
    }

    const teacherSlotKey = `${session.teacherId}@${placement.slotKey}`;
    const classSlotKey = `${session.classId}@${placement.slotKey}`;
    const roomSlotKey = `${placement.roomId}@${placement.slotKey}`;

    teacherSlotCount.set(teacherSlotKey, (teacherSlotCount.get(teacherSlotKey) ?? 0) + 1);
    classSlotCount.set(classSlotKey, (classSlotCount.get(classSlotKey) ?? 0) + 1);
    roomSlotCount.set(roomSlotKey, (roomSlotCount.get(roomSlotKey) ?? 0) + 1);

    const classDayCourseKey = `${session.classId}@${slot.day}@${session.courseId}`;
    classDayCourseCount.set(classDayCourseKey, (classDayCourseCount.get(classDayCourseKey) ?? 0) + 1);

    const classDayKey = `${session.classId}@${slot.day}`;
    const periods = classDayPeriods.get(classDayKey) ?? [];
    periods.push(slot.period);
    classDayPeriods.set(classDayKey, periods);

    const teacherDayKey = `${session.teacherId}@${slot.day}`;
    teacherDayLoad.set(teacherDayKey, (teacherDayLoad.get(teacherDayKey) ?? 0) + 1);

    if (slot.period === input.periodsPerDay) {
      softPenalty += 0.4;
    }
  }

  for (const value of teacherSlotCount.values()) {
    if (value > 1) hardViolations += value - 1;
  }
  for (const value of classSlotCount.values()) {
    if (value > 1) hardViolations += value - 1;
  }
  for (const value of roomSlotCount.values()) {
    if (value > 1) hardViolations += value - 1;
  }

  for (const value of classDayCourseCount.values()) {
    if (value > 1) {
      softPenalty += (value - 1) * 1.8;
    }
  }

  for (const periods of classDayPeriods.values()) {
    if (periods.length <= 1) continue;
    periods.sort((a, b) => a - b);
    const min = periods[0];
    const max = periods[periods.length - 1];
    const span = max - min + 1;
    const gaps = span - periods.length;
    if (gaps > 0) {
      softPenalty += gaps * 1.1;
    }
  }

  for (const load of teacherDayLoad.values()) {
    if (load > 6) {
      softPenalty += (load - 6) * 2;
    }
  }

  for (const lock of input.lockedLessons) {
    const matched = placements.some((placement) => {
      const session = sessionsById.get(placement.sessionId);
      if (!session) return false;
      return (
        session.classId === lock.classId &&
        session.courseId === lock.courseId &&
        placement.slotKey === lock.slotKey
      );
    });
    if (!matched) {
      hardViolations += 1;
    }
  }

  return {
    placements,
    hardViolations,
    softPenalty,
    score: hardViolations * weight + softPenalty
  };
}

function mutatePlacements(base: Placement[], slots: Slot[], roomIds: string[]): Placement[] {
  const next = base.map((item) => ({ ...item }));
  const action = randomInt(3);

  if (action === 0) {
    const idx = randomInt(next.length);
    next[idx].slotKey = randomFrom(slots).key;
    next[idx].roomId = randomFrom(roomIds);
    return next;
  }

  if (action === 1 && next.length > 1) {
    const i = randomInt(next.length);
    let j = randomInt(next.length);
    while (j === i) {
      j = randomInt(next.length);
    }
    const slotA = next[i].slotKey;
    const slotB = next[j].slotKey;
    next[i].slotKey = slotB;
    next[j].slotKey = slotA;
    return next;
  }

  const idx = randomInt(next.length);
  next[idx].roomId = randomFrom(roomIds);
  return next;
}

function buildByClass(
  solution: ScoredSolution,
  input: ScheduleInput,
  sessionsById: Map<string, LessonSession>,
  slots: Slot[]
): { byClass: ClassTimetable[]; warnings: string[] } {
  const courseById = new Map(input.courses.map((item) => [item.id, item]));
  const teacherById = new Map(input.teachers.map((item) => [item.id, item]));
  const roomById = new Map(input.rooms.map((item) => [item.id, item]));

  const byClassAndSlot = new Map<string, Placement[]>();
  for (const placement of solution.placements) {
    const session = sessionsById.get(placement.sessionId);
    if (!session) continue;
    const key = `${session.classId}@${placement.slotKey}`;
    const list = byClassAndSlot.get(key) ?? [];
    list.push(placement);
    byClassAndSlot.set(key, list);
  }

  const warnings: string[] = [];
  const byClass: ClassTimetable[] = input.classes.map((classInfo) => {
    const rows: ClassTimetable["rows"] = [];

    for (const slot of slots) {
      const key = `${classInfo.id}@${slot.key}`;
      const placements = byClassAndSlot.get(key) ?? [];

      if (placements.length > 1) {
        warnings.push(`${classInfo.name} 在 ${slot.key} 仍有 ${placements.length} 个课程重叠`);
      }

      let cell: TimetableCell | null = null;
      const first = placements[0];

      if (first) {
        const session = sessionsById.get(first.sessionId);
        if (session) {
          const course = courseById.get(session.courseId);
          const teacher = teacherById.get(session.teacherId);
          const room = roomById.get(first.roomId);
          cell = {
            courseId: session.courseId,
            courseName: course?.name ?? session.courseId,
            teacherId: session.teacherId,
            teacherName: teacher?.name ?? session.teacherId,
            roomId: first.roomId,
            roomName: room?.name ?? first.roomId
          };
        }
      }

      rows.push({
        slotKey: slot.key,
        day: slot.day,
        period: slot.period,
        cell
      });
    }

    return {
      classId: classInfo.id,
      className: classInfo.name,
      rows
    };
  });

  return { byClass, warnings };
}

export function generateScheduleByAnnealing(
  input: ScheduleInput,
  partialConfig?: Partial<AnnealingConfig>
): SolverResult {
  if (input.rooms.length === 0) {
    throw new Error("至少需要一个教室");
  }

  const config: AnnealingConfig = {
    ...DEFAULT_CONFIG,
    ...partialConfig
  };

  const slots = buildSlots(input);
  const sessions = expandSessions(input);
  const sessionsById = new Map(sessions.map((item) => [item.id, item]));
  const slotsByKey = new Map(slots.map((item) => [item.key, item]));
  const roomIds = input.rooms.map((room) => room.id);

  let current = scoreSolution(
    createInitialPlacements(sessions, slots, roomIds),
    sessionsById,
    input,
    slotsByKey,
    config.hardPenaltyWeight
  );
  let best = current;
  let temperature = config.initialTemperature;

  for (let i = 0; i < config.iterations; i += 1) {
    const mutated = mutatePlacements(current.placements, slots, roomIds);
    const candidate = scoreSolution(mutated, sessionsById, input, slotsByKey, config.hardPenaltyWeight);
    const delta = candidate.score - current.score;

    const shouldAccept = delta <= 0 || Math.random() < Math.exp(-delta / Math.max(temperature, 1e-8));
    if (shouldAccept) {
      current = candidate;
      if (current.score < best.score) {
        best = current;
      }
    }

    temperature *= config.coolingRate;
    if (temperature < 0.05) {
      temperature = 0.05;
    }
  }

  const { byClass, warnings } = buildByClass(best, input, sessionsById, slots);
  if (best.hardViolations > 0) {
    warnings.unshift(`仍有 ${best.hardViolations} 个硬冲突，建议增加迭代或调整约束`);
  }

  return {
    solution: best,
    byClass,
    warnings
  };
}
