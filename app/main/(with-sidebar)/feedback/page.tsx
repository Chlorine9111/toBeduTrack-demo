import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth";
import { MainShellLoading } from "@/components/shells/MainRouteStates";
import { requireActorAnyRole } from "@/lib/auth/require-role";

const FeedbackPage = dynamic(
  () => import("@/components/main/FeedbackPage"),
  { loading: () => <MainShellLoading title="" /> },
);

export const metadata: Metadata = {
  title: "反馈 — Deskmate",
};

export default async function Page() {
  await requireActorAnyRole(["subject_teacher", "admin"], "/main/feedback");
  const access = await getFeedbackAdminAccess();
  return <FeedbackPage isAdmin={access.allowed} />;
}
