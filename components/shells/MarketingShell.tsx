"use client";

import type { ReactNode } from "react";
import MarketingNavbar from "./MarketingNavbar";
import MarketingFooter from "./MarketingFooter";

type MarketingShellProps = {
  children: ReactNode;
};

export default function MarketingShell({ children }: MarketingShellProps) {
  return (
    <>
      <MarketingNavbar />
      <main className="min-h-screen pt-[52px]">{children}</main>
      <MarketingFooter />
    </>
  );
}
