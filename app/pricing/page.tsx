import type { Metadata } from "next";
import PageLayout from "@/components/home/PageLayout";
import PricingContent from "@/components/home/PricingContent";

export const metadata: Metadata = {
  title: "Pricing — Deskmate",
  description:
    "Simple, transparent pricing for AP teachers. Start free, upgrade as you grow.",
};

export default function PricingPage() {
  return (
    <PageLayout>
      <PricingContent />
    </PageLayout>
  );
}
