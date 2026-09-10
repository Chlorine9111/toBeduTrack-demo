import { getTeacherContext } from "@/lib/api/teacher-context";
import { getTask, subscribe } from "@/lib/exam-agent/store";
import type { ExamSseEvent } from "@/lib/exam-agent/types";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { teacherId } = await getTeacherContext();
  if (!teacherId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "init", task })}\n\n`),
      );

      if (task.status === "completed" || task.status === "failed") {
        controller.close();
        return;
      }

      const unsubscribe = subscribe(taskId, (event: ExamSseEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
          if (event.type === "completed" || event.type === "failed") {
            unsubscribe();
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "heartbeat" })}\n\n`,
            ),
          );
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
