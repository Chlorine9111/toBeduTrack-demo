import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateScheduleByAnnealing } from "@/lib/scheduler/annealing";
import { createSampleScheduleInput } from "@/lib/scheduler/sample-data";
import type { AnnealingConfig, ScheduleInput } from "@/lib/scheduler/types";

const daySchema = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri"]);

const requestSchema = z.object({
  data: z
    .object({
      days: z.array(daySchema),
      periodsPerDay: z.number().int().min(1).max(12),
      teachers: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          unavailable: z.array(z.string())
        })
      ),
      classes: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1)
        })
      ),
      courses: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1)
        })
      ),
      rooms: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1)
        })
      ),
      demands: z.array(
        z.object({
          id: z.string().min(1),
          classId: z.string().min(1),
          courseId: z.string().min(1),
          teacherId: z.string().min(1),
          sessionsPerWeek: z.number().int().min(1).max(20)
        })
      ),
      lockedLessons: z.array(
        z.object({
          id: z.string().min(1),
          classId: z.string().min(1),
          courseId: z.string().min(1),
          slotKey: z.string().min(1)
        })
      )
    })
    .optional(),
  config: z
    .object({
      iterations: z.number().int().min(1000).max(80000).optional(),
      initialTemperature: z.number().min(0.1).max(100).optional(),
      coolingRate: z.number().min(0.9).max(0.99999).optional(),
      hardPenaltyWeight: z.number().min(10).max(100000).optional()
    })
    .optional()
});

function validateDataRefs(data: ScheduleInput): string[] {
  const teacherIds = new Set(data.teachers.map((item) => item.id));
  const classIds = new Set(data.classes.map((item) => item.id));
  const courseIds = new Set(data.courses.map((item) => item.id));
  const errors: string[] = [];

  for (const demand of data.demands) {
    if (!teacherIds.has(demand.teacherId)) {
      errors.push(`Demand ${demand.id} 引用了不存在的 teacherId: ${demand.teacherId}`);
    }
    if (!classIds.has(demand.classId)) {
      errors.push(`Demand ${demand.id} 引用了不存在的 classId: ${demand.classId}`);
    }
    if (!courseIds.has(demand.courseId)) {
      errors.push(`Demand ${demand.id} 引用了不存在的 courseId: ${demand.courseId}`);
    }
  }

  for (const lock of data.lockedLessons) {
    if (!classIds.has(lock.classId)) {
      errors.push(`Locked ${lock.id} 引用了不存在的 classId: ${lock.classId}`);
    }
    if (!courseIds.has(lock.courseId)) {
      errors.push(`Locked ${lock.id} 引用了不存在的 courseId: ${lock.courseId}`);
    }
  }

  return errors;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const data: ScheduleInput = parsed.data.data ?? createSampleScheduleInput();
  const config: Partial<AnnealingConfig> = parsed.data.config ?? {};
  const refErrors = validateDataRefs(data);

  if (refErrors.length > 0) {
    return NextResponse.json({ ok: false, error: refErrors }, { status: 422 });
  }

  try {
    const startedAt = Date.now();
    const result = generateScheduleByAnnealing(data, config);
    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      elapsedMs,
      config,
      summary: {
        hardViolations: result.solution.hardViolations,
        softPenalty: Number(result.solution.softPenalty.toFixed(2)),
        score: Number(result.solution.score.toFixed(2))
      },
      warnings: result.warnings,
      byClass: result.byClass
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "排课失败"
      },
      { status: 500 }
    );
  }
}
