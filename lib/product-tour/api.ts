import { apiGet, apiPatch } from "@/lib/api/client";
import type { ProductTourState } from "./types";

type TourStateResponse = {
  tourState: ProductTourState;
  onboardingCompletedAt: string | null;
};

export async function fetchTourState(): Promise<TourStateResponse> {
  return apiGet<TourStateResponse>("/api/account/product-tour");
}

export async function patchTourState(
  patch: Partial<ProductTourState>,
): Promise<{ tourState: ProductTourState }> {
  return apiPatch<{ tourState: ProductTourState }>(
    "/api/account/product-tour",
    patch,
  );
}
