import dynamic from "next/dynamic";
import { requireActorAnyRole } from "@/lib/auth/require-role";

const ExamAgentPage = dynamic(
  () => import("@/components/main/exam-agent/ExamAgentPage"),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-default-400">
        加载中...
      </div>
    ),
  },
);

export default async function ExamAgentRoute() {
  await requireActorAnyRole(["subject_teacher", "admin"], "/main/exam-agent");
  return <ExamAgentPage />;
}
