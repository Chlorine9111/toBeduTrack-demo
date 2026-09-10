import type { Metadata } from "next";
import PageLayout from "@/components/home/PageLayout";
import BlogContent from "@/components/home/BlogContent";

export const metadata: Metadata = {
  title: "Blog — Deskmate",
  description:
    "Tips, insights, and updates for AP teachers using AI in their classroom.",
};

export default function BlogPage() {
  return (
    <PageLayout>
      <BlogContent />
    </PageLayout>
  );
}
