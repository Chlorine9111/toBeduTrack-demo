import type { Metadata } from "next";
import PageLayout from "@/components/home/PageLayout";
import TermsContent from "@/components/home/TermsContent";

export const metadata: Metadata = {
  title: "Terms of Service — Deskmate",
  description: "Terms and conditions for using Deskmate.",
};

export default function TermsPage() {
  return (
    <PageLayout>
      <TermsContent />
    </PageLayout>
  );
}
