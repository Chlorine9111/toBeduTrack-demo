/**
 * Supabase session refresh + route protection helper for Next.js middleware.
 * Uses @supabase/ssr to keep auth cookies in sync.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import {
  isOnboardingPath,
  resolveOnboardingPath,
} from "@/lib/auth/onboarding";
import { sanitizeNextPath } from "@/lib/auth/urls";
import { isAppRole, type AppRole } from "@/lib/auth/roles";

const PROTECTED_PREFIXES = ["/main", "/onboarding"];
const GUEST_ONLY_ROUTES = ["/auth/login", "/auth/register", "/auth/forgot-password"];
const WELCOME_ANIMATION_ROUTE = "/onboarding/activate";
const TEACHER_ONLY_PREFIXES = [
  "/main/agent",
  "/main/content-assets",
  "/main/content-library",
  "/main/library",
  "/main/starred",
  "/main/templates",
  "/main/feedback",
  "/main/exam-agent",
  "/main/question-bank",
  "/main/grading",
  "/main/discover",
  "/main/shared",
  "/main/upgrade",
  "/main/wechat-editor",
  "/main/pbl",
  "/main/project",
];

function matchesProtectedPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function resolveDefaultAuthorizedPath(_roles: AppRole[]) {
  return "/main/agent";
}

async function resolveUserRoles(
  supabase: ReturnType<typeof createServerClient>,
  user: { id: string; email?: string | null },
) {
  const roles = new Set<AppRole>();
  const { data: memberships, error: membershipError } = await supabase
    .from("user_role_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!membershipError) {
    for (const membership of memberships ?? []) {
      if (isAppRole(membership.role)) {
        roles.add(membership.role);
      }
    }
  }

  if (roles.size === 0) {
    const [{ data: teacher }] = await Promise.all([
      supabase.from("teachers").select("id").eq("id", user.id).maybeSingle(),
    ]);

    if (teacher?.id) {
      roles.add("subject_teacher");
    }
  }

  const adminEmails = new Set(
    `${process.env.DESKMATE_ADMIN_EMAILS ?? ""}`
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (user.email && adminEmails.has(user.email.toLowerCase())) {
    roles.add("admin");
    roles.add("subject_teacher");
  }

  return Array.from(roles);
}

function hasCompletedWelcomeAnimation(productTourState: unknown) {
  if (!productTourState || typeof productTourState !== "object") {
    return false;
  }
  const state = productTourState as Record<string, unknown>;
  return typeof state.welcomeAnimationCompletedAt === "string" && state.welcomeAnimationCompletedAt.length > 0;
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isGuestOnlyPath(pathname: string) {
  return GUEST_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function handleSupabaseMiddleware(request: NextRequest) {
  const authBypass = isAuthBypassEnabled();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  if (authBypass) {
    return NextResponse.next({ request });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  const protectedRoute = isProtectedPath(pathname);
  const guestOnlyRoute = isGuestOnlyPath(pathname);
  const onboardingRoute = isOnboardingPath(pathname);
  const welcomeRoute = pathname.startsWith("/welcome");

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user: { id: string; email?: string | null } | null = null;

  if (protectedRoute || guestOnlyRoute || welcomeRoute) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    user = authUser
      ? {
          id: authUser.id,
          email: authUser.email,
        }
      : null;
  }

  if (process.env.E2E_TEST === "1") {
    return response;
  }

  if (!user && protectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user && guestOnlyRoute) {
    let redirectPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"), "/main/agent");
    const { data: teacherState } = await supabase
      .from("teachers")
      .select("onboarding_step,onboarding_completed_at,product_tour_state")
      .eq("id", user.id)
      .maybeSingle();

    const onboardingPath = resolveOnboardingPath({
      onboardingStep: teacherState?.onboarding_step,
      onboardingCompletedAt: teacherState?.onboarding_completed_at,
    });
    const welcomeAnimationCompleted = hasCompletedWelcomeAnimation(
      teacherState?.product_tour_state,
    );

    if (onboardingPath) {
      redirectPath = onboardingPath;
    } else if (!welcomeAnimationCompleted) {
      redirectPath = WELCOME_ANIMATION_ROUTE;
    }

    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  if (user) {
    const { data: teacherState } = await supabase
      .from("teachers")
      .select("onboarding_step,onboarding_completed_at,product_tour_state")
      .eq("id", user.id)
      .maybeSingle();

    const isActivatePage = pathname === WELCOME_ANIMATION_ROUTE;

    // /welcome/* paths are deprecated — funnel everything into the standalone activation page
    if (pathname.startsWith("/welcome")) {
      return NextResponse.redirect(new URL(WELCOME_ANIMATION_ROUTE, request.url));
    }

    const onboardingPath = resolveOnboardingPath({
      onboardingStep: teacherState?.onboarding_step,
      onboardingCompletedAt: teacherState?.onboarding_completed_at,
    });
    const welcomeAnimationCompleted = hasCompletedWelcomeAnimation(
      teacherState?.product_tour_state,
    );

    if (onboardingPath) {
      if (isActivatePage) {
        return NextResponse.redirect(new URL(onboardingPath, request.url));
      }
      if (!onboardingRoute) {
        return NextResponse.redirect(new URL(onboardingPath, request.url));
      }
    } else if (!welcomeAnimationCompleted) {
      if (!isActivatePage) {
        return NextResponse.redirect(new URL(WELCOME_ANIMATION_ROUTE, request.url));
      }
    } else if (onboardingRoute || isActivatePage) {
      // Fully set up — redirect away from any onboarding page
      return NextResponse.redirect(new URL("/main/agent", request.url));
    }

    if (pathname.startsWith("/main") && pathname !== "/main/settings") {
      const roles = await resolveUserRoles(supabase, user);
      const teacherOnlyPath = matchesProtectedPrefix(pathname, TEACHER_ONLY_PREFIXES);

      if (teacherOnlyPath && !roles.includes("subject_teacher") && !roles.includes("admin")) {
        return NextResponse.redirect(
          new URL(resolveDefaultAuthorizedPath(roles), request.url),
        );
      }
    }
  }

  return response;
}
