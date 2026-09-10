import dynamic from "next/dynamic";
import { MainShellLoading } from "@/components/shells/MainRouteStates";

const WeChatEditorPage = dynamic(
  () => import("@/components/wechat-editor").then((m) => m.WeChatEditorPage),
  { loading: () => <MainShellLoading title="" /> },
);

export default function WeChatEditorRoute() {
  return <WeChatEditorPage />;
}
