import type { Metadata } from "next"
import DevAccessDenied from "@/components/developer/DevAccessDenied"
import DevLayout from "@/components/developer/DevLayout"
import { getFeedbackAdminAccess } from "@/lib/feedback/admin-auth"

export const metadata: Metadata = {
  title: "Developer — Deskmate",
}

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const access = await getFeedbackAdminAccess()

  if (!access.allowed) {
    return <DevAccessDenied />
  }

  return <DevLayout>{children}</DevLayout>
}
