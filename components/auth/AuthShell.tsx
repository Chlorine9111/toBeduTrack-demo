"use client";

import type { ReactNode } from "react";
import { CheckCircle } from "lucide-react";
import { Link } from "@heroui/react";
import LocaleToggle from "@/components/shared/LocaleToggle";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { pickLocalizedText, type LocalizedText } from "@/lib/app-i18n/text";

type AuthShellProps = {
  eyebrow?: LocalizedText | string;
  title: LocalizedText | string;
  description: LocalizedText | string;
  children: ReactNode;
  heroIcon?: "none" | "lock";
  alternateLabel?: LocalizedText | string;
  alternateHref?: string;
  alternateText?: LocalizedText | string;
};

const VALUE_PROPS = [
  {
    title: { zh: "集中式工作区", en: "Centralized Workspace" },
    description: {
      zh: "在一个地方组织文档、任务和团队协作。",
      en: "Organize documents, tasks, and team collaborations in one place.",
    },
  },
  {
    title: { zh: "无缝归档", en: "Seamless Archiving" },
    description: {
      zh: "用我们无干扰的组织系统保持专注。",
      en: "Keep your focus clear with our distraction-free organization system.",
    },
  },
  {
    title: { zh: "精确编辑", en: "Editorial Precision" },
    description: {
      zh: "专为重视高质量内容和清晰层次的教师设计。",
      en: "Designed for curators who value high-stakes whitespace and quiet hierarchy.",
    },
  },
] as const;

export default function AuthShell(props: AuthShellProps) {
  const { locale } = useAppI18n();
  const title = pickLocalizedText(locale, props.title);
  const description = pickLocalizedText(locale, props.description);
  const alternateLabel = props.alternateLabel
    ? pickLocalizedText(locale, props.alternateLabel)
    : "";
  const alternateText = props.alternateText ? pickLocalizedText(locale, props.alternateText) : "";

  return (
    <main className="flex min-h-screen overflow-hidden">
      {/* Left Panel — Brand */}
      <section className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-foreground p-16 text-surface">
        <div>
          {/* Logo */}
          <div className="mb-24 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
              <span className="text-sm font-bold text-white">D</span>
            </div>
            <span className="text-xl font-bold tracking-tighter text-white">Deskmate</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-white">
              {locale === "en"
                ? "Sign in to unlock your productivity"
                : "登录以释放你的生产力"}
            </h1>

            <ul className="mt-10 space-y-6">
              {VALUE_PROPS.map((item, i) => (
                <li key={i} className="flex items-start gap-4">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <p className="text-lg font-semibold leading-tight text-white">
                      {pickLocalizedText(locale, item.title)}
                    </p>
                    <p className="mt-1 text-sm text-white/60">
                      {pickLocalizedText(locale, item.description)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-sm text-white/40">
          &copy; {new Date().getFullYear()} Deskmate. All rights reserved.
        </p>
      </section>

      {/* Right Panel — Form */}
      <section className="flex w-full items-center justify-center bg-white p-8 md:p-16 lg:w-[55%]">
        <div className="w-full max-w-[420px]">
          {/* Mobile brand + locale toggle */}
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
                <span className="text-[10px] font-bold text-white">D</span>
              </div>
              <span className="text-[15px] font-semibold text-foreground">Deskmate</span>
            </div>
            <LocaleToggle testId="auth-panel-locale-toggle" />
          </div>

          {/* Header */}
          <div className="mb-10">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-2 text-muted">{description}</p>
          </div>

          {/* Form content */}
          {props.children}

          {/* Alternate link */}
          {props.alternateHref && alternateText ? (
            <div className="mt-12 text-center text-sm text-muted">
              {alternateLabel ? <span>{alternateLabel} </span> : null}
              <Link href={props.alternateHref} className="font-semibold">
                {alternateText}
              </Link>
            </div>
          ) : null}

          {/* Security note */}
          <div className="mt-24 flex items-center justify-center gap-2 opacity-30">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
            <span className="text-[10px] font-medium uppercase tracking-widest">
              Secure Authentication Environment
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
