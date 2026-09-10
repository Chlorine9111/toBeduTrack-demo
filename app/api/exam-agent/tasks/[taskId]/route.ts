import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { getTask, deleteTask } from "@/lib/exam-agent/store";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json(
      { error: errorMessage },
      { status: errorStatus ?? 401 },
    );
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json(
      { error: errorMessage },
      { status: errorStatus ?? 401 },
    );
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  deleteTask(taskId);
  return NextResponse.json({ deleted: true });
}
