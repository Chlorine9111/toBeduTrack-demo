"use client";

import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, Chip } from "@heroui/react";
import LinkButton from "@/components/shells/LinkButton";
import { useHomeI18n } from "@/lib/home/i18n";

export default function HeroSection() {
  const { t } = useHomeI18n();

  return (
    <section className="relative px-6 pt-32 pb-20 md:pt-44 md:pb-32">
      <div className="relative mx-auto max-w-4xl text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <Chip className="gap-2 px-4 py-1.5 text-[13px] text-default-500">
            <Sparkles className="h-3.5 w-3.5 text-default-400" />
            <span>{t.hero.badge}</span>
          </Chip>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.035em] text-foreground"
        >
          {t.hero.titleLine1}
          <br />
          <span className="text-default-400">
            {t.hero.titleLine2}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mx-auto mt-6 max-w-lg text-[17px] leading-relaxed text-default-500"
        >
          {t.hero.subtitle}
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <LinkButton
            href="/main"
            className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
          >
            {t.hero.ctaPrimary}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </LinkButton>
          <LinkButton
            href="#how-it-works"
            variant="outline"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
          >
            {t.hero.ctaSecondary}
          </LinkButton>
        </motion.div>

        {/* Trust line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="mt-8 text-[13px] text-default-400"
        >
          {t.hero.trustLine}
        </motion.p>
      </div>

      {/* Hero visual */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="mx-auto mt-16 max-w-5xl"
      >
        <Card className="overflow-hidden shadow-xl" aria-hidden="true" role="presentation">
          {/* Window chrome */}
          <div className="flex items-center gap-1.5 border-b border-divider px-4 py-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-default-200" />
            <div className="h-2.5 w-2.5 rounded-full bg-default-200" />
            <div className="h-2.5 w-2.5 rounded-full bg-default-200" />
            <div className="ml-4 h-4 w-48 rounded bg-default-100" />
          </div>

          {/* Mock UI content */}
          <Card.Content className="flex min-h-[340px] p-0 md:min-h-[400px]">
            {/* Left: Chat mockup */}
            <div className="w-[35%] border-r border-divider p-5">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground">
                    <span className="text-[10px] font-bold text-white">AI</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-40 rounded bg-default-200" />
                    <div className="h-2.5 w-32 rounded bg-default-200" />
                    <div className="h-2.5 w-24 rounded bg-default-200" />
                  </div>
                </div>
                <div className="ml-auto max-w-[75%]">
                  <div className="rounded-2xl rounded-br-md bg-foreground px-3.5 py-2">
                    <div className="h-2 w-28 rounded bg-white/20" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground">
                    <span className="text-[10px] font-bold text-white">AI</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-44 rounded bg-default-200" />
                    <div className="h-2.5 w-36 rounded bg-default-200" />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-divider px-3 py-2">
                <div className="h-2.5 w-32 rounded bg-default-200" />
                <div className="ml-auto h-5 w-5 rounded bg-foreground" />
              </div>
            </div>

            {/* Right: Document preview */}
            <div className="flex-1 p-5">
              <div className="space-y-4">
                <div>
                  <div className="h-3.5 w-48 rounded bg-default-200" />
                  <div className="mt-1.5 h-2.5 w-32 rounded bg-default-200" />
                </div>
                <div className="space-y-2 rounded-lg border border-divider p-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-2.5 w-2.5 rounded-sm bg-foreground" />
                      <div className="h-2.5 flex-1 rounded bg-default-200" />
                      <div className="h-2.5 w-12 rounded bg-default-100" />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 w-full rounded bg-default-100" />
                  <div className="h-2.5 w-4/5 rounded bg-default-100" />
                  <div className="h-2.5 w-3/5 rounded bg-default-100" />
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
      </motion.div>
    </section>
  );
}
