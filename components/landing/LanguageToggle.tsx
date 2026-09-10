"use client"

import { Button } from "@heroui/react"
import { useLanguage } from "@/lib/landing/i18n"

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage()

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={() => setLocale(locale === "en" ? "zh" : "en")}
      className="text-xs font-medium text-slate-500"
    >
      {locale === "en" ? "中文" : "EN"}
    </Button>
  )
}
