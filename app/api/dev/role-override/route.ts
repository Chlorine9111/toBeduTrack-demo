import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/auth/actor-context";
import {
  canUseDevRoleSwitcher,
  getSwitchableDevRoles,
  isDevRoleSwitcherEnabled,
} from "@/lib/auth/dev-role-switcher";
import {
  ACTIVE_ROLE_OVERRIDE_COOKIE,
  getRoleLandingPath,
  parseActiveRoleOverride,
} from "@/lib/auth/role-override";

type RequestPayload = {
  role?: string | null;
};

export async function POST(request: Request) {
  if (!isDevRoleSwitcherEnabled()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await getActorContext();
  const switchableRoles = getSwitchableDevRoles(actor.roles);

  if (!canUseDevRoleSwitcher(actor, switchableRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as RequestPayload | null;
  const role = parseActiveRoleOverride(payload?.role ?? null);
  const cookieStore = await cookies();

  if (!role) {
    cookieStore.delete(ACTIVE_ROLE_OVERRIDE_COOKIE);
    return NextResponse.json({
      redirectTo: "/main",
      role: null,
    });
  }

  if (!switchableRoles.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  cookieStore.set(ACTIVE_ROLE_OVERRIDE_COOKIE, role, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({
    redirectTo: getRoleLandingPath(role),
    role,
  });
}
