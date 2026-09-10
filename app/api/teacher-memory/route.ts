import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createServerTimingRecorder,
  withServerTiming,
} from "@/lib/api/server-timing";
import {
  getOrCreateTeacherMemory,
  patchTeacherMemoryPreferences,
  trackTeacherMemoryEvent,
} from "@/lib/teacher-memory/service";
import type { TeacherMemoryScope } from "@/lib/teacher-memory/types";

const scopeSchema = z.enum(["wechat_editor", "agent_workspace"]);
const looseRecordSchema = z.record(z.string(), z.unknown());

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("init"),
    profileKey: z.string().min(6),
    teacherId: z.string().uuid().optional(),
    scope: scopeSchema.optional(),
  }),
  z.object({
    action: z.literal("track"),
    profileKey: z.string().min(6),
    teacherId: z.string().uuid().optional(),
    scope: scopeSchema.optional(),
    eventType: z.string().min(1).max(80),
    payload: looseRecordSchema.optional(),
  }),
  z.object({
    action: z.literal("preferences"),
    profileKey: z.string().min(6),
    teacherId: z.string().uuid().optional(),
    scope: scopeSchema.optional(),
    patch: looseRecordSchema,
  }),
]);

function normalizeScope(scope?: string): TeacherMemoryScope {
  if (scope === "wechat_editor") return "wechat_editor";
  if (scope === "agent_workspace") return "agent_workspace";
  return "wechat_editor";
}

export async function GET(request: NextRequest) {
  const serverTiming = createServerTimingRecorder();
  const respond = (response: Response) => withServerTiming(response, serverTiming);
  const profileKey = request.nextUrl.searchParams.get("profileKey") || "";
  const scope = normalizeScope(request.nextUrl.searchParams.get("scope") || undefined);
  const teacherId = request.nextUrl.searchParams.get("teacherId") || undefined;

  if (!profileKey || profileKey.length < 6) {
    return respond(NextResponse.json({ ok: false, error: "缺少有效 profileKey" }, { status: 422 }));
  }

  try {
    const readStartedAt = performance.now();
    const context = await getOrCreateTeacherMemory({
      profileKey,
      scope,
      teacherId,
    });
    serverTiming.measure("memory_read", readStartedAt);

    return respond(NextResponse.json({ ok: true, ...context }));
  } catch (error) {
    return respond(NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "读取老师记忆失败",
      },
      { status: 500 }
    ));
  }
}

export async function POST(request: NextRequest) {
  const serverTiming = createServerTimingRecorder();
  const respond = (response: Response) => withServerTiming(response, serverTiming);
  const bodyParseStartedAt = performance.now();
  const body = await request.json().catch(() => ({}));
  serverTiming.measure("body_parse", bodyParseStartedAt);
  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return respond(NextResponse.json(
      {
        ok: false,
        error: parsed.error.flatten(),
      },
      { status: 422 }
    ));
  }

  try {
    if (parsed.data.action === "init") {
      const initStartedAt = performance.now();
      const context = await getOrCreateTeacherMemory({
        profileKey: parsed.data.profileKey,
        scope: parsed.data.scope,
        teacherId: parsed.data.teacherId,
      });
      serverTiming.measure("memory_init", initStartedAt);
      return respond(NextResponse.json({ ok: true, ...context }));
    }

    if (parsed.data.action === "track") {
      const trackStartedAt = performance.now();
      const context = await trackTeacherMemoryEvent({
        profileKey: parsed.data.profileKey,
        scope: parsed.data.scope,
        teacherId: parsed.data.teacherId,
        eventType: parsed.data.eventType,
        payload: parsed.data.payload,
      });
      serverTiming.measure("memory_track", trackStartedAt);
      return respond(NextResponse.json({ ok: true, ...context }));
    }

    const preferencesStartedAt = performance.now();
    const context = await patchTeacherMemoryPreferences({
      profileKey: parsed.data.profileKey,
      scope: parsed.data.scope,
      teacherId: parsed.data.teacherId,
      patch: parsed.data.patch,
    });
    serverTiming.measure("memory_preferences", preferencesStartedAt);
    return respond(NextResponse.json({ ok: true, ...context }));
  } catch (error) {
    return respond(NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "更新老师记忆失败",
      },
      { status: 500 }
    ));
  }
}
