export type ModuleTourId = "agent" | "contentAssets" | "questionBank" | "builder" | "split" | "feedback" | "canvas";

export type ModuleTourEntry = {
  completedAt?: string;
  neverShow?: boolean;
};

export type ProductTourState = {
  welcomeAnimationCompletedAt?: string | null;
  sidebarTourCompletedAt?: string | null;
  allToursDisabled?: boolean;
  moduleTours?: Partial<Record<ModuleTourId, ModuleTourEntry>>;
};

export type TourStepDef = {
  targetSelector: string;
  placement: "right" | "bottom" | "top" | "left";
  title: { zh: string; en: string };
  description: { zh: string; en: string };
};
