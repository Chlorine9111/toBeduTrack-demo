"use client";

import type { ReactNode } from "react";
import { ProductTourProvider } from "@/lib/product-tour/context";

export function GlobalProviders({ children }: { children: ReactNode }) {
  return <ProductTourProvider>{children}</ProductTourProvider>;
}
