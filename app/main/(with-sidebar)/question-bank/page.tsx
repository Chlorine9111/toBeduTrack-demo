import dynamic from "next/dynamic";
import { MainShellLoading } from "@/components/shells/MainRouteStates";
import { requireActorAnyRole } from "@/lib/auth/require-role";

const QuestionBankPageV2 = dynamic(
  () => import("@/components/main/QuestionBankPageV2"),
  { loading: () => <MainShellLoading title="" /> },
);

export default async function MainQuestionBankPage() {
  await requireActorAnyRole(["subject_teacher", "admin"], "/main/question-bank");
  return <QuestionBankPageV2 />;
}
