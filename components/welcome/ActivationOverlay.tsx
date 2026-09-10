"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ActivationOverlay() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/onboarding/activate")
  }, [router])

  return null
}
