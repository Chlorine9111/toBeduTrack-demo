"use client";

import { useEffect, useRef, useState } from "react";
import { useProductTour } from "@/lib/product-tour/context";
import { MODULE_TOUR_STEPS_MAP } from "@/lib/product-tour/constants";
import type { ModuleTourId } from "@/lib/product-tour/types";
import { useAppI18n } from "@/lib/app-i18n/provider";
import SpotlightOverlay from "./SpotlightOverlay";
import TourTooltip from "./TourTooltip";

type ModuleTourProps = {
  moduleId: ModuleTourId;
};

export function ModuleTour({ moduleId }: ModuleTourProps) {
  const { isZh } = useAppI18n();
  const {
    state,
    isLoading,
    isSidebarTourActive,
    shouldShowModuleTour,
    activeModuleTour,
    startModuleTour,
    nextModuleStep,
    skipModuleTour,
    neverShowAllTours,
  } = useProductTour();

  const startedRef = useRef(false);
  const [targetReady, setTargetReady] = useState(false);

  const steps = MODULE_TOUR_STEPS_MAP[moduleId];
  if (!steps) return null;

  const isActive =
    activeModuleTour?.moduleId === moduleId;
  const currentStep = activeModuleTour?.step ?? 0;
  const step = steps[currentStep];

  // 等待目标元素出现后自动启动
  useEffect(() => {
    if (isLoading) return;
    if (startedRef.current || isSidebarTourActive) return;
    if (!state.sidebarTourCompletedAt) return;
    if (!shouldShowModuleTour(moduleId)) return;

    const firstSelector = steps[0]?.targetSelector;
    if (!firstSelector) return;

    const check = () => {
      if (document.querySelector(firstSelector)) {
        setTargetReady(true);
        return true;
      }
      return false;
    };

    if (check()) return;

    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [isLoading, isSidebarTourActive, moduleId, shouldShowModuleTour, state.sidebarTourCompletedAt, steps]);

  useEffect(() => {
    if (
      targetReady &&
      !startedRef.current &&
      !isLoading &&
      !isSidebarTourActive &&
      state.sidebarTourCompletedAt
    ) {
      startedRef.current = true;
      const timer = setTimeout(() => startModuleTour(moduleId), 800);
      return () => clearTimeout(timer);
    }
  }, [targetReady, isLoading, isSidebarTourActive, moduleId, startModuleTour, state.sidebarTourCompletedAt]);

  if (!isActive || !step || isSidebarTourActive) return null;

  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      skipModuleTour(moduleId);
    } else {
      nextModuleStep(moduleId);
    }
  };

  return (
    <>
      <SpotlightOverlay
        targetSelector={step.targetSelector}
        isVisible
        onBackdropClick={() => skipModuleTour(moduleId)}
      />
      <TourTooltip
        targetSelector={step.targetSelector}
        placement={step.placement}
        title={isZh ? step.title.zh : step.title.en}
        description={isZh ? step.description.zh : step.description.en}
        currentStep={currentStep}
        totalSteps={steps.length}
        onNext={handleNext}
        onSkip={() => skipModuleTour(moduleId)}
        isVisible
        isLastStep={isLast}
        showNeverAgain
        onNeverAgain={neverShowAllTours}
      />
    </>
  );
}
