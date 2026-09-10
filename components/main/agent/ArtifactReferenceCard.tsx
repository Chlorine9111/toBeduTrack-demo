"use client";

import { Card, Chip } from "@heroui/react";
import { ArrowUpRight, BookOpenText, ClipboardCheck, FileSearch, FileText, Lightbulb, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentArtifact } from "@/components/main/agent/artifact-utils";
import { getArtifactKindDescription, getArtifactKindLabel } from "@/components/main/agent/artifact-utils";

function stripMarkdown(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ArtifactReferenceCardProps = {
  artifact: AgentArtifact;
  active?: boolean;
  onOpen: (artifactId: string) => void;
  isZh?: boolean;
};

function ArtifactIcon({ kind }: Pick<AgentArtifact, "kind">) {
  if (kind === "lesson-plan") return <BookOpenText className="size-4" />;
  if (kind === "rubric") return <ClipboardCheck className="size-4" />;
  if (kind === "research") return <FileSearch className="size-4" />;
  if (kind === "exercises") return <ScrollText className="size-4" />;
  if (kind === "exam") return <FileText className="size-4" />;
  if (kind === "pbl") return <Lightbulb className="size-4" />;
  return <FileText className="size-4" />;
}

export default function ArtifactReferenceCard({ artifact, active = false, onOpen, isZh = true }: ArtifactReferenceCardProps) {
  const pblMetadata = artifact.kind === "pbl" ? artifact.pblMetadata : null;
  const pblSummary = pblMetadata?.coreChallenge || artifact.summary;
  const pblMetaBits = [
    pblMetadata?.primarySubject,
    pblMetadata?.grade,
    pblMetadata?.totalPeriods ? `${pblMetadata.totalPeriods} 课时` : null,
    pblMetadata?.stageCount ? `${pblMetadata.stageCount} 阶段` : null,
  ].filter(Boolean);
  const pblReferenceText =
    pblMetadata?.referenceCount && pblMetadata.referenceCount > 0
      ? `已绑定 ${pblMetadata.referenceCount} 条参考资料`
      : null;

  return (
    <Card
      data-testid="agent-artifact-reference"
      onClick={() => onOpen(artifact.id)}
      role="button"
      tabIndex={0}
      className={cn(
        "group w-full cursor-pointer text-left transition-all duration-150 active:scale-[0.98]",
        active
          ? "border-accent bg-accent/10 text-foreground"
          : "border-divider bg-surface hover:-translate-y-0.5 hover:border-muted hover:shadow-md",
      )}
    >
    <Card.Content className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
              active ? "bg-accent/15 text-accent" : "bg-surface-secondary text-muted",
            )}
          >
            <ArtifactIcon kind={artifact.kind} />
          </div>
          {/* Content */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Chip
                size="sm"
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  active ? "bg-accent/10 text-accent" : "",
                )}
              >
                {getArtifactKindLabel(artifact.kind, isZh)}
              </Chip>
              <span className={cn("text-[11px]", active ? "text-muted" : "text-muted")}>
                {getArtifactKindDescription(artifact.kind, isZh)}
              </span>
            </div>
            <p className="mt-2 truncate text-sm font-semibold">{artifact.title}</p>
            {artifact.kind === "pbl" ? (
              <div className="mt-2 space-y-2">
                {pblMetaBits.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {pblMetaBits.map((item) => (
                      <Chip
                        key={item}
                        size="sm"
                        className={cn(
                          active ? "bg-accent/8 text-accent" : "",
                        )}
                      >
                        {item}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                <p className={cn("text-[13px] leading-relaxed line-clamp-3", active ? "text-foreground/80" : "text-muted")}>
                  {pblSummary}
                </p>
                {pblReferenceText ? (
                  <p className={cn("text-[11px]", active ? "text-warning/90" : "text-warning")}>
                    {pblReferenceText}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className={cn("mt-1.5 truncate text-[13px] leading-relaxed", active ? "text-foreground/80" : "text-muted")}>
                {stripMarkdown(artifact.summary)}
              </p>
            )}
          </div>
        </div>
        <ArrowUpRight
          className={cn(
            "mt-0.5 size-4 shrink-0 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5",
            active ? "text-accent" : "text-muted group-hover:text-foreground",
          )}
        />
      </div>
    </Card.Content>
    </Card>
  );
}
