"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button, Input } from "@heroui/react";
import { useHomeI18n } from "@/lib/home/i18n";

export default function CTABanner() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { t } = useHomeI18n();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  };

  return (
    <section id="cta" className="px-6 py-20 md:py-28">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-neutral-900 px-8 py-16 text-center md:px-16"
      >
        <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-white md:text-4xl">
          {t.cta.title.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i === 0 && <br />}
            </span>
          ))}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-neutral-400">
          {t.cta.subtitle}
        </p>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 flex items-center justify-center gap-2 text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[13px] font-medium">{t.cta.success}</span>
          </motion.div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.cta.placeholder}
              className="flex-1 text-[13px] text-white placeholder:text-neutral-500 border-neutral-700 bg-neutral-800"
            />
            <Button
              type="submit"
              variant="secondary"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[13px] font-medium text-neutral-900"
            >
              {t.cta.button}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}

        <p className="mt-4 text-[12px] text-neutral-500">{t.cta.note}</p>
      </motion.div>
    </section>
  );
}
