"use client";

import { motion } from "motion/react";
import { Separator } from "@heroui/react";
import { useHomeI18n } from "@/lib/home/i18n";

const INSTITUTIONS = [
  "Stanford University",
  "MIT",
  "Harvard",
  "Yale",
  "Princeton",
  "Columbia",
] as const;

export default function SocialProof() {
  const { t } = useHomeI18n();

  return (
    <section className="border-y border-divider bg-default-100/60 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 gap-8 md:grid-cols-4"
        >
          {t.social.stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 text-[13px] text-default-400">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        <Separator className="my-12" />

        {/* Institutions */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.15em] text-default-400">
            {t.social.trustedBy}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {INSTITUTIONS.map((name) => (
              <span
                key={name}
                className="text-[13px] font-medium text-default-300 transition-colors hover:text-default-400"
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
