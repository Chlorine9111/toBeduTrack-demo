"use client";

import { motion } from "motion/react";
import { Check, Rocket, RotateCcw } from "lucide-react";
import { Button } from "@heroui/react";
import LinkButton from "@/components/shells/LinkButton";
import { useLanguage } from "@/lib/landing/i18n";

interface ExportOverlayProps {
  visible: boolean;
  onRestart: () => void;
}

export default function ExportOverlay({
  visible,
  onRestart,
}: ExportOverlayProps) {
  const { t } = useLanguage();

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: 0.1,
          type: "spring",
          stiffness: 300,
          damping: 25,
        }}
        className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl"
      >
        {/* Checkmark */}
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <div className="check-bounce flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-5 w-5 text-white" strokeWidth={3} />
          </div>
        </div>

        <h3 className="font-display text-xl font-semibold text-slate-900">
          {t.exportOverlay.title}
        </h3>
        <p className="mt-1.5 text-sm text-slate-500">
          {t.exportOverlay.subtitle}
        </p>

        <div className="my-5 h-px bg-slate-100" />

        <p className="text-sm font-medium text-slate-600">
          {t.exportOverlay.featureTitle}
        </p>
        <ul className="mt-2.5 space-y-1.5 text-left text-sm text-slate-500">
          {t.exportOverlay.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-2.5">
          <LinkButton
            href="#cta"
            className="inline-flex items-center justify-center gap-2 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Rocket className="h-4 w-4" />
            {t.exportOverlay.requestAccess}
          </LinkButton>
          <Button
            variant="outline"
            onPress={onRestart}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t.exportOverlay.restartDemo}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
