"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/components/main/agent/animation-constants";

type WorkspaceTransitionProps = {
  isIdle: boolean;
  idleContent: React.ReactNode;
  activeContent: React.ReactNode;
};

const IDLE_VARIANTS = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: {
      duration: 0.25,
      ease: [0.4, 0, 1, 1] as [number, number, number, number],
    },
  },
};

const ACTIVE_VARIANTS = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const SPRING_TRANSITION = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

const INSTANT = { duration: 0 };

export default function WorkspaceTransition({
  isIdle,
  idleContent,
  activeContent,
}: WorkspaceTransitionProps) {
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? INSTANT : SPRING_TRANSITION;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {isIdle ? (
          <motion.div
            key="idle"
            className="flex min-h-0 flex-1 flex-col"
            variants={IDLE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            {idleContent}
          </motion.div>
        ) : (
          <motion.div
            key="active"
            className="flex min-h-0 flex-1 flex-col"
            variants={ACTIVE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            {activeContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
