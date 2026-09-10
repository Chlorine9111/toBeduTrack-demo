import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LessonPlanPublicView from "@/components/lesson-plan/LessonPlanPublicView";
import { getPublicLessonPlanBySlug } from "@/lib/lesson-plan/store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function loadPublicLessonPlan(slug: string) {
  const isMock = process.env.E2E_TEST === "1";
  const supabase = isMock ? null : await createServerSupabaseClient();
  return getPublicLessonPlanBySlug({ isMock, supabase }, slug);
}

export async function generateMetadata(
  context: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const params = await context.params;
  const lessonPlan = await loadPublicLessonPlan(params.slug);

  if (!lessonPlan) {
    return {
      title: "教案未找到",
      description: "该教案不存在或未发布。",
    };
  }

  const firstSummary = lessonPlan.sections[0]?.summary ?? "";
  return {
    title: lessonPlan.title,
    description: firstSummary || `${lessonPlan.subjectLabel} 教案`,
    openGraph: {
      title: lessonPlan.title,
      description: firstSummary || `${lessonPlan.subjectLabel} 教案`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: lessonPlan.title,
      description: firstSummary || `${lessonPlan.subjectLabel} 教案`,
    },
  };
}

export default async function PublicLessonPlanPage(
  context: { params: Promise<{ slug: string }> },
) {
  const params = await context.params;
  const lessonPlan = await loadPublicLessonPlan(params.slug);

  if (!lessonPlan) {
    notFound();
  }

  return <LessonPlanPublicView lessonPlan={lessonPlan} />;
}
