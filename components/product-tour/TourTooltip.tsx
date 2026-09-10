"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAppI18n } from "@/lib/app-i18n/provider";

type Placement = "right" | "bottom" | "top" | "left";

type TourTooltipProps = {
  targetSelector: string;
  placement: Placement;
  title: string;
  description: string;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  isVisible: boolean;
  isLastStep?: boolean;
  showNeverAgain?: boolean;
  onNeverAgain?: () => void;
};

const GAP = 12;
const EDGE_MARGIN = 8;

const FLIP_MAP: Record<Placement, Placement> = {
  right: "left",
  left: "right",
  bottom: "top",
  top: "bottom",
};

function rawPosition(
  target: DOMRect,
  tw: number,
  th: number,
  p: Placement,
): { top: number; left: number } {
  switch (p) {
    case "right":
      return {
        top: target.top + target.height / 2 - th / 2,
        left: target.right + GAP,
      };
    case "left":
      return {
        top: target.top + target.height / 2 - th / 2,
        left: target.left - tw - GAP,
      };
    case "bottom":
      return {
        top: target.bottom + GAP,
        left: target.left + target.width / 2 - tw / 2,
      };
    case "top":
      return {
        top: target.top - th - GAP,
        left: target.left + target.width / 2 - tw / 2,
      };
  }
}

function fitsInViewport(
  pos: { top: number; left: number },
  tw: number,
  th: number,
): boolean {
  return (
    pos.top >= EDGE_MARGIN &&
    pos.left >= EDGE_MARGIN &&
    pos.top + th <= window.innerHeight - EDGE_MARGIN &&
    pos.left + tw <= window.innerWidth - EDGE_MARGIN
  );
}

function clampToViewport(
  pos: { top: number; left: number },
  tw: number,
  th: number,
): { top: number; left: number } {
  return {
    top: Math.max(
      EDGE_MARGIN,
      Math.min(pos.top, window.innerHeight - th - EDGE_MARGIN),
    ),
    left: Math.max(
      EDGE_MARGIN,
      Math.min(pos.left, window.innerWidth - tw - EDGE_MARGIN),
    ),
  };
}

function computePosition(
  target: DOMRect,
  tooltip: { width: number; height: number },
  placement: Placement,
): { top: number; left: number; resolved: Placement } {
  const { width: tw, height: th } = tooltip;
  if (tw === 0 || th === 0) {
    return { top: 0, left: 0, resolved: placement };
  }

  const primary = rawPosition(target, tw, th, placement);
  if (fitsInViewport(primary, tw, th)) {
    return { ...primary, resolved: placement };
  }

  const flipped = FLIP_MAP[placement];
  const secondary = rawPosition(target, tw, th, flipped);
  if (fitsInViewport(secondary, tw, th)) {
    return { ...secondary, resolved: flipped };
  }

  return {
    ...clampToViewport(primary, tw, th),
    resolved: placement,
  };
}

const MOTION_OFFSET: Record<Placement, { x?: number; y?: number }> = {
  right: { x: -8 },
  left: { x: 8 },
  bottom: { y: -8 },
  top: { y: 8 },
};

export default function TourTooltip({
  targetSelector,
  placement,
  title,
  description,
  currentStep,
  totalSteps,
  onNext,
  onSkip,
  isVisible,
  isLastStep = false,
  showNeverAgain = false,
  onNeverAgain,
}: TourTooltipProps) {
  const { isZh } = useAppI18n();
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [resolvedPlacement, setResolvedPlacement] = useState(placement);

  useLayoutEffect(() => {
    if (!isVisible) return;

    const update = () => {
      const targetEl = document.querySelector(targetSelector);
      const tooltipEl = tooltipRef.current;
      if (!targetEl || !tooltipEl) return;
      const targetRect = targetEl.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();
      const { top, left, resolved } = computePosition(
        targetRect,
        tooltipRect,
        placement,
      );

      setPos({ top, left });
      setResolvedPlacement(resolved);
    };

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(update);
    });

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    const interval = setInterval(update, 200);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      clearInterval(interval);
    };
  }, [isVisible, targetSelector, placement]);

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, onSkip]);

  const offset = MOTION_OFFSET[resolvedPlacement];

  const tooltip = (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          key={`tour-step-${currentStep}`}
          ref={tooltipRef}
          initial={{ opacity: 0, ...offset }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, ...offset }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          role="dialog"
          aria-label={title}
          aria-modal="true"
          className="fixed z-[51] w-[280px] rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_16px_48px_rgba(55,53,47,0.12)]"
          style={{ top: pos.top, left: pos.left }}
        >
          <h3 className="text-[14px] font-medium text-[#1D1D1F]">{title}</h3>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-[#6B6F76]">
            {description}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onSkip}
              className="text-[13px] text-[#6B6F76] transition-colors hover:text-[#1D1D1F]"
            >
              {isZh ? "跳过" : "Skip"}
            </button>

            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      i === currentStep ? "#5E6AD2" : "rgba(0,0,0,0.12)",
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={onNext}
              className="rounded-[4px] bg-[#5E6AD2] px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              {isLastStep
                ? isZh
                  ? "完成"
                  : "Done"
                : isZh
                  ? "下一步"
                  : "Next"}
            </button>
          </div>

          {showNeverAgain && onNeverAgain && (
            <button
              type="button"
              onClick={onNeverAgain}
              className="mt-3 block w-full text-center text-[12px] text-[#9B9DA4] transition-colors hover:text-[#6B6F76]"
            >
              {isZh ? "不再显示所有引导" : "Don't show any guides"}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(tooltip, document.body);
}
