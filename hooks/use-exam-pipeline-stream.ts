"use client";

import { useEffect, useRef } from "react";
import type {
  ExamSseEvent,
  ExamTask,
  PipelineStepId,
  PipelineStepStatus,
  PipelineLogEntry,
  ExamResult,
} from "@/lib/exam-agent/types";

type StreamCallbacks = {
  onStepUpdate: (stepId: PipelineStepId, status: PipelineStepStatus) => void;
  onLog: (stepId: PipelineStepId, entry: PipelineLogEntry) => void;
  onProgress: (current: number, total: number) => void;
  onCompleted: (result: ExamResult) => void;
  onFailed: (error: string) => void;
};

export function useExamPipelineStream(
  taskId: string | null,
  taskStatus: ExamTask["status"] | undefined,
  callbacks: StreamCallbacks,
): void {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!taskId || taskStatus !== "running") return;

    const controller = new AbortController();

    async function connect() {
      try {
        const response = await fetch(`/api/exam-agent/tasks/${taskId}/stream`, {
          signal: controller.signal,
        });

        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const match = line.match(/^data: (.+)$/m);
            if (!match) continue;

            try {
              const event = JSON.parse(match[1]) as ExamSseEvent | { type: "init"; task: ExamTask };

              switch (event.type) {
                case "step-update":
                  cbRef.current.onStepUpdate(event.stepId, event.status);
                  break;
                case "log":
                  cbRef.current.onLog(event.stepId, event.entry);
                  break;
                case "progress":
                  cbRef.current.onProgress(event.current, event.total);
                  break;
                case "completed":
                  cbRef.current.onCompleted(event.result);
                  break;
                case "failed":
                  cbRef.current.onFailed(event.error);
                  break;
              }
            } catch {
              // Ignore malformed SSE events
            }
          }
        }
      } catch {
        // Connection closed or aborted
      }
    }

    void connect();

    return () => {
      controller.abort();
    };
  }, [taskId, taskStatus]);
}
