"use client";

import { useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Chip, Disclosure, Spinner, Tooltip } from "@heroui/react";
import { cn } from "@/lib/utils";
import type {
  ProcessSummary,
  TimelineItem,
  WorkingNote,
} from "@/components/main/agent/stream-runner";
import {
  formatTimelineDuration,
  humanizeTimelineDetail,
  humanizeTimelineTitle,
} from "@/components/main/agent/workspace-utils";

type AgentThinkingStripProps = {
  isZh: boolean;
  processingHeadline: string;
  visibleTimelineItems: TimelineItem[];
  activeTimelineItem: TimelineItem | null;
  timelineTotalMs: number | null;
  workingNotes: WorkingNote[];
  processSummary: ProcessSummary | null;
};

/* ─── Step Pill ────────────────────────────────────────────── */

function StepPill({ item, isZh }: { item: TimelineItem; isZh: boolean }) {
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const isRunning = item.status === "running";

  const statusIcon = isError ? (
    <CircleAlert className="size-2.5 text-danger" />
  ) : isDone ? (
    <Check className="size-2.5 text-success" strokeWidth={2.5} />
  ) : (
    <div className="size-1.5 rounded-full bg-accent animate-pulse" />
  );

  const chipColor: "danger" | "accent" | "default" = isError
    ? "danger"
    : isRunning
      ? "accent"
      : "default";

  const title = humanizeTimelineTitle(item.title, isZh);
  const hasDetail = Boolean(item.detail || item.outputPreview);

  const chip = (
    <Chip
      size="sm"
      color={chipColor}
      variant="soft"
      className={cn(
        "h-5 max-w-[140px] shrink-0 cursor-default px-1.5 text-[10px]",
        isRunning && "ws-animate-pulse-opacity",
      )}
    >
      {statusIcon}
      <Chip.Label className="truncate">{title}</Chip.Label>
      {item.durationMs ? (
        <span className="ml-0.5 text-[9px] opacity-60">
          {formatTimelineDuration(item.durationMs, isZh)}
        </span>
      ) : null}
    </Chip>
  );

  if (!hasDetail) return chip;

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>{chip}</Tooltip.Trigger>
      <Tooltip.Content placement="top" className="max-w-xs text-xs">
        <p className="font-medium">{title}</p>
        {item.detail ? (
          <p className="mt-0.5 text-muted">
            {humanizeTimelineDetail(item.detail, isZh)}
          </p>
        ) : null}
        {item.outputPreview ? (
          <p className="mt-0.5 truncate text-muted">{item.outputPreview}</p>
        ) : null}
      </Tooltip.Content>
    </Tooltip>
  );
}

/* ─── Expanded Detail ──────────────────────────────────────── */

function ExpandedThinkingDetail({
  items,
  notes,
  summary,
  isZh,
}: {
  items: TimelineItem[];
  notes: WorkingNote[];
  summary: ProcessSummary | null;
  isZh: boolean;
}) {
  return (
    <div className="space-y-1.5 text-[12px]">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 text-muted">
          <StepPill item={item} isZh={isZh} />
          {item.outputPreview ? (
            <span className="max-w-[200px] truncate text-[11px] opacity-60">
              {item.outputPreview}
            </span>
          ) : null}
        </div>
      ))}

      {notes.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {notes.map((note) => (
            <p key={note.id} className="text-[11px] leading-snug text-muted">
              <span className="font-medium text-foreground">
                {note.title}
              </span>
              {note.markdown ? (
                <span className="ml-1 opacity-70">
                  &mdash;{" "}
                  {note.markdown.length > 100
                    ? `${note.markdown.slice(0, 100)}…`
                    : note.markdown}
                </span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

      {summary?.markdown ? (
        <p className="mt-1 border-t border-divider pt-1.5 text-[11px] leading-snug text-muted">
          {summary.markdown}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────── */

export default function AgentThinkingStrip({
  isZh,
  processingHeadline,
  visibleTimelineItems,
  activeTimelineItem,
  timelineTotalMs,
  workingNotes,
  processSummary,
}: AgentThinkingStripProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isFinished = timelineTotalMs !== null;
  const hasRunningWorkingNote = workingNotes.some(
    (n) => n.status === "running",
  );
  const isWorking =
    !isFinished && (Boolean(activeTimelineItem) || hasRunningWorkingNote);
  const hasError = visibleTimelineItems.some((i) => i.status === "error");

  /* Running: single-line micro-status */
  if (isWorking) {
    return (
      <div className="ws-animate-slide-up flex items-center gap-1.5 py-1">
        <Spinner size="sm" className="size-3 text-accent" />
        <span className="ws-animate-pulse-opacity text-[12px] text-muted">
          {processingHeadline || (isZh ? "处理中…" : "Processing…")}
        </span>
        {visibleTimelineItems.length > 0 ? (
          <div className="ml-1 flex items-center gap-1">
            {visibleTimelineItems.map((item) => (
              <StepPill key={item.id} item={item} isZh={isZh} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  /* Error: always visible */
  if (hasError) {
    return (
      <div className="ws-animate-slide-up space-y-1.5 py-1">
        <div className="flex items-center gap-1.5">
          <CircleAlert className="size-3 text-danger" />
          <span className="text-[12px] font-medium text-danger">
            {isZh ? "处理出错" : "Processing error"}
          </span>
        </div>
        <div className="ml-4 flex flex-wrap items-center gap-1">
          {visibleTimelineItems.map((item) => (
            <StepPill key={item.id} item={item} isZh={isZh} />
          ))}
        </div>
        {workingNotes.length > 0 || processSummary?.markdown ? (
          <div className="ml-4">
            <ExpandedThinkingDetail
              items={[]}
              notes={workingNotes}
              summary={processSummary}
              isZh={isZh}
            />
          </div>
        ) : null}
      </div>
    );
  }

  /* Done: collapsible Disclosure */
  if (isFinished) {
    return (
      <div className="ws-animate-fade-in py-0.5">
        <Disclosure
          isExpanded={isExpanded}
          onExpandedChange={setIsExpanded}
        >
          <Disclosure.Heading>
            <Disclosure.Trigger className="flex w-full items-center gap-1.5 py-1 text-[12px] text-muted transition-colors hover:text-foreground">
              <div className="flex size-3.5 items-center justify-center rounded-full bg-success/10">
                <Check className="size-2 text-success" strokeWidth={3} />
              </div>
              <span className="font-medium">
                {isZh ? "思考完成" : "Done thinking"}
              </span>
              {timelineTotalMs ? (
                <Chip
                  size="sm"
                  variant="soft"
                  className="h-4 px-1 text-[10px] text-muted"
                >
                  {formatTimelineDuration(timelineTotalMs, isZh)}
                </Chip>
              ) : null}
              {!isExpanded ? (
                <div className="flex items-center gap-1 overflow-hidden">
                  {visibleTimelineItems.map((item) => (
                    <StepPill key={item.id} item={item} isZh={isZh} />
                  ))}
                </div>
              ) : null}
              <Disclosure.Indicator className="ml-auto size-3 shrink-0 text-muted" />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="pb-1 pl-5 pt-1">
              <ExpandedThinkingDetail
                items={visibleTimelineItems}
                notes={workingNotes}
                summary={processSummary}
                isZh={isZh}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      </div>
    );
  }

  return null;
}
