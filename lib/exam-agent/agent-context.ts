import type { AppSupabase } from "@/lib/agent/tools/types";
import type { ExamTaskConfig, PipelineStepId } from "./types";
import type { ApExercisePipelineOutput } from "@/lib/agent/exercise-pipeline-types";
import type { ApQuestionBankListItem } from "@/lib/question-bank/ap-types";
import * as store from "./store";

export type ExamAgentContext = {
  taskId: string;
  teacherId: string;
  config: ExamTaskConfig;
  supabase: AppSupabase;

  // Accumulated state — TIKU question bank items
  candidates: ApQuestionBankListItem[];
  selectedQuestionIds: string[];
  generatedResults: ApExercisePipelineOutput[];
  examResult?: import("./types").ExamResult;

  // Step tracking
  stepManager: StepManager;
};

export class StepManager {
  private taskId: string;
  private activeStep: PipelineStepId | null = null;
  private completedSteps = new Set<PipelineStepId>();

  constructor(taskId: string) {
    this.taskId = taskId;
  }

  enter(stepId: PipelineStepId): void {
    if (this.completedSteps.has(stepId)) return;
    if (this.activeStep && this.activeStep !== stepId) {
      store.updateStepStatus(this.taskId, this.activeStep, "completed");
      this.completedSteps.add(this.activeStep);
    }
    if (this.activeStep !== stepId) {
      store.updateStepStatus(this.taskId, stepId, "running");
      this.activeStep = stepId;
    }
  }

  log(message: string, level: "info" | "warn" | "error" | "decision" = "info"): void {
    if (!this.activeStep) return;
    store.appendLog(this.taskId, this.activeStep, { timestamp: Date.now(), level, message });
  }

  complete(stepId?: PipelineStepId): void {
    const target = stepId ?? this.activeStep;
    if (!target) return;
    store.updateStepStatus(this.taskId, target, "completed");
    this.completedSteps.add(target);
    if (this.activeStep === target) this.activeStep = null;
  }

  completeAll(): void {
    const allSteps: PipelineStepId[] = [
      "analyze-curriculum",
      "plan-blueprint",
      "generate-questions",
      "verify-review",
      "assemble-exam",
    ];
    for (const step of allSteps) {
      if (!this.completedSteps.has(step)) {
        store.updateStepStatus(this.taskId, step, "completed");
        this.completedSteps.add(step);
      }
    }
    this.activeStep = null;
  }
}
