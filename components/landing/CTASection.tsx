"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button, Input } from "@heroui/react";
import { useLanguage } from "@/lib/landing/i18n";

export default function CTASection() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
    }
  };

  return (
    <section
      id="cta"
      className="relative mx-auto w-full max-w-2xl px-6 py-20"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <h2 className="font-display text-2xl font-semibold text-foreground md:text-3xl">
          {t.cta.title}
        </h2>
        <p className="mt-2 text-base text-default-500">
          {t.cta.subtitle}
        </p>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 flex items-center justify-center gap-2 text-emerald-600"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">
              {t.cta.successMessage}
            </span>
          </motion.div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 sm:flex-row"
          >
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.cta.placeholder}
              className="w-full flex-1 bg-white text-sm text-foreground"
            />
            <Button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 bg-foreground px-5 py-2.5 text-sm font-semibold text-white sm:w-auto"
            >
              {t.cta.submitButton}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}

        <p className="mt-4 text-xs text-default-400">
          {t.cta.waitlistCount}
        </p>
      </motion.div>
    </section>
  );
}
