import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getActorContext, type ActorContext } from "@/lib/auth/actor-context";
import type { AppRole } from "@/lib/auth/roles";

function buildLoginPath(nextPath: string) {
  return `/auth/login?next=${encodeURIComponent(nextPath)}`;
}

export async function requireAuthenticatedActor(nextPath: string) {
  const actor = await getActorContext();
  if (!actor.isAuthenticated) {
    redirect(buildLoginPath(nextPath));
  }
  return actor;
}

export async function requireActorAnyRole(roles: AppRole[], nextPath: string) {
  const actor = await requireAuthenticatedActor(nextPath);
  if (!roles.some((role) => actor.roles.includes(role))) {
    redirect("/main");
  }
  return actor;
}

type RouteGuardResult =
  | { actor: ActorContext; response?: never }
  | { actor?: never; response: NextResponse };

export async function requireRouteActorAnyRole(
  roles: AppRole[],
  options?: { nextPath?: string },
): Promise<RouteGuardResult> {
  const actor = await getActorContext();
  if (!actor.isAuthenticated) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized", login: buildLoginPath(options?.nextPath ?? "/main") },
        { status: 401 },
      ),
    };
  }
  if (!roles.some((role) => actor.roles.includes(role))) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { actor };
}
