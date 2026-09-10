"use client";

import { useRouter } from "next/navigation";
import { Button, Card, Separator } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { useProductTour } from "@/lib/product-tour/context";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/app-i18n/types";

const LOCALE_OPTIONS: Array<{ value: AppLocale; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export default function PreferencesPanel() {
  const { isZh, locale, setLocale } = useAppI18n();
  const router = useRouter();
  const { resetAllTours, startSidebarTour } = useProductTour();

  const handleLocaleChange = (nextLocale: AppLocale) => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    router.refresh();
  };

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground">
          {isZh ? "偏好设置" : "Preferences"}
        </h1>
        <p className="mt-1 text-[0.875rem] text-foreground/60">
          {isZh ? "自定义你的工作区体验。" : "Customize your workspace experience."}
        </p>
      </header>

      <Card>
        <Card.Content className="p-6">
          <h2 className="text-base font-semibold text-foreground">
            {isZh ? "语言" : "Language"} / {isZh ? "Language" : "语言"}
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            {isZh ? "选择界面显示语言。" : "Choose your interface language."}
          </p>
          <Separator className="my-4" />
          <div className="flex gap-2">
            {LOCALE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={locale === option.value ? "primary" : "secondary"}
                onPress={() => handleLocaleChange(option.value)}
                className={cn(
                  "rounded-lg px-5 py-2.5 text-[0.875rem] font-medium transition-colors",
                  locale === option.value
                    ? "bg-foreground text-white"
                    : "bg-default-100 text-foreground/70 hover:bg-[#EFEFEF]",
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Card.Content>
      </Card>
      <Card className="mt-6">
        <Card.Content className="p-6">
          <h2 className="text-base font-semibold text-foreground">
            {isZh ? "产品导览" : "Product Tour"}
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            {isZh
              ? "重新查看功能介绍，了解各模块的用法。"
              : "Review the feature walkthrough to learn how each module works."}
          </p>
          <Separator className="my-4" />
          <Button
            variant="secondary"
            onPress={() => {
              resetAllTours();
              router.push("/main/agent");
              setTimeout(() => startSidebarTour(), 1500);
            }}
            className="rounded-lg bg-default-100 px-5 py-2.5 text-[0.875rem] font-medium text-foreground/70 hover:bg-[#EFEFEF]"
          >
            {isZh ? "重新开始导览" : "Restart Tour"}
          </Button>
        </Card.Content>
      </Card>
    </div>
  );
}
