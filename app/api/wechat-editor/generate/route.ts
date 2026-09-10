import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { streamGatewayText } from "@/lib/ai/gateway";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { getModelForTask } from "@/lib/ai/model-router";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { checkQuotaAdmissionSafe, finalizeQuotaSpendSafe } from "@/lib/quota/service";
import { buildQuotaHeaders, buildQuotaExhaustedDetails } from "@/lib/quota/headers";

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(10000),
      }),
    )
    .min(1)
    .max(30),
});

const SYSTEM_PROMPT = `你是一名经验丰富的微信公众号内容运营，擅长撰写教育机构的官方宣传文章。

输出要求：
- 格式：Markdown
- 长度：800-1500 字
- 风格：生动活泼、有温度、贴近读者，避免学术化和说教感
- 结构：吸引眼球的标题（# ）→ 简短引言 → 正文（## 分段小标题）→ 结尾号召
- 语言：以中文为主，专有名词可保留英文（如 AP、IB）
- 排版：善用粗体、emoji、列表、引用块，增强可读性和传播力
- 语气：像朋友分享好消息一样，亲切自然，不要生硬

适用场景：活动回顾、招生宣传、教学成果展示、课程介绍、校园动态等。
用户会描述文章主题或要求，你直接输出完整的 Markdown 文章。`;

export const maxDuration = 60;

export async function POST(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const { teacherId, supabase } = contextResult.value;

  // ── 配额准入检查 ──────────────────────────────────────
  if (supabase) {
    const quotaAdmission = await checkQuotaAdmissionSafe(supabase, {
      teacherId,
      action: "generate_wechat_article",
    });
    if (quotaAdmission && !quotaAdmission.allowed) {
      return jsonError(
        "QUOTA_EXHAUSTED",
        "当前测试期使用量已达上限，请等待下个周期重置后继续。",
        403,
        buildQuotaExhaustedDetails(quotaAdmission),
        buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
      );
    }
  }

  const quotaIdempotencyKey = `wechat-generate:${randomUUID()}`;

  try {
    const body = requestSchema.parse(await parseJsonBody(request));
    const result = streamGatewayText({
      capability: "stream",
      model: getModelForTask("wechat_article"),
      system: SYSTEM_PROMPT,
      messages: body.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: 0.7,
      maxOutputTokens: 5120,
    }).result;

    // 流式完成后通过 next/server after() 扣费，确保 serverless 环境下回调不会丢失
    after(async () => {
      try {
        await result.text;
        if (supabase) {
          await finalizeQuotaSpendSafe(supabase, {
            teacherId,
            action: "generate_wechat_article",
            idempotencyKey: quotaIdempotencyKey,
            metadata: { route: "/api/wechat-editor/generate" },
          });
        }
      } catch (err) {
        console.error("微信文章生成配额扣费回调异常", err);
      }
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("生成公众号文章失败", error);
    return jsonError("INTERNAL_ERROR", "生成公众号文章失败", 500);
  }
}
