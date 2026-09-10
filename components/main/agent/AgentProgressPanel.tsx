"use client";

import { CheckCircle2 } from "lucide-react";
import { Card, Chip, Separator, Spinner } from "@heroui/react";
import { cn } from "@/lib/utils";
import type { TimelineItem } from "@/components/main/agent/stream-runner";
import type { PendingClarification } from "@/components/main/agent/workspace-types";
import {
  formatTimelineDuration,
  humanizeTimelineDetail,
  humanizeTimelineTitle,
} from "@/components/main/agent/workspace-utils";

type AgentProgressPanelProps = {
  isZh: boolean;
  restoringConversation: boolean;
  streaming: boolean;
  timelineTotalMs: number | null;
  processingHeadline: string;
  activeTimelineItem: TimelineItem | null;
  visibleTimelineItems: TimelineItem[];
  pendingClarification: PendingClarification | null;
};

export default function AgentProgressPanel({
  isZh,
  restoringConversation,
  streaming,
  timelineTotalMs,
  processingHeadline,
  activeTimelineItem,
  visibleTimelineItems,
  pendingClarification,
}: AgentProgressPanelProps) {
  const isWorking =
    Boolean(activeTimelineItem) ||
    restoringConversation ||
    streaming;

  return (
    <Card
      data-testid="agent-progress-panel"
      className="border border-slate-200 bg-white/95 shadow-xs"
    >
    <Card.Content className="p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            isWorking
              ? "bg-default-100 text-foreground"
              : "bg-emerald-50 text-emerald-600",
          )}
        >
          {isWorking ? (
            <Spinner size="sm" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {isZh ? "处理进度" : "Progress"}
            </p>
            {timelineTotalMs && !isWorking ? (
              <Chip size="sm">
                {formatTimelineDuration(timelineTotalMs, isZh)}
              </Chip>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {processingHeadline || (isZh ? "准备开始处理。" : "Ready to start.")}
          </p>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            {pendingClarification
              ? isZh
                ? "先补充上方这条信息，我再继续往下执行。"
                : "Reply to the clarification above so I can continue."
              : isZh
                ? "我会按步骤处理，并持续把当前进展显示在这里。"
                : "I will work step by step and keep this panel updated."}
          </p>
        </div>
      </div>

      {visibleTimelineItems.length > 0 ? (
        <div className="mt-3 space-y-2 pt-3">
          <Separator className="mb-2" />
          {visibleTimelineItems.map((item) => (
            <div key={item.id} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  "mt-1 inline-flex h-2 w-2 shrink-0 rounded-full",
                  item.status === "error"
                    ? "bg-rose-500"
                    : item.status === "done"
                      ? "bg-emerald-500"
                      : "bg-amber-400",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">
                    {humanizeTimelineTitle(item.title, isZh)}
                  </span>
                  {item.durationMs ? (
                    <span className="text-xs text-slate-400">
                      {formatTimelineDuration(item.durationMs, isZh)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs leading-6 text-slate-500">
                  {item.status === "error"
                    ? humanizeTimelineDetail(item.detail, isZh)
                    : item.status === "done"
                      ? isZh
                        ? "已完成，正在继续下一步。"
                        : "Done. Moving to the next step."
                      : isZh
                        ? "处理中，请稍候。"
                        : "In progress."}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card.Content>
    </Card>
  );
}
