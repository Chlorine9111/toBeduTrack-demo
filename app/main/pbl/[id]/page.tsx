import { notFound } from "next/navigation";
import { PblDetailView } from "@/components/pbl/PblDetailView";
import { getPblContext } from "@/lib/pbl/context";
import { getProjectPlan } from "@/lib/pbl/store";

type PblDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PblDetailPage({ params }: PblDetailPageProps) {
  const { id } = await params;
  const contextResult = await getPblContext();

  if (!contextResult.ok) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{contextResult.error.message}</p>
      </div>
    );
  }

  const plan = await getProjectPlan(contextResult.value, id);
  if (!plan) {
    notFound();
  }

  return <PblDetailView initialPlan={plan} />;
}
