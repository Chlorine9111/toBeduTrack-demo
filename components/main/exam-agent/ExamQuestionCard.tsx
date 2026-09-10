"use client";

import { Card, Chip } from "@heroui/react";
import { cn } from "@/lib/utils";
import type { ExamQuestion, ExamQuestionVerificationStatus } from "@/lib/exam-agent/types";
import type { ExerciseDifficulty } from "@/types/exercise";

// ─── Verification chip ─────────────────────────────────

const VERIFICATION_CONFIG: Record<
  ExamQuestionVerificationStatus,
  { label: string; color: "success" | "warning" | "danger" }
> = {
  passed: { label: "通过", color: "success" },
  repaired: { label: "已修复", color: "warning" },
  warning: { label: "警告", color: "danger" },
};

// ─── Difficulty label ──────────────────────────────────

function difficultyLabel(difficulty: ExerciseDifficulty): string {
  if (difficulty === "easy") return "较易";
  if (difficulty === "medium") return "中等";
  return "困难";
}

// ─── Component ─────────────────────────────────────────

interface ExamQuestionCardProps {
  question: ExamQuestion;
  showAnswer?: boolean;
}

export default function ExamQuestionCard({ question, showAnswer = false }: ExamQuestionCardProps) {
  const { exercise } = question;
  const verificationCfg = VERIFICATION_CONFIG[question.verificationStatus];
  const isMc = exercise.type === "MC";
  const options = exercise.options ?? [];

  return (
    <Card className="border border-default-200 shadow-none">
      <Card.Content className="gap-3 p-4">
        {/* Top metadata row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Index badge */}
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {question.index}
          </span>

          <span className="text-xs text-default-500">{question.topicName}</span>
          <span className="rounded-md bg-default-100 px-1.5 py-0.5 text-[10px] text-default-500">
            {difficultyLabel(exercise.difficulty)}
          </span>
          <span className="rounded-md bg-secondary/10 px-1.5 py-0.5 text-[10px] text-secondary">
            {question.bloomLevel}
          </span>

          {/* Spacer */}
          <span className="flex-1" />

          {/* Verification chip */}
          <Chip
            size="sm"
            color={verificationCfg.color}
            variant="soft"
            className="h-5 text-[10px]"
          >
            {verificationCfg.label}
          </Chip>

          {/* Quality score */}
          <span
            className={cn(
              "text-xs font-semibold",
              question.qualityScore >= 0.8
                ? "text-success"
                : question.qualityScore >= 0.6
                  ? "text-warning"
                  : "text-danger",
            )}
          >
            {Math.round(question.qualityScore * 100)}分
          </span>
        </div>

        {/* Question text */}
        <p className="text-sm leading-6 text-foreground">{exercise.questionText}</p>

        {/* MC options grid */}
        {isMc && options.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {options.map((opt) => (
              <div key={opt.label} className="flex gap-2 text-sm">
                <span
                  className={cn(
                    "shrink-0 font-semibold",
                    showAnswer && opt.isCorrect ? "text-success" : "text-default-700",
                  )}
                >
                  {opt.label}.
                </span>
                <span
                  className={cn(
                    "text-default-600",
                    showAnswer && opt.isCorrect && "font-medium text-success",
                  )}
                >
                  {opt.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Answer + solution (when showAnswer=true) */}
        {showAnswer && (
          <div className="mt-1 space-y-2 rounded-xl border border-success/20 bg-success/5 p-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-success">
                答案
              </span>
              <span className="text-sm font-medium text-foreground">{exercise.correctAnswer}</span>
            </div>
            {exercise.solutionSteps && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-default-500">
                  解析
                </span>
                <p className="mt-0.5 text-xs leading-5 text-default-600">{exercise.solutionSteps}</p>
              </div>
            )}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
