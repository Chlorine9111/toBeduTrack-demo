"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import { MessageCircle, Wand2, FileDown } from "lucide-react";
import { Card, Separator } from "@heroui/react";
import { useHomeI18n } from "@/lib/home/i18n";

const STEP_ICONS: readonly ReactNode[] = [
  <MessageCircle key="chat" className="h-4 w-4" />,
  <Wand2 key="wand" className="h-4 w-4" />,
  <FileDown key="export" className="h-4 w-4" />,
];

const STEP_NUMBERS = ["01", "02", "03"] as const;

export default function HowItWorks() {
  const { t } = useHomeI18n();

  return (
    <section id="how-it-works" className="bg-default-100/60 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-foreground md:text-4xl">
            {t.howItWorks.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-default-500">
            {t.howItWorks.subtitle}
          </p>
        </motion.div>

        {/* Steps */}
        <div className="mt-16 grid gap-6 md:grid-cols-3 md:gap-8">
          {t.howItWorks.steps.map((step, idx) => (
            <motion.div
              key={STEP_NUMBERS[idx]}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="group relative"
            >
              {/* Connector line (desktop) */}
              {idx < t.howItWorks.steps.length - 1 && (
                <Separator className="absolute top-12 left-[calc(50%+32px)] hidden w-[calc(100%-64px)] md:block" />
              )}

              <Card className="relative p-6 transition-all duration-300 hover:shadow-md">
                {/* Step number */}
                <span className="mb-4 block font-display text-[11px] font-bold tracking-[0.15em] text-default-300">
                  {STEP_NUMBERS[idx]}
                </span>

                {/* Icon */}
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-default-100 text-default-500 transition-colors duration-300 group-hover:bg-foreground group-hover:text-white">
                  {STEP_ICONS[idx]}
                </div>

                {/* Content */}
                <Card.Header className="p-0">
                  <Card.Title className="font-display text-[16px] font-semibold tracking-tight">
                    {step.title}
                  </Card.Title>
                  <Card.Description className="mt-2 text-[13px] leading-relaxed">
                    {step.description}
                  </Card.Description>
                </Card.Header>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
