import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { generatePblProject } from "@/lib/pbl/generator";
import { appendGenerationLog, saveProjectPlan } from "@/lib/pbl/store";
import { syncPblProjectContentLibraryItem } from "@/lib/content-library/sync";
import {
  buildQuotaExhaustedDetails,
  buildQuotaHeaders,
  mergeHeaders,
} from "@/lib/quota/headers";
import {
  checkQuotaAdmissionSafe,
  finalizeQuotaSpendSafe,
  resolveQuotaIdempotencyKey,
} from "@/lib/quota/service";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  curriculumSystem: z.enum(["AP", "IB", "CN"]).optional(),
  grade: z.string().trim().min(1).max(40).optional(),
  subject: z.string().trim().min(1).max(120).optional(),
  totalPeriods: z.number().int().min(2).max(60).optional(),
});

export async function POST(request: Request) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  let rawBody: unknown;
  try {
    rawBody = await parseJsonBody<unknown>(request);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    return jsonError("INTERNAL_ERROR", "请求解析失败", 500);
  }

  try {
    const input = requestSchema.parse(rawBody);
    const quotaAdmission =
      !contextResult.value.isMock && contextResult.value.supabase
        ? await checkQuotaAdmissionSafe(contextResult.value.supabase, {
            teacherId: contextResult.value.teacherId,
            action: "generate_pbl",
          })
        : null;
    if (quotaAdmission && !quotaAdmission.allowed) {
      return jsonError(
        "QUOTA_EXHAUSTED",
        "当前测试期使用量已达上限，请等待下个周期重置后继续。",
        403,
        buildQuotaExhaustedDetails(quotaAdmission),
        buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
      );
    }
    const quotaIdempotencyKey =
      !contextResult.value.isMock && contextResult.value.supabase
        ? resolveQuotaIdempotencyKey(request, `pbl:${contextResult.value.teacherId}`)
        : null;
    const startedAt = Date.now();
    const result = await generatePblProject(input);
    const now = new Date().toISOString();
    const plan = {
      ...result.plan,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await saveProjectPlan(contextResult.value, plan);

    scheduleReliableAfterTask({
      taskType: "pbl.generate_v2_postprocess",
      taskKey: plan.id,
      teacherId: contextResult.value.teacherId,
      payload: {
        planId: plan.id,
      },
      run: async () => {
        await appendGenerationLog(contextResult.value, {
          planId: plan.id,
          step: "search",
          status: "success",
          modelUsed: "duckduckgo-html",
          durationMs: result.timings.searchMs ?? 0,
          message: `${result.searchResults.length} sources`,
        });
        await appendGenerationLog(contextResult.value, {
          planId: plan.id,
          step: "generate",
          status: "success",
          modelUsed: "pbl_generate_full",
          durationMs: result.timings.generateMs ?? Math.max(0, Date.now() - startedAt),
          message: input.prompt.slice(0, 120),
        });
        await appendGenerationLog(contextResult.value, {
          planId: plan.id,
          step: "extract_metadata",
          status: "success",
          modelUsed: "pbl_metadata_extract",
          durationMs: result.timings.extractMetadataMs ?? 0,
          message: plan.title,
        });

        if (!contextResult.value.isMock && contextResult.value.supabase) {
          await syncPblProjectContentLibraryItem({
            supabase: contextResult.value.supabase,
            teacherId: contextResult.value.teacherId,
            plan,
          });
        }
      },
    });

    const quotaFinalize =
      quotaIdempotencyKey && contextResult.value.supabase
        ? await finalizeQuotaSpendSafe(contextResult.value.supabase, {
            teacherId: contextResult.value.teacherId,
            action: "generate_pbl",
            idempotencyKey: quotaIdempotencyKey,
            metadata: {
              route: "/api/pbl/generate",
              curriculumSystem: input.curriculumSystem ?? null,
              totalPeriods: input.totalPeriods ?? null,
            },
          })
        : null;

    return NextResponse.json(
      { plan },
      {
        headers: mergeHeaders(
          buildQuotaHeaders(quotaFinalize ?? quotaAdmission, {
            snapshot: quotaFinalize ? "final" : "admission",
            charged: quotaFinalize?.charged ?? null,
          }),
        ),
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "输入参数不合法", 400, error.flatten());
    }

    console.error("PBL 生成失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error && error.message.trim() ? error.message : "生成失败",
      500,
    );
  }
}
