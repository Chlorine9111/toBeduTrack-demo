"use client";

import { Button } from "@heroui/react";
import { Languages } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

type LocaleToggleProps = {
  className?: string;
  tone?: "light" | "dark";
  testId?: string;
  compact?: boolean;
};

export default function LocaleToggle(props: LocaleToggleProps) {
  const { locale, toggleLocale } = useAppI18n();
  const isLight = props.tone !== "dark";
  const title = locale === "zh" ? "切换到英文" : "Switch to Chinese";

  if (props.compact) {
    return (
      <Button
        isIconOnly
        variant="ghost"
        onPress={toggleLocale}
        data-testid={props.testId ?? "locale-toggle"}
        aria-label={title}
        className={cn(
          "h-9 w-9 min-w-0 rounded-xl text-xs font-medium",
          isLight
            ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            : "border border-white/15 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white",
          props.className,
        )}
      >
        <Languages className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      onPress={toggleLocale}
      data-testid={props.testId ?? "locale-toggle"}
      aria-label={title}
      className={cn(
        "h-9 gap-1.5 rounded-xl px-3 text-xs font-medium",
        isLight
          ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          : "border border-white/15 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white",
        props.className,
      )}
    >
      <Languages className="h-3.5 w-3.5" />
      <span>{locale === "zh" ? "EN" : "中文"}</span>
    </Button>
  );
}
