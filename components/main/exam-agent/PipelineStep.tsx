"use client";

import { Card } from "@heroui/react";
import { Check, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStep as PipelineStepType, PipelineLogLevel } from "@/lib/exam-agent/types";

// ─── Log level helpers ─────────────────────────────────

const LOG_COLOR: Record<PipelineLogLevel, string> = {
  info: "text-default-500",
  warn: "text-warning",
  error: "text-danger",
  decision: "text-secondary",
};

const LOG_PREFIX: Record<PipelineLogLevel, string> = {
  info: "✓ ",
  warn: "⚡ ",
  error: "✗ ",
  decision: "→ ",
};

// ─── Status icon ───────────────────────────────────────

function StatusIcon({ status }: { status: PipelineStepType["status"] }) {
  if (status === "completed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20">
        <Check className="h-3.5 w-3.5 text-success" />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
        <Circle className="h-3.5 w-3.5 animate-pulse text-primary" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger/10">
        <AlertTriangle className="h-3.5 w-3.5 text-danger" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-default-100">
      <Circle className="h-3.5 w-3.5 text-default-400" />
    </span>
  );
}

// ─── Component ─────────────────────────────────────────

interface PipelineStepProps {
  step: PipelineStepType;
  isLast: boolean;
}

export default function PipelineStep({ step, isLast }: PipelineStepProps) {
  const hasLogs = step.logs.length > 0;

  return (
    <div className="flex gap-3">
      {/* Left column: icon + connector */}
      <div className="flex flex-col items-center">
        <StatusIcon status={step.status} />
        {!isLast && (
          <div
            className={cn(
              "mt-1 w-px flex-1",
              step.status === "completed" ? "bg-success/30" : "bg-default-200",
            )}
          />
        )}
      </div>

      {/* Right column: step name + logs */}
      <div className={cn("min-w-0 flex-1 pb-4", isLast && "pb-1")}>
        <p
          className={cn(
            "mt-0.5 text-sm font-medium leading-6",
            step.status === "completed" && "text-foreground",
            step.status === "running" && "text-primary",
            step.status === "failed" && "text-danger",
            step.status === "pending" && "text-default-400",
          )}
        >
          {step.name}
        </p>

        {hasLogs && (
          <Card className="mt-1.5 border border-default-200 bg-default-900/95">
            <Card.Content className="p-2">
              <div className="space-y-0.5 font-mono text-[11px] leading-5">
                {step.logs.map((entry, idx) => (
                  <p key={idx} className={cn(LOG_COLOR[entry.level])}>
                    <span className="opacity-50">
                      {new Date(entry.timestamp).toISOString().slice(11, 19)}{" "}
                    </span>
                    {LOG_PREFIX[entry.level]}
                    {entry.message}
                  </p>
                ))}
              </div>
            </Card.Content>
          </Card>
        )}
      </div>
    </div>
  );
}
