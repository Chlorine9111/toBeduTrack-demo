import { Circle } from "lucide-react";
import type { PblStage } from "@/lib/pbl/types";

type PhaseTimelineProps = {
  stages: PblStage[];
};

function padNumber(n: number): string {
  return n.toString().padStart(2, "0");
}

export function PhaseTimeline({ stages }: PhaseTimelineProps) {
  if (stages.length === 0) return null;

  return (
    <section>
      {/* 标题行 */}
      <div className="mb-12 flex items-baseline justify-between">
        <h3 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
          Project Phases
        </h3>
        <span className="text-xs font-medium uppercase tracking-widest text-[rgba(0,0,0,0.6)]">
          {padNumber(stages.length)} Key Milestones
        </span>
      </div>

      {/* 时间线容器 */}
      <div className="relative space-y-12 before:absolute before:bottom-4 before:left-8 before:top-4 before:w-px before:bg-[rgba(0,0,0,0.09)]">
        {stages.map((stage) => (
          <div key={stage.stageNumber} className="group relative pl-24">
            {/* 编号圆形 */}
            <div className="absolute left-0 top-0 z-10 flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#F7F7F7] bg-white shadow-[0px_4px_20px_rgba(0,0,0,0.04)] transition-transform group-hover:scale-105">
              <span className="text-xl font-bold text-[#1D1D1F]">
                {padNumber(stage.stageNumber)}
              </span>
            </div>

            {/* 阶段内容面板 */}
            <div className="rounded-xl bg-[#F7F7F7] p-8">
              <h4 className="mb-6 text-lg font-semibold text-[#1D1D1F]">
                {stage.name}
              </h4>

              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {/* Activities 列 */}
                <div>
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[rgba(0,0,0,0.4)]">
                    Activities
                  </p>
                  <ul className="space-y-2 text-sm text-[rgba(0,0,0,0.8)]">
                    {stage.coreActivities.map((activity, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Circle className="mt-1.5 h-2 w-2 shrink-0 fill-[#5E6AD2] text-[#5E6AD2]" />
                        {activity}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Objectives 列 */}
                <div>
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[rgba(0,0,0,0.4)]">
                    Objectives
                  </p>
                  <p className="text-sm leading-relaxed text-[rgba(0,0,0,0.8)]">
                    {stage.objective}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
