import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { getTeacherIdentity } from "@/lib/api/teacher-context";
import { internalTable } from "@/lib/runtime/internal-table";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const webVitalsPayloadSchema = z.object({
  route: z.string().trim().min(1).max(256),
  metricId: z.string().trim().min(1).max(128),
  metricName: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB"]),
  metricValue: z.number().finite().min(0).max(1_000_000),
  metricRating: z
    .enum(["good", "needs-improvement", "poor"])
    .nullable()
    .optional(),
  navigationType: z.string().trim().max(80).nullable().optional(),
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const teacherIdentity = await getTeacherIdentity();
    const body = webVitalsPayloadSchema.parse(await parseJsonBody(request));
    const admin = createAdminSupabaseClient();

    await internalTable(admin, "frontend_web_vitals").insert({
      teacher_id: teacherIdentity.teacherId ?? null,
      session_id: body.sessionId,
      route: body.route,
      metric_id: body.metricId,
      metric_name: body.metricName,
      metric_value: body.metricValue,
      metric_rating: body.metricRating ?? null,
      navigation_type: body.navigationType ?? null,
      user_agent: request.headers.get("user-agent") ?? null,
      metadata: {},
    });

    return Response.json(
      { recorded: true },
      {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "性能指标参数不合法", 400, error.flatten());
    }

    console.warn("[telemetry/web-vitals] 记录失败", error);
    return Response.json(
      { recorded: false },
      {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
