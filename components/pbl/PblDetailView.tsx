"use client";

import Link from "next/link";
import { ChevronLeft, Download, MessageSquare, Rocket } from "lucide-react";
import { HeroCard } from "@/components/pbl/detail/HeroCard";
import { PhaseTimeline } from "@/components/pbl/detail/PhaseTimeline";
import { DetailRubricTable } from "@/components/pbl/detail/DetailRubricTable";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";
import { isPblUiEnabled } from "@/lib/pbl/feature";
import type { PblPlan } from "@/lib/pbl/types";

type PblDetailViewProps = {
  initialPlan: PblPlan;
};

function formatSearchResultType(type: PblPlan["searchResults"][number]["type"]) {
  if (type === "case") return "Case";
  if (type === "regulation") return "Standard";
  if (type === "pbl_reference") return "PBL Ref";
  if (type === "video") return "Video";
  return "Article";
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function PblDetailView({ initialPlan }: PblDetailViewProps) {
  const plan = initialPlan;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FFFFFF]">
      {/* 顶部导航栏 */}
      <header className="fixed left-[56px] right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-[rgba(0,0,0,0.09)] bg-white/80 px-8 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Link
            href={buildContentAssetsRoute({ type: "pbl" })}
            className="flex items-center gap-2 text-[rgba(0,0,0,0.6)] transition-colors hover:text-[#1D1D1F]"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Back
            </span>
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-[#1D1D1F]">
            {plan.title}
          </h1>
          <div className="flex items-center gap-2">
            <span className="rounded bg-[rgba(221,237,234,0.5)] px-2 py-0.5 text-[10px] font-semibold text-[#0F7B6C]">
              {plan.primarySubject.toUpperCase()}
            </span>
            <span className="rounded bg-[rgba(234,228,242,0.5)] px-2 py-0.5 text-[10px] font-semibold text-[#6940A5]">
              {plan.grade.toUpperCase()}
            </span>
          </div>
        </div>

        {isPblUiEnabled() ? (
          <div className="flex items-center gap-2 border-l border-[rgba(0,0,0,0.09)] pl-4">
            <a
              href={`/api/pbl/projects/${plan.id}/export?format=md`}
              className="p-1.5 text-[rgba(0,0,0,0.6)] transition-colors hover:text-[#1D1D1F]"
              title="Download"
            >
              <Download className="h-5 w-5" />
            </a>
            <Link
              href={`/main/agent?pblPlanId=${encodeURIComponent(plan.id)}`}
              className="p-1.5 text-[rgba(0,0,0,0.6)] transition-colors hover:text-[#1D1D1F]"
              title="Continue in workspace"
            >
              <MessageSquare className="h-5 w-5" />
            </Link>
          </div>
        ) : null}
      </header>

      {/* 主内容区域 */}
      <main className="mt-14 flex min-h-0 flex-1 justify-center overflow-y-auto bg-[#FFFFFF] p-12 lg:p-24">
        <article className="flex w-full max-w-[840px] flex-col gap-16">
          {/* 1. Hero Card - 深色英雄卡片 */}
          <HeroCard plan={plan} />

          {/* 2. Driving Question - 蓝色驱动问题块 */}
          {plan.drivingQuestion ? (
            <section className="rounded-r-xl border-l-4 border-[#5E6AD2] bg-[rgba(94,106,210,0.08)] p-10">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#5E6AD2]">
                The Driving Question
              </p>
              <blockquote className="text-3xl font-semibold italic leading-tight text-[#1D1D1F]">
                &ldquo;{plan.drivingQuestion}&rdquo;
              </blockquote>
            </section>
          ) : null}

          {/* 3. Project Phases - 阶段时间线 */}
          <PhaseTimeline stages={plan.stages} />

          {/* 4. Assessment Rubric - 评估量规表格 */}
          <DetailRubricTable items={plan.rubric} />

          {/* 5. 参考资料来源 */}
          {plan.searchResults.length > 0 ? (
            <section>
              <div className="mb-8 flex items-baseline justify-between">
                <h3 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
                  References
                </h3>
                <span className="text-xs font-medium uppercase tracking-widest text-[rgba(0,0,0,0.6)]">
                  {plan.searchResults.length} Sources
                </span>
              </div>
              <div className="space-y-3">
                {plan.searchResults.map((item, index) => (
                  <div
                    key={`${item.url}-${index}`}
                    className="rounded-xl bg-[#F7F7F7] px-5 py-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[rgba(0,0,0,0.09)] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[rgba(0,0,0,0.6)]">
                        {formatSearchResultType(item.type)}
                      </span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-[#1D1D1F] underline-offset-2 hover:underline"
                      >
                        [{index + 1}] {item.title}
                      </a>
                    </div>
                    {item.snippet ? (
                      <p className="mt-2 text-xs leading-5 text-[rgba(0,0,0,0.6)]">
                        {item.snippet}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 6. Footer Actions - 底部操作按钮 */}
          <footer className="mb-24 flex items-center justify-between border-t border-[rgba(0,0,0,0.09)] pt-12">
            {isPblUiEnabled() ? (
              <div className="flex items-center gap-4">
                <Link
                  href={`/main/agent?pblPlanId=${encodeURIComponent(plan.id)}`}
                  className="flex items-center gap-2 rounded-lg bg-[#1D1D1F] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3a3a3c]"
                >
                  <Rocket className="h-4 w-4" />
                  Deploy to LMS
                </Link>
                <button
                  type="button"
                  className="rounded-lg px-6 py-3 text-sm font-semibold text-[rgba(0,0,0,0.6)] transition-colors hover:bg-[#F7F7F7]"
                >
                  Save as Draft
                </button>
              </div>
            ) : <div />}
            <p className="text-[10px] font-medium uppercase tracking-widest text-[rgba(0,0,0,0.4)]">
              Last edited {formatDate(plan.updatedAt)}
            </p>
          </footer>
        </article>
      </main>
    </div>
  );
}
