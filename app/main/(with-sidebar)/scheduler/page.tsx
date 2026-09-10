import dynamic from "next/dynamic";
import { MainShellLoading } from "@/components/shells/MainRouteStates";

const SchedulerPage = dynamic(
  () => import("@/components/main/SchedulerPage"),
  { loading: () => <MainShellLoading title="" /> },
);

export default function Page() {
  return <SchedulerPage />;
}
