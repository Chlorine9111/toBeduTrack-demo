"use client";

import { useEffect, useState } from "react";
import { useProductTour } from "@/lib/product-tour/context";
import { SIDEBAR_TOUR_STEPS } from "@/lib/product-tour/constants";
import { useAppI18n } from "@/lib/app-i18n/provider";
import SpotlightOverlay from "./SpotlightOverlay";
import TourTooltip from "./TourTooltip";

export default function SidebarTour() {
  const { isZh } = useAppI18n();
  const {
    isSidebarTourActive,
    sidebarTourStep,
    nextSidebarStep,
    skipSidebarTour,
    neverShowAllTours,
  } = useProductTour();

  const [isMdScreen, setIsMdScreen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    setIsMdScreen(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMdScreen(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  if (!isSidebarTourActive || !isMdScreen) return null;

  const steps = SIDEBAR_TOUR_STEPS;
  const step = steps[sidebarTourStep];
  if (!step) return null;

  const isLast = sidebarTourStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      skipSidebarTour();
    } else {
      nextSidebarStep();
    }
  };

  return (
    <>
      <SpotlightOverlay
        targetSelector={step.targetSelector}
        isVisible
        onBackdropClick={skipSidebarTour}
      />
      <TourTooltip
        targetSelector={step.targetSelector}
        placement={step.placement}
        title={isZh ? step.title.zh : step.title.en}
        description={isZh ? step.description.zh : step.description.en}
        currentStep={sidebarTourStep}
        totalSteps={steps.length}
        onNext={handleNext}
        onSkip={skipSidebarTour}
        isVisible
        isLastStep={isLast}
        showNeverAgain
        onNeverAgain={neverShowAllTours}
      />
    </>
  );
}
