import { streamText, stepCountIs } from "ai";
import { resolveQwenLanguageModel } from "@/lib/ai/provider-registry";
import { createExamAgentTools } from "./agent-tools";
import { buildExamAgentPrompt } from "./agent-prompt";
import { StepManager, type ExamAgentContext } from "./agent-context";
import { assembleExamFromContext } from "./assembler";
import * as store from "./store";
import type { ExamTask } from "./types";
import type { AppSupabase } from "@/lib/agent/tools/types";

export async function runAgentExamPipeline(
  task: ExamTask,
  supabase: AppSupabase,
): Promise<void> {
  const { id: taskId, config } = task;

  const context: ExamAgentContext = {
    taskId,
    teacherId: task.teacherId,
    config,
    supabase,
    candidates: [],
    selectedQuestionIds: [],
    generatedResults: [],
    stepManager: new StepManager(taskId),
  };

  const tools = createExamAgentTools(context);
  const systemPrompt = buildExamAgentPrompt(config);
  const { model } = resolveQwenLanguageModel("qwen-plus");

  const timeout = setTimeout(() => {
    if (!context.examResult) {
      store.failTask(taskId, "出卷超时（3 分钟限制）");
    }
  }, 3 * 60 * 1000);

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: "开始组卷。" }],
      tools,
      toolChoice: "required" as const,
      stopWhen: stepCountIs(10),
      maxOutputTokens: 1024,
      temperature: 0,
    });

    let buf = "";
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        buf += part.text;
        if (buf.length > 150 || buf.includes("。") || buf.includes("\n")) {
          const t = buf.trim();
          if (t) context.stepManager.log(t, "decision");
          buf = "";
        }
      }
    }
    if (buf.trim()) context.stepManager.log(buf.trim(), "decision");

    // Fallback if agent didn't call assemble_exam
    if (!context.examResult) {
      context.stepManager.enter("assemble-exam");
      context.stepManager.log("自动组装（agent 未调用 assemble_exam）", "warn");
      const fallback = assembleExamFromContext(context);
      context.examResult = fallback;
      context.stepManager.completeAll();
      store.completeTask(taskId, fallback);
    }
  } catch (error) {
    store.failTask(taskId, error instanceof Error ? error.message : "Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}
