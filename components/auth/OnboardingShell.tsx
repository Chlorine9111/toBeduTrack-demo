"use client";

import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { Button, Link, ProgressBar, Separator } from "@heroui/react";
import LocaleToggle from "@/components/shared/LocaleToggle";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

const STEPS = [
  { index: 1, label: "基础资料", caption: "Basic Info" },
  { index: 2, label: "学科方向", caption: "Subjects" },
  { index: 3, label: "开始使用", caption: "Get Started" },
] as const;

type OnboardingShellProps = {
  step: 1 | 2 | 3;
  title: string;
  description: string;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  asideTitle?: string;
  asideDescription?: string;
};

export default function OnboardingShell(props: OnboardingShellProps) {
  const { isZh } = useAppI18n();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,91,91,0.08),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(26,26,46,0.14),transparent_28%),linear-gradient(180deg,#f8fafb_0%,#eef3f7_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="hidden overflow-hidden rounded-[32px] border border-white/70 bg-foreground p-8 text-white shadow-[0_28px_80px_rgba(15,23,42,0.20)] lg:flex lg:flex-col">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium tracking-[0.24em] text-white/80">
            <Sparkles className="h-3.5 w-3.5" />
            {isZh ? "DESKMATE 设置" : "DESKMATE SETUP"}
          </div>

          <div className="mt-10">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/55">
              {isZh ? "教师工作区" : "Teacher Workspace"}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
              {props.asideTitle ??
                (isZh
                  ? "先把你的教师工作区准备好，再开始协作。"
                  : "Set up your teacher workspace before you start collaborating.")}
            </h1>
            <p className="mt-5 text-base leading-8 text-slate-300">
              {props.asideDescription ??
                (isZh
                  ? "这些信息会决定你进入工作台后的课程上下文、内容库归类以及 AI 个性化提示，不是可有可无的装饰。"
                  : "These details drive your course context, library classification, and AI personalization inside the workspace.")}
            </p>
          </div>

          <div className="mt-12 space-y-4">
            {STEPS.map((item) => {
              const active = item.index === props.step;
              const completed = item.index < props.step;
              const stepLabel = isZh ? item.label : item.caption;
              return (
                <article
                  key={item.index}
                  className={cn(
                    "rounded-[24px] border p-5 transition-colors",
                    active
                      ? "border-white/20 bg-white/10"
                      : completed
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-white/10 bg-white/5",
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold",
                        active
                          ? "bg-foreground text-white"
                          : completed
                            ? "bg-emerald-400/20 text-emerald-100"
                            : "bg-white/10 text-white/75",
                      )}
                    >
                      {item.index}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                        {isZh ? `步骤 ${item.index}` : `Step ${item.index}`}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-white">{stepLabel}</h2>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-auto rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-medium text-white">
              {isZh
                ? "完成引导后会自动解锁核心工作区。"
                : "The core workspace unlocks automatically once setup is complete."}
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              {isZh
                ? "你会直接进入自主 Agent，并且内容库、设置、课程归属都会基于这里填写的信息同步。"
                : "You will enter the autonomous Agent directly, and the library, settings, and course classification will sync from what you enter here."}
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-[560px] rounded-[32px] border border-white/80 bg-white/92 p-6 shadow-[0_28px_70px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">
                  {isZh ? `第 ${props.step} 步 / 共 3 步` : `Step ${props.step} of 3`}
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  {props.title}
                </h1>
                <p className="mt-3 text-sm leading-7 text-muted">{props.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <LocaleToggle />
                <Link href="/auth/login" aria-label={isZh ? "返回登录" : "Back to sign in"}>
                  <Button isIconOnly variant="outline" size="sm">
                    <ArrowRight className="h-4 w-4 rotate-180" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="mt-6">
              <ProgressBar
                aria-label={isZh ? `步骤 ${props.step} / 3` : `Step ${props.step} of 3`}
                value={props.step}
                maxValue={3}
                minValue={0}
              >
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
            </div>

            <div className="mt-8">{props.children}</div>

            {props.backHref ? (
              <div className="mt-8 pt-5">
                <Separator className="mb-5" />
                <Link href={props.backHref!} className="inline-flex items-center gap-2 text-sm font-medium">
                  <ArrowLeft className="h-4 w-4" />
                  {props.backLabel ?? (isZh ? "返回上一步" : "Back")}
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
