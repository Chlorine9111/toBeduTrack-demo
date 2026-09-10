import { redirect } from "next/navigation"

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  await params
  redirect("/onboarding/activate")
}
