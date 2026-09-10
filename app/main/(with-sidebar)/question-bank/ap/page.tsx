import dynamic from "next/dynamic";
import { MainShellLoading } from "@/components/shells/MainRouteStates";

const ApQuestionBankPage = dynamic(
  () => import("@/components/main/question-bank/ap/ApQuestionBankPage"),
  { loading: () => <MainShellLoading title="" /> },
);

export default function MainApQuestionBankPage() {
  return <ApQuestionBankPage />;
}
