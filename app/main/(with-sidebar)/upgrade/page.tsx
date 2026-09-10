import Link from "next/link";
import { cookies } from "next/headers";
import { Check, X, Zap } from "lucide-react";
import { APP_LOCALE_COOKIE, coerceAppLocale } from "@/lib/app-i18n/types";

const FREE_FEATURES = [
  { zh: "每月 5 份文档", en: "5 documents per month", included: true },
  { zh: "标准 AI 建议", en: "Standard AI suggestions", included: true },
  { zh: "基础模板库", en: "Basic template library", included: true },
  { zh: "自定义工作流自动化", en: "Custom workflow automation", included: false },
];

const PRO_FEATURES = [
  { zh: "无限文档", en: "Unlimited documents", highlight: true },
  { zh: "优先 AI 生成（Turbo）", en: "Priority AI Generation (Turbo)" },
  { zh: "题库完整访问", en: "Full access to Question Bank" },
  { zh: "微信编辑器自定义样式", en: "Custom WeChat Editor styles" },
  { zh: "高级判卷分析", en: "Advanced Grading Analytics" },
];

export default async function UpgradePage() {
  const cookieStore = await cookies();
  const locale = coerceAppLocale(cookieStore.get(APP_LOCALE_COOKIE)?.value);
  const isZh = locale === "zh";
  const pick = (item: { zh: string; en: string }) => (isZh ? item.zh : item.en);

  return (
    <div className="flex min-h-full flex-col items-center justify-center overflow-y-auto p-6 md:p-16">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="mb-16 space-y-6 text-center">
          <div className="mx-auto mb-2 inline-flex h-20 w-20 items-center justify-center rounded-full bg-default-100 text-foreground shadow-xs">
            <Zap className="h-9 w-9" />
          </div>
          <div className="space-y-2">
            <h1 className="text-5xl font-bold tracking-tight text-foreground">
              {isZh ? "升级到 Pro" : "Upgrade to Pro"}
            </h1>
            <p className="mx-auto max-w-lg text-lg leading-relaxed text-default-500">
              {isZh
                ? "解锁无限生成和高级功能，提升教学工作流效率。"
                : "Unlock unlimited generation and advanced features to elevate your editorial workflow."}
            </p>
          </div>
        </div>

        {/* Comparison Cards */}
        <div className="relative mb-16 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Free Plan */}
          <div className="flex flex-col rounded-xl bg-default-100 p-8 transition-all duration-300 hover:bg-default-100">
            <div className="mb-8">
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-widest text-default-500">
                {isZh ? "免费版" : "Free Plan"}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">$0</span>
                <span className="text-sm text-default-500">/{isZh ? "月" : "month"}</span>
              </div>
            </div>
            <ul className="grow space-y-5">
              {FREE_FEATURES.map((feature) => (
                <li
                  key={feature.en}
                  className={`flex items-start gap-3 ${feature.included ? "" : "opacity-40"}`}
                >
                  {feature.included ? (
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-default-400" />
                  ) : (
                    <X className="mt-0.5 h-5 w-5 shrink-0 text-default-400" />
                  )}
                  <span
                    className={`text-sm ${
                      feature.included
                        ? "text-default-500"
                        : "text-default-500 line-through"
                    }`}
                  >
                    {pick(feature)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Plan */}
          <div className="relative flex flex-col rounded-xl bg-white p-8 shadow-2xl shadow-sm ring-2 ring-default-100">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-tight text-white">
              {isZh ? "最受欢迎" : "Most Popular"}
            </div>
            <div className="mb-8">
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-widest text-foreground">
                {isZh ? "Pro 版" : "Pro Plan"}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">$12</span>
                <span className="text-sm text-default-500">/{isZh ? "月" : "month"}</span>
              </div>
            </div>
            <ul className="grow space-y-5">
              {PRO_FEATURES.map((feature) => (
                <li
                  key={feature.en}
                  className={`flex items-start gap-3 ${
                    feature.highlight
                      ? "-mx-2 rounded-lg border border-[rgba(15,123,108,0.1)] bg-[rgba(15,123,108,0.05)] p-2"
                      : ""
                  }`}
                >
                  <Check
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      feature.highlight ? "text-success" : "text-primary"
                    }`}
                  />
                  <span
                    className={`text-sm ${feature.highlight ? "font-medium text-foreground" : "text-foreground"}`}
                  >
                    {pick(feature)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/pricing"
            className="w-full rounded-lg bg-foreground px-10 py-4 text-center text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 active:scale-95 sm:w-auto"
          >
            {isZh ? "升级到 Pro" : "Upgrade to Pro"}
          </Link>
          <Link
            href="/main/agent"
            className="w-full rounded-lg px-10 py-4 text-center text-sm font-medium text-default-500 transition-colors hover:bg-default-100 sm:w-auto"
          >
            {isZh ? "继续使用免费版" : "Continue with Free"}
          </Link>
        </div>

        {/* Footer note */}
        <p className="mt-12 text-center text-xs font-medium text-default-400">
          {isZh
            ? "随时取消，无隐藏费用。升级后立即生效。"
            : "Cancel anytime. No hidden fees. Your upgrade takes effect immediately."}
        </p>
      </div>
    </div>
  );
}
