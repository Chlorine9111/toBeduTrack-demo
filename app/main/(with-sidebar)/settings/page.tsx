import { redirect } from "next/navigation";
import SettingsPageView from "@/components/main/SettingsPageView";
import { getAuthDisplayName, getAuthInitials, getAuthSchoolName } from "@/lib/auth/profile";
import { getActorContext } from "@/lib/auth/actor-context";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { getQuotaSummarySafe } from "@/lib/quota/service";

export default async function SettingsPage() {
  const actor = await getActorContext();

  if (!actor.isAuthenticated) {
    redirect("/auth/login?next=/main/settings");
  }

  const hasTeacherAccess = actor.roles.includes("subject_teacher") || actor.roles.includes("admin");
  const teacherContext = hasTeacherAccess ? await getTeacherContext() : null;
  const teacherId = teacherContext?.teacherId ?? null;
  const user = actor.user;

  const [{ data: teacher }, quotaSummary] = hasTeacherAccess && teacherContext && teacherId
    ? await Promise.all([
        teacherContext.supabase
          .from("teachers")
          .select("full_name,display_name,school_name,role_title,teaching_subjects,avatar_url,created_at,updated_at")
          .eq("id", teacherId)
          .maybeSingle(),
        teacherId ? getQuotaSummarySafe(teacherContext.supabase, teacherId) : Promise.resolve(null),
      ])
    : [{ data: null }, null];

  const displayName =
    teacher?.display_name?.trim() ||
    teacher?.full_name?.trim() ||
    actor.displayName ||
    getAuthDisplayName({
      email: user?.email ?? null,
      metadata: user?.user_metadata ?? null,
    });

  const fullName = teacher?.full_name?.trim() || displayName;
  const schoolName =
    teacher?.school_name?.trim() ||
    getAuthSchoolName(user?.user_metadata ?? null) ||
    "";
  const roleTitle = teacher?.role_title?.trim() || "";
  const teachingSubjects = teacher?.teaching_subjects ?? [];
  const initials = getAuthInitials(displayName, user?.email ?? null);
  const joinedAt = teacher?.created_at ?? user?.created_at ?? null;
  const avatarUrl = teacher?.avatar_url ?? null;

  return (
    <SettingsPageView
      fullName={fullName}
      displayName={displayName}
      schoolName={schoolName}
      roleTitle={roleTitle}
      teachingSubjects={teachingSubjects}
      email={user?.email ?? null}
      emailConfirmed={Boolean(user?.email_confirmed_at)}
      emailConfirmedAt={user?.email_confirmed_at ?? null}
      initials={initials}
      joinedAt={joinedAt}
      avatarUrl={avatarUrl}
      quotaSummary={quotaSummary}
    />
  );
}
