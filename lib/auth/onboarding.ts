const ONBOARDING_STEP_ROUTES = [
  "/onboarding/basic-info",
  "/onboarding/subjects",
  "/onboarding/get-started",
] as const;

export const ONBOARDING_ENTRY_ROUTE = ONBOARDING_STEP_ROUTES[0];
export const ONBOARDING_STEP_ROUTES_LIST = [...ONBOARDING_STEP_ROUTES];

export function clampOnboardingStep(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(value ?? 0)));
}

export function isOnboardingComplete(onboardingCompletedAt: string | null | undefined) {
  return Boolean(onboardingCompletedAt);
}

export function resolveOnboardingPath(params: {
  onboardingStep?: number | null;
  onboardingCompletedAt?: string | null;
}) {
  if (isOnboardingComplete(params.onboardingCompletedAt)) {
    return null;
  }

  const step = clampOnboardingStep(params.onboardingStep);
  if (step >= 2) {
    return "/onboarding/get-started";
  }
  if (step >= 1) {
    return "/onboarding/subjects";
  }
  return ONBOARDING_ENTRY_ROUTE;
}

export function isOnboardingPath(pathname: string) {
  return ONBOARDING_STEP_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
