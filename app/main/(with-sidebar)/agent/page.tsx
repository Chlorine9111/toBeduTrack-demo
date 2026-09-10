import dynamic from "next/dynamic";
import { AgentRouteLoading } from "@/components/shells/MainRouteStates";
import { requireActorAnyRole } from "@/lib/auth/require-role";

const AgentWorkspacePage = dynamic(
  () => import("@/components/main/AgentWorkspacePage"),
  {
    loading: () => <AgentRouteLoading />,
  },
);

export default async function Page() {
  await requireActorAnyRole(["subject_teacher", "admin"], "/main/agent");
  return <AgentWorkspacePage />;
}
