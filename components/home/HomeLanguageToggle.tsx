"use client";

import { useHomeI18n } from "@/lib/home/i18n";
import { Languages } from "lucide-react";
import { Button } from "@heroui/react";

export default function HomeLanguageToggle() {
  const { locale, toggleLocale } = useHomeI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={toggleLocale}
      aria-label={locale === "en" ? "切换到中文" : "Switch to English"}
      className="flex h-8 items-center gap-1.5 px-2 text-xs font-medium"
    >
      <Languages className="h-3.5 w-3.5" />
      <span>{locale === "en" ? "中文" : "EN"}</span>
    </Button>
  );
}
