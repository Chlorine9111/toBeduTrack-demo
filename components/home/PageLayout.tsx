"use client";

import { HomeI18nProvider } from "@/lib/home/i18n";
import MarketingNavbar from "@/components/shells/MarketingNavbar";
import MarketingFooter from "@/components/shells/MarketingFooter";

interface PageLayoutProps {
  readonly children: React.ReactNode;
}

export default function PageLayout({ children }: PageLayoutProps) {
  return (
    <HomeI18nProvider>
      <MarketingNavbar />
      <main className="min-h-screen pt-[52px]">{children}</main>
      <MarketingFooter />
    </HomeI18nProvider>
  );
}
