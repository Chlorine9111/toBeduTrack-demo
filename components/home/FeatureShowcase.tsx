"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import {
  MessageSquareText,
  FileText,
  ClipboardCheck,
  Download,
} from "lucide-react";
import { Card } from "@heroui/react";
import { cn } from "@/lib/utils";
import { useHomeI18n } from "@/lib/home/i18n";

function FeatureVisualRubric() {
  const criteria = [
    { name: "Thesis & Argument", points: "6/6", fill: "w-full" },
    { name: "Evidence & Analysis", points: "5/6", fill: "w-5/6" },
    { name: "Organization", points: "4/6", fill: "w-4/6" },
    { name: "Writing Conventions", points: "6/6", fill: "w-full" },
  ];
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">AP English Rubric</span>
        <span className="rounded-full bg-default-100 px-2.5 py-0.5 text-[11px] font-medium text-default-500">
          21/24 pts
        </span>
      </div>
      <div className="space-y-2.5">
        {criteria.map((item) => (
          <div key={item.name}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12px] text-default-500">{item.name}</span>
              <span className="text-[12px] font-medium text-default-400">{item.points}</span>
            </div>
            <div className="h-1 w-full rounded-full bg-default-100">
              <div className={cn("h-1 rounded-full bg-foreground", item.fill)} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FeatureVisualWorksheet() {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">AP Calculus Worksheet</span>
        <span className="text-[12px] text-default-400">12 questions</span>
      </div>
      <div className="space-y-2">
        {["Find the derivative of f(x) = 3x² + 2x - 7",
          "Evaluate the integral ∫(2x + 1)dx",
          "Determine the critical points of g(x)",
        ].map((q, i) => (
          <div key={i} className="flex items-start gap-2.5 rounded-md bg-default-100 p-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-foreground text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <span className="text-[12px] leading-relaxed text-default-500">{q}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FeatureVisualExam() {
  const sections = [
    { name: "Multiple Choice", count: 45, time: "60 min" },
    { name: "Free Response", count: 6, time: "90 min" },
  ];
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">AP Physics Exam</span>
        <span className="rounded-full bg-default-100 px-2.5 py-0.5 text-[11px] font-medium text-default-500">
          Full Practice
        </span>
      </div>
      <div className="space-y-2">
        {sections.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between rounded-md bg-default-100 px-3 py-2.5"
          >
            <div>
              <span className="text-[12px] font-medium text-foreground">{s.name}</span>
              <span className="ml-2 text-[12px] text-default-400">{s.count} items</span>
            </div>
            <span className="text-[12px] text-default-400">{s.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FeatureVisualExport() {
  return (
    <Card className="space-y-3 p-5">
      <span className="text-[13px] font-semibold text-foreground">Export Options</span>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "PDF", desc: "Print-ready" },
          { label: "DOCX", desc: "Editable" },
          { label: "Google Docs", desc: "Share" },
          { label: "LMS", desc: "Integrate" },
        ].map((opt) => (
          <div
            key={opt.label}
            className="flex flex-col items-center gap-1 rounded-md border border-divider bg-default-100 p-3 transition-colors hover:border-default-300"
          >
            <span className="text-[12px] font-semibold text-foreground">{opt.label}</span>
            <span className="text-[10px] text-default-400">{opt.desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const ICONS: readonly ReactNode[] = [
  <ClipboardCheck key="rubric" className="h-4 w-4" />,
  <FileText key="worksheet" className="h-4 w-4" />,
  <MessageSquareText key="exam" className="h-4 w-4" />,
  <Download key="export" className="h-4 w-4" />,
];

const VISUALS: readonly ReactNode[] = [
  <FeatureVisualRubric key="v-rubric" />,
  <FeatureVisualWorksheet key="v-worksheet" />,
  <FeatureVisualExam key="v-exam" />,
  <FeatureVisualExport key="v-export" />,
];

export default function FeatureShowcase() {
  const { t } = useHomeI18n();

  return (
    <section id="features" className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-foreground md:text-4xl">
            {t.features.titleLine1}
            <br />
            <span className="text-default-400">{t.features.titleLine2}</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-default-500">
            {t.features.subtitle}
          </p>
        </motion.div>

        {/* Feature grid */}
        <div className="mt-16 space-y-12 md:mt-20 md:space-y-20">
          {t.features.items.map((feature, idx) => {
            const isReversed = idx % 2 === 1;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className={cn(
                  "flex flex-col items-center gap-8 md:flex-row md:gap-16",
                  isReversed && "md:flex-row-reverse"
                )}
              >
                {/* Text */}
                <div className="flex-1">
                  <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-default-100 text-default-500">
                    {ICONS[idx]}
                  </div>
                  <h3 className="font-display text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-default-500">
                    {feature.description}
                  </p>
                </div>

                {/* Visual */}
                <div className="w-full max-w-sm flex-1">{VISUALS[idx]}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
