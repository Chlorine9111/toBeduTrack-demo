import dynamic from "next/dynamic";

const GradingPage = dynamic(() => import("@/components/main/GradingPage"));

export default function MainGradingPage() {
  return <GradingPage />;
}
