import type { ApExercisePipelineOutput, PipelineExercise } from "@/lib/agent/exercise-pipeline-types";

// ─── Task Config ───────────────────────────────────────

export type ExamTaskStatus = "configuring" | "running" | "completed" | "paused" | "failed";

export type DifficultyPreference = "easy" | "balanced" | "hard";

export type ExamTaskConfig = {
  subject: string;
  subjectName: string;
  units: string[];
  unitNames: string[];
  questionCount: number;
  questionTypes: ("MC" | "FR")[];
  difficultyPreference: DifficultyPreference;
  language: "中文" | "英文";
  examName?: string;
};

// ─── Pipeline ──────────────────────────────────────────

export type PipelineStepId =
  | "analyze-curriculum"
  | "plan-blueprint"
  | "generate-questions"
  | "verify-review"
  | "assemble-exam";

export type PipelineStepStatus = "pending" | "running" | "completed" | "failed";

export type PipelineLogLevel = "info" | "warn" | "error" | "decision";

export type PipelineLogEntry = {
  timestamp: number;
  level: PipelineLogLevel;
  message: string;
};

export type PipelineStep = {
  id: PipelineStepId;
  name: string;
  status: PipelineStepStatus;
  startedAt?: number;
  completedAt?: number;
  logs: PipelineLogEntry[];
};

// ─── Exam Result ───────────────────────────────────────

export type ExamQuestionVerificationStatus = "passed" | "repaired" | "warning";

export type ExamQuestion = {
  index: number;
  exercise: PipelineExercise;
  topicId: string;
  topicName: string;
  bloomLevel: string;
  verificationStatus: ExamQuestionVerificationStatus;
  qualityScore: number;
};

export type ExamSection = {
  title: string;
  questionType: "MC" | "FR";
  pointsPerQuestion: number;
  totalPoints: number;
  questions: ExamQuestion[];
};

export type ExamResultStats = {
  totalQuestions: number;
  passedCount: number;
  repairedCount: number;
  averageQuality: number;
  topicCoverage: number;
  totalTimeMs: number;
};

export type ExamResult = {
  examName: string;
  sections: ExamSection[];
  stats: ExamResultStats;
  pipelineOutput: ApExercisePipelineOutput;
};

// ─── Task ──────────────────────────────────────────────

export type ExamTask = {
  id: string;
  teacherId: string;
  config: ExamTaskConfig;
  status: ExamTaskStatus;
  pipelineSteps: PipelineStep[];
  progress: { current: number; total: number };
  result?: ExamResult;
  error?: string;
  createdAt: number;
  completedAt?: number;
};

// ─── SSE Events ────────────────────────────────────────

export type ExamSseEvent =
  | { type: "step-update"; stepId: PipelineStepId; status: PipelineStepStatus }
  | { type: "log"; stepId: PipelineStepId; entry: PipelineLogEntry }
  | { type: "progress"; current: number; total: number }
  | { type: "completed"; result: ExamResult }
  | { type: "failed"; error: string }
  | { type: "heartbeat" }
  | { type: "agent-reasoning"; text: string };

// ─── Helpers ───────────────────────────────────────────

export function createInitialPipelineSteps(): PipelineStep[] {
  return [
    { id: "analyze-curriculum", name: "分析课程大纲", status: "pending", logs: [] },
    { id: "plan-blueprint", name: "制定出卷蓝图", status: "pending", logs: [] },
    { id: "generate-questions", name: "生成题目", status: "pending", logs: [] },
    { id: "verify-review", name: "验证与质量审查", status: "pending", logs: [] },
    { id: "assemble-exam", name: "组装试卷", status: "pending", logs: [] },
  ];
}
