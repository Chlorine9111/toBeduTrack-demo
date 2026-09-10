import type { Metadata } from "next";
import PageLayout from "@/components/home/PageLayout";
import AboutContent from "@/components/home/AboutContent";

export const metadata: Metadata = {
  title: "About — Deskmate",
  description:
    "Meet the team behind Deskmate. We're building the future of AP teaching preparation.",
};

export default function AboutPage() {
  return (
    <PageLayout>
      <AboutContent />
    </PageLayout>
  );
}
