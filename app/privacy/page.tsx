import type { Metadata } from "next";
import PageLayout from "@/components/home/PageLayout";
import PrivacyContent from "@/components/home/PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy — Deskmate",
  description: "How Deskmate collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <PageLayout>
      <PrivacyContent />
    </PageLayout>
  );
}
