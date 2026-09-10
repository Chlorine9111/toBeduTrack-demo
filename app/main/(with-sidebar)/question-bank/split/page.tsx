import dynamic from "next/dynamic";
import { MainShellLoading } from "@/components/shells/MainRouteStates";

const QuestionBankSplitWorkspacePage = dynamic(
  () => import("@/components/main/question-bank/split/QuestionBankSplitWorkspacePage"),
  { loading: () => <MainShellLoading title="" /> },
);

export default function MainQuestionBankSplitPage() {
  return <QuestionBankSplitWorkspacePage />;
}
