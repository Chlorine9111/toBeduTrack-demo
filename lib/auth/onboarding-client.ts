export type OnboardingProfile = {
  id: string;
  fullName: string;
  schoolName: string;
  roleTitle: string;
  teachingSubjects: string[];
  onboardingStep: number;
  onboardingCompletedAt: string | null;
  nextRoute: string | null;
};

type OnboardingResponse = {
  profile: OnboardingProfile;
};

function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object") {
    const nested = data.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof data.message === "string") return data.message;
  return fallback;
}

export async function requestOnboardingProfile() {
  const response = await fetch("/api/account/onboarding", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `读取引导资料失败（${response.status}）`));
  }
  return (payload as OnboardingResponse).profile;
}

export async function updateOnboardingProfile(body: Record<string, unknown>) {
  const response = await fetch("/api/account/onboarding", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `更新引导资料失败（${response.status}）`));
  }
  return (payload as OnboardingResponse).profile;
}
