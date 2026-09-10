"use client"

import dynamic from "next/dynamic"
import FeedbackCenter from "@/components/main/feedback/FeedbackCenter"

type FeedbackPageProps = {
  isAdmin?: boolean
}

const ModuleTour = dynamic(
  () => import("@/components/product-tour").then((mod) => mod.ModuleTour),
  { loading: () => null },
)

export default function FeedbackPage({ isAdmin }: FeedbackPageProps) {
  return (
    <>
      <ModuleTour moduleId="feedback" />
      <FeedbackCenter mode="page" isAdmin={isAdmin} />
    </>
  )
}
