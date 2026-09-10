"use client";

import { PblDetailView } from "@/components/pbl/PblDetailView";
import type { PblPlan } from "@/lib/pbl/types";

type PlanDetailClientProps = {
  initialPlan: PblPlan;
};

export function PlanDetailClient({ initialPlan }: PlanDetailClientProps) {
  return <PblDetailView initialPlan={initialPlan} />;
}
