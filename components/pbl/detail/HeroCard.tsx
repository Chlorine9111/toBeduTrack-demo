import { Sparkles } from "lucide-react";
import type { PblPlan } from "@/lib/pbl/types";

const DIFFICULTY_LABELS: Record<string, string> = {
  basic: "Basic",
  advanced: "Advanced",
  challenge: "Challenge",
};

type HeroCardProps = {
  plan: PblPlan;
};

export function HeroCard({ plan }: HeroCardProps) {
  return (
    <section className="relative overflow-hidden rounded-xl bg-[#1D1D1F] p-8 text-white sm:p-12">
      <div className="relative z-10">
        {/* AI Generated 标签 */}
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#5E6AD2]" />
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">
            AI Generated Curriculum
          </span>
        </div>

        {/* 标题 */}
        <h2 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl lg:leading-[1.1]">
          {plan.title}
        </h2>

        {/* 描述 */}
        <p className="mb-12 max-w-xl text-lg leading-relaxed text-white/80">
          {plan.overviewText}
        </p>

        {/* 指标网格 */}
        <div className="grid grid-cols-2 gap-8 border-t border-white/10 pt-10 md:grid-cols-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Difficulty
            </p>
            <p className="text-lg font-medium">
              {DIFFICULTY_LABELS[plan.difficulty] ?? plan.difficulty}
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Duration
            </p>
            <p className="text-lg font-medium">
              {plan.totalPeriods} Periods
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Subject
            </p>
            <p className="text-lg font-medium">{plan.primarySubject}</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Standard
            </p>
            <p className="text-lg font-medium">
              {plan.curriculumSystem} {plan.grade}
            </p>
          </div>
        </div>
      </div>

      {/* 背景渐变装饰 */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-linear-to-l from-white/5 to-transparent" />
    </section>
  );
}
