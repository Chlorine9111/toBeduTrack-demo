"use client";

import { motion } from "motion/react";
import { CheckCircle, Clock, BookOpen, RefreshCw } from "lucide-react";
import { type ReactNode } from "react";
import Link from "next/link";
import { Card, Separator } from "@heroui/react";
import LinkButton from "@/components/shells/LinkButton";
import { useHomeI18n } from "@/lib/home/i18n";

interface ValueIcon {
  readonly icon: ReactNode;
  readonly color: string;
}

const VALUE_ICONS: readonly ValueIcon[] = [
  { icon: <CheckCircle className="h-5 w-5" />, color: "text-primary" },
  { icon: <Clock className="h-5 w-5" />, color: "text-default-500" },
  { icon: <BookOpen className="h-5 w-5" />, color: "text-success" },
  { icon: <RefreshCw className="h-5 w-5" />, color: "text-warning" },
];

export default function AboutContent() {
  const { t } = useHomeI18n();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-8 py-24 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto flex max-w-7xl flex-col items-start"
        >
          <span className="mb-6 text-[11px] font-semibold uppercase tracking-wider text-primary">
            {t.about.badge}
          </span>
          <h1 className="mb-8 max-w-3xl text-5xl font-bold leading-[1.1] tracking-[-0.02em] text-foreground md:text-[3.5rem]">
            {t.about.titleLine1}
          </h1>
          <p className="max-w-2xl text-xl leading-relaxed text-default-500">
            {t.about.subtitle}
          </p>
        </motion.div>
        <div className="absolute -right-20 top-20 -z-10 h-96 w-96 rounded-full bg-default-100 opacity-50 blur-3xl" />
      </section>

      {/* Story */}
      <section className="bg-default-100 px-8 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-[720px]"
        >
          <h2 className="mb-10 text-center text-[1.75rem] font-semibold leading-[1.2] text-foreground">
            {t.about.storyTitle}
          </h2>
          <div className="space-y-6 text-sm leading-[1.6] text-default-500">
            {t.about.storyParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <Separator className="w-12" />
          </div>
        </motion.div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-7xl px-8 py-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mb-20"
        >
          <h2 className="mb-4 text-[1.75rem] font-semibold text-foreground">
            {t.about.valuesTitle}
          </h2>
          <p className="max-w-xl text-default-500">
            {t.about.valuesSubtitle}
          </p>
        </motion.div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {t.about.values.map((value, idx) => (
            <motion.div
              key={value.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
            >
              <Card variant="secondary" className="p-8 transition-colors duration-300 hover:shadow-sm">
                <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-content1">
                  <span className={VALUE_ICONS[idx].color}>
                    {VALUE_ICONS[idx].icon}
                  </span>
                </div>
                <Card.Header className="p-0">
                  <Card.Title className="mb-3 text-lg font-semibold">
                    {value.title}
                  </Card.Title>
                  <Card.Description className="text-sm leading-relaxed">
                    {value.description}
                  </Card.Description>
                </Card.Header>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mb-20 px-8 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto flex max-w-7xl flex-col items-center justify-between gap-12 overflow-hidden rounded-2xl bg-foreground p-12 md:flex-row md:p-20"
        >
          <div className="relative z-10 max-w-xl">
            <h2 className="mb-6 text-3xl font-bold leading-tight text-white md:text-4xl">
              {t.about.ctaTitle}
            </h2>
            <p className="mb-8 text-lg text-white/70">
              {t.about.ctaSubtitle}
            </p>
            <LinkButton
              href="/auth/register"
              variant="secondary"
              className="transform rounded-lg bg-white px-8 py-4 font-semibold text-foreground hover:-translate-y-1 hover:bg-default-100"
            >
              {t.about.ctaButton}
            </LinkButton>
          </div>
          <div className="relative z-10 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-white/5 p-4 backdrop-blur-xs md:w-1/3">
            <div className="h-full w-full rounded-lg bg-default-200" />
          </div>
          <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        </motion.div>
      </section>
    </div>
  );
}
