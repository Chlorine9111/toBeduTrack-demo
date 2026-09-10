"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button, Chip } from "@heroui/react";
import LinkButton from "@/components/shells/LinkButton";
import { Link2, Lightbulb } from "lucide-react";
import DotPulseLoader from "@/components/main/agent/DotPulseLoader";
import { PblDocumentView } from "@/components/pbl/PblDocumentView";
import type { AgentArtifact } from "@/components/main/agent/artifact-utils";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";
import { isPblUiEnabled } from "@/lib/pbl/feature";
import type { PblPlan } from "@/lib/pbl/types";

const ProjectPlanView = dynamic(
  () => import("@/components/pbl/ProjectPlanView").then((module) => module.ProjectPlanView),
  {
    loading: () => (
      <section className="rounded-[28px] border border-divider bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <DotPulseLoader className="text-muted" />
          正在加载 PBL 详情组件...
        </div>
      </section>
    ),
  },
);

type MetadataSearchResult = NonNullable<
  NonNullable<AgentArtifact["pblMetadata"]>["searchResults"]
>[number];

function formatSearchResultType(type: MetadataSearchResult["type"]) {
  if (type === "case") return "案例";
  if (type === "regulation") return "标准/法规";
  if (type === "pbl_reference") return "PBL 参考";
  if (type === "video") return "视频";
  return "文章";
}

type PlanResponse = {
  plan: PblPlan;
};

function LoadingPanel({ isZh }: { isZh: boolean }) {
  return (
    <section className="rounded-[28px] border border-divider bg-white p-5 shadow-xs">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
        {isZh ? "正在加载完整 PBL 方案视图..." : "Loading the full PBL plan view..."}
      </div>
    </section>
  );
}

export default function ArtifactPblView({
  artifact,
  isZh,
}: {
  artifact: AgentArtifact;
  isZh: boolean;
}) {
  const metadata = artifact.pblMetadata;
  const planId = metadata?.planId ?? null;
  const [plan, setPlan] = useState<PblPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!planId) {
      setPlan(null);
      setLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadPlan() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(`/api/pbl/projects/${planId}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        const data = (await response.json().catch(() => null)) as PlanResponse | null;
        if (!response.ok || !data?.plan) {
          throw new Error(isZh ? "读取 PBL 项目失败" : "Failed to load the PBL project");
        }
        if (!cancelled) {
          setPlan(data.plan);
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        setPlan(null);
        setLoadError(
          error instanceof Error
            ? error.message
            : isZh
              ? "读取 PBL 项目失败"
              : "Failed to load the PBL project",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPlan();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isZh, planId]);

  const searchResults = plan?.searchResults ?? metadata?.searchResults ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-divider bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700">
              <Lightbulb className="h-3.5 w-3.5" />
              {isZh ? "PBL 项目方案" : "PBL Project"}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              {plan?.primarySubject || metadata?.primarySubject ? <span>{plan?.primarySubject ?? metadata?.primarySubject}</span> : null}
              {plan?.grade || metadata?.grade ? <span>{plan?.grade ?? metadata?.grade}</span> : null}
              {plan?.curriculumSystem || metadata?.curriculumSystem ? <span>{plan?.curriculumSystem ?? metadata?.curriculumSystem}</span> : null}
              {plan?.version || metadata?.version ? <span>{isZh ? `版本 ${plan?.version ?? metadata?.version}` : `Version ${plan?.version ?? metadata?.version}`}</span> : null}
            </div>
          </div>
          {planId && isPblUiEnabled() ? (
            <LinkButton
              href={buildContentAssetsRoute({
                type: "pbl",
                originEntityId: planId,
              })}
              variant="secondary"
              size="sm"
              className="rounded-full"
            >
              <Link2 className="h-3.5 w-3.5" />
              {isZh ? "在内容资产中打开" : "Open in Assets"}
            </LinkButton>
          ) : null}
        </div>
      </section>

      {loading ? <LoadingPanel isZh={isZh} /> : null}

      {plan ? (
        <ProjectPlanView plan={plan} showStudentVersion={false} />
      ) : (
        <div className="space-y-4">
          {loadError ? (
            <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-xs">
              {loadError}
            </section>
          ) : null}
          <PblDocumentView markdown={artifact.rawContent} />
        </div>
      )}

      {searchResults.length > 0 ? (
        <section className="rounded-[28px] border border-divider bg-white p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-900">{isZh ? "参考资料来源" : "Reference Sources"}</h3>
          <div className="mt-4 space-y-3">
            {searchResults.map((item, index) => (
              <div key={`${item.url}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip size="sm">
                    {formatSearchResultType(item.type)}
                  </Chip>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    [{index + 1}] {item.title}
                  </a>
                </div>
                {item.snippet ? <p className="mt-2 text-xs leading-5 text-slate-600">{item.snippet}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
