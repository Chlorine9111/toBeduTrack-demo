import { type NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/urls";

/**
 * Compatibility endpoint for stale OAuth or email links. The portfolio demo
 * performs no token exchange and stores no authentication credentials.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const safeNext = sanitizeNextPath(url.searchParams.get("next"), "/main/agent");
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
