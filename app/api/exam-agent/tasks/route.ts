import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { createTask, getTasksByTeacher } from "@/lib/exam-agent/store";
import { runExamPipeline } from "@/lib/exam-agent/orchestrator";
import type { ExamTaskConfig } from "@/lib/exam-agent/types";

const createTaskSchema = z.object({
  subject: z.string().min(1),
  subjectName: z.string().min(1),
  units: z.array(z.string().min(1)).min(1),
  unitNames: z.array(z.string().min(1)).min(1),
  questionCount: z.number().int().min(5).max(50),
  questionTypes: z.array(z.enum(["MC", "FR"])).min(1),
  difficultyPreference: z.enum(["easy", "balanced", "hard"]),
  language: z.enum(["中文", "英文"]),
  examName: z.string().optional(),
});

export async function POST(request: Request) {
  const { teacherId, supabase, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json(
      { error: errorMessage },
      { status: errorStatus ?? 401 },
    );
  }

  let body: ExamTaskConfig;
  try {
    body = createTaskSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const task = createTask(teacherId, body);
  void runExamPipeline(task, supabase);

  return NextResponse.json({ taskId: task.id, status: task.status });
}

export async function GET() {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json(
      { error: errorMessage },
      { status: errorStatus ?? 401 },
    );
  }

  const tasks = getTasksByTeacher(teacherId);
  return NextResponse.json({ tasks });
}
