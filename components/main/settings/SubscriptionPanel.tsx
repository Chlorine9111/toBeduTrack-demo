"use client";

import { useAppI18n } from "@/lib/app-i18n/provider";
import type { QuotaSummary } from "@/lib/quota/types";

function formatQuotaDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function getUsageTone(usagePercent: number) {
  if (usagePercent >= 100) {
    return {
      barClassName: "bg-[#E07070]",
      badgeClassName: "bg-[#FEF2F2] text-[#E07070]",
      textClassName: "text-[#E07070]",
    };
  }
  if (usagePercent >= 80) {
    return {
      barClassName: "bg-[#F59E0B]",
      badgeClassName: "bg-[#FFF7ED] text-[#B45309]",
      textClassName: "text-[#B45309]",
    };
  }
  return {
    barClassName: "bg-[#5E6AD2]",
    badgeClassName: "bg-[#EEEEF9] text-[#5E6AD2]",
    textClassName: "text-[#5E6AD2]",
  };
}

export default function SubscriptionPanel(props: {
  quotaSummary: QuotaSummary | null;
}) {
  const { isZh } = useAppI18n();
  const usagePercent = props.quotaSummary
    ? Math.min(100, Math.round(props.quotaSummary.usageRatio * 100))
    : 0;
  const tone = getUsageTone(usagePercent);
  const locale = isZh ? "zh-CN" : "en-US";
  const periodEndText = props.quotaSummary
    ? formatQuotaDate(props.quotaSummary.periodEnd, locale)
    : "--";
  const remainingText = props.quotaSummary
    ? `${Math.max(props.quotaSummary.quotaRemaining, 0)}`
    : "--";

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1D1D1F]">
          {isZh ? "测试期使用量" : "Beta usage"}
        </h1>
        <p className="mt-1 text-[0.875rem] text-[#1D1D1F]/60">
          {isZh
            ? "当前全站仍处于教师测试期。系统会保留较宽松的额度，用于保护整体稳定性。"
            : "The product is still in beta for teachers. A generous usage allowance keeps the system stable for everyone."}
        </p>
      </header>

      <div className="space-y-6">
        <section className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[#1D1D1F]/50">
                {isZh ? "当前计划" : "Current plan"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[#1D1D1F]">
                {isZh ? "教师测试计划" : "Teacher beta plan"}
              </h2>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.badgeClassName}`}
            >
              {props.quotaSummary
                ? usagePercent >= 100
                  ? (isZh ? "本周期已达上限" : "Cycle limit reached")
                  : usagePercent >= 80
                    ? (isZh ? "本周期使用较高" : "High usage this cycle")
                    : (isZh ? "使用状态正常" : "Healthy usage")
                : (isZh ? "状态暂不可用" : "Status unavailable")}
            </span>
          </div>

          {props.quotaSummary ? (
            <>
              <div className="mt-6 overflow-hidden rounded-full bg-[#EFEFEF]">
                <div
                  className={`h-3 rounded-full transition-all ${tone.barClassName}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#1D1D1F]/65">
                <span>
                  {isZh ? "本周期已使用" : "Used this cycle"} {usagePercent}%
                </span>
                <span className={tone.textClassName}>
                  {isZh ? "预计重置时间" : "Expected reset"} {periodEndText}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm leading-6 text-[#1D1D1F]/65">
              {isZh
                ? "当前暂时无法读取测试期使用量，但不会影响你继续使用。"
                : "Usage data is temporarily unavailable, but you can keep working."}
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAFA] p-5">
            <p className="text-sm font-medium text-[#1D1D1F]/50">
              {isZh ? "剩余额度" : "Remaining"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-[#1D1D1F]">{remainingText}</p>
            <p className="mt-2 text-sm text-[#1D1D1F]/60">
              {isZh ? "仅用于内部保护，不影响当前已开始的生成。" : "Used only as a guardrail and does not interrupt in-flight generations."}
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAFA] p-5">
            <p className="text-sm font-medium text-[#1D1D1F]/50">
              {isZh ? "周期长度" : "Cycle length"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-[#1D1D1F]">
              {props.quotaSummary ? props.quotaSummary.periodDays : "--"}
            </p>
            <p className="mt-2 text-sm text-[#1D1D1F]/60">
              {isZh ? "按老师自己的测试周期滚动重置。" : "Each teacher resets on their own rolling cycle."}
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAFA] p-5">
            <p className="text-sm font-medium text-[#1D1D1F]/50">
              {isZh ? "正式计划" : "Paid plans"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-[#1D1D1F]">
              {isZh ? "尚未开放" : "Not open yet"}
            </p>
            <p className="mt-2 text-sm text-[#1D1D1F]/60">
              {isZh ? "后续开放付费时，会在当前额度系统上平滑升级。" : "Future paid plans will extend the same quota system."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
