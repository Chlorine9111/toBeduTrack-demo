import { runApExercisePipeline } from "@/lib/agent/exercise-pipeline";
import type { ApExercisePipelineOutput } from "@/lib/agent/exercise-pipeline-types";
import type { GatewayModelInput } from "@/lib/ai/gateway";
import { planQuestionSlots, slotsToBlueprintBatches } from "./blueprint-planner";
import { assembleExamResult } from "./assembler";
import { runAgentExamPipeline } from "./agent-orchestrator";
import * as store from "./store";
import type { ExamTask, ExamResult, PipelineLogEntry } from "./types";
import type { AppSupabase } from "@/lib/agent/tools/types";

function log(
  taskId: string,
  stepId: Parameters<typeof store.appendLog>[1],
  message: string,
  level: PipelineLogEntry["level"] = "info",
): void {
  store.appendLog(taskId, stepId, { timestamp: Date.now(), level, message });
}

export async function runExamPipeline(task: ExamTask, supabase?: AppSupabase): Promise<void> {
  const mode = process.env.EXAM_AGENT_MODE ?? "pipeline";
  if (mode === "agent" && supabase) {
    return runAgentExamPipeline(task, supabase);
  }
  return runExamPipelineLegacy(task);
}

async function runExamPipelineLegacy(task: ExamTask): Promise<void> {
  const { id: taskId, config } = task;
  const model: GatewayModelInput = "claude-haiku-4-5-20251001";

  try {
    // Step 1: Analyze Curriculum
    store.updateStepStatus(taskId, "analyze-curriculum", "running");
    log(taskId, "analyze-curriculum", `课程: ${config.subjectName}`);
    log(taskId, "analyze-curriculum", `单元: ${config.unitNames.join(", ")}`);

    // 使用 config 中的信息直接构建课程上下文（不依赖 supabase）
    const curriculumContext = {
      courseName: config.subjectName,
      unitName: config.unitNames[0] ?? null,
      topicName: null,
      contextText: "",
    };

    log(
      taskId,
      "analyze-curriculum",
      `课程解析完成: ${curriculumContext.courseName}`,
      "decision",
    );
    if (curriculumContext.unitName) {
      log(
        taskId,
        "analyze-curriculum",
        `单元: ${curriculumContext.unitName}`,
      );
    }
    store.updateStepStatus(taskId, "analyze-curriculum", "completed");

    // Step 2: Plan Blueprint
    store.updateStepStatus(taskId, "plan-blueprint", "running");

    const slots = planQuestionSlots(config);
    const batches = slotsToBlueprintBatches(config, slots);

    const mcCount = slots.filter((s) => s.type === "MC").length;
    const frCount = slots.filter((s) => s.type === "FR").length;
    log(
      taskId,
      "plan-blueprint",
      `题型分配: ${mcCount} MC + ${frCount} FR`,
      "decision",
    );

    const easyCount = slots.filter((s) => s.difficultyBand === "基础巩固").length;
    const medCount = slots.filter((s) => s.difficultyBand === "中等应用").length;
    const hardCount = slots.filter((s) => s.difficultyBand === "高阶分析").length;
    log(
      taskId,
      "plan-blueprint",
      `难度曲线: ${easyCount} 基础 / ${medCount} 中等 / ${hardCount} 高阶`,
      "decision",
    );
    log(
      taskId,
      "plan-blueprint",
      `分 ${batches.length} 批生成，每批 ≤5 题`,
      "info",
    );

    store.updateStepStatus(taskId, "plan-blueprint", "completed");

    // Step 3: Generate Questions
    store.updateStepStatus(taskId, "generate-questions", "running");

    const allOutputs: ApExercisePipelineOutput[] = [];
    let completedCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const blueprint = batches[i];
      log(
        taskId,
        "generate-questions",
        `批次 ${i + 1}/${batches.length}: 生成 ${blueprint.count} 题 (${blueprint.exerciseType}) — ${blueprint.unit ?? ""}`,
        "info",
      );

      const output = await runApExercisePipeline({
        model,
        teacherRequest: blueprint.teacherIntent,
        count: blueprint.count,
        exerciseType: blueprint.exerciseType,
        language: config.language,
        blueprintOverride: blueprint,
        curriculumContextOverride: curriculumContext,
      });

      allOutputs.push(output);
      completedCount += output.metrics.passed;

      log(
        taskId,
        "generate-questions",
        `批次 ${i + 1} 完成: ${output.metrics.passed} 通过, ${output.metrics.rejected} 拒绝`,
      );
      if (output.metrics.rejected > 0) {
        for (const rej of output.rejectedExercises) {
          log(taskId, "generate-questions", `拒绝: ${rej.reason}`, "warn");
        }
      }

      store.updateProgress(taskId, completedCount, config.questionCount);
    }

    store.updateStepStatus(taskId, "generate-questions", "completed");

    // Step 4: Verify & Review
    store.updateStepStatus(taskId, "verify-review", "running");

    const mergedOutput: ApExercisePipelineOutput = {
      ...allOutputs[0],
      passedExercises: allOutputs.flatMap((o) => o.passedExercises),
      passedResults: allOutputs.flatMap((o) => o.passedResults),
      rejectedExercises: allOutputs.flatMap((o) => o.rejectedExercises),
      metrics: {
        ...allOutputs[0].metrics,
        requested: allOutputs.reduce((s, o) => s + o.metrics.requested, 0),
        passed: allOutputs.reduce((s, o) => s + o.metrics.passed, 0),
        rejected: allOutputs.reduce((s, o) => s + o.metrics.rejected, 0),
        totalModelCalls: allOutputs.reduce(
          (s, o) => s + o.metrics.totalModelCalls,
          0,
        ),
        timings: {
          blueprintMs: allOutputs.reduce(
            (s, o) => s + o.metrics.timings.blueprintMs,
            0,
          ),
          curriculumMs: allOutputs.reduce(
            (s, o) => s + o.metrics.timings.curriculumMs,
            0,
          ),
          generationMs: allOutputs.reduce(
            (s, o) => s + o.metrics.timings.generationMs,
            0,
          ),
          teacherReviewMs: allOutputs.reduce(
            (s, o) => s + o.metrics.timings.teacherReviewMs,
            0,
          ),
          verificationMs: allOutputs.reduce(
            (s, o) => s + o.metrics.timings.verificationMs,
            0,
          ),
          repairMs: allOutputs.reduce(
            (s, o) => s + o.metrics.timings.repairMs,
            0,
          ),
          totalMs: allOutputs.reduce(
            (s, o) => s + o.metrics.timings.totalMs,
            0,
          ),
        },
      },
    };

    const repairedCount = mergedOutput.passedResults.filter(
      (r) => r.repaired,
    ).length;
    log(
      taskId,
      "verify-review",
      `总计通过: ${mergedOutput.metrics.passed} 题`,
      "decision",
    );
    log(taskId, "verify-review", `修复后通过: ${repairedCount} 题`);
    log(taskId, "verify-review", `拒绝: ${mergedOutput.metrics.rejected} 题`);

    store.updateStepStatus(taskId, "verify-review", "completed");

    // Step 5: Assemble Exam
    store.updateStepStatus(taskId, "assemble-exam", "running");

    const result: ExamResult = assembleExamResult(config, mergedOutput);

    log(taskId, "assemble-exam", `试卷名称: ${result.examName}`);
    for (const section of result.sections) {
      log(
        taskId,
        "assemble-exam",
        `${section.title}: ${section.questions.length} 题, 共 ${section.totalPoints} 分`,
        "decision",
      );
    }
    log(
      taskId,
      "assemble-exam",
      `平均质量: ${result.stats.averageQuality}/10`,
    );

    store.updateStepStatus(taskId, "assemble-exam", "completed");

    store.completeTask(taskId, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    store.failTask(taskId, message);
  }
}
