import type { Metadata } from "next"
import DevFeedbackPage from "@/components/developer/DevFeedbackPage"

export const metadata: Metadata = {
  title: "反馈管理 — Deskmate Developer",
}

export default function DeveloperFeedbackRoutePage() {
  return <DevFeedbackPage />
}
