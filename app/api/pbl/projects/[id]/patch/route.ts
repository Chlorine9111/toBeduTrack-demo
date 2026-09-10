import { z } from "zod";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { getProjectPlan, replaceProjectPlan } from "@/lib/pbl/store";
import { pblPlanPatchSchema } from "@/lib/pbl/assistant";
import { generateToolInputWithGateway } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { PblPlan, PblStage } from "@/lib/pbl/types";

const requestSchema = z.object({
  planPatch: pblPlanPatchSchema,
});

const PATCH_RESULT_TOOL = {
  name: "return_patch_result",
  description: "Return the patched content for the specified field.",
  inputSchema: {
    type: "object" as const,
    properties: {
      value: {
        oneOf: [
          { type: "string" as const },
          { type: "array" as const, items: { type: "string" as const } },
        ],
      },
    },
    required: ["value"],
  },
};

const FIELD_LABEL_MAP: Record<string, string> = {
  objective: "阶段目标",
  coreActivities: "核心活动",
  teacherRole: "教师角色",
  knowledgeEmbedding: "知识嵌入",
  scaffolding: "脚手架",
  deliverables: "交付物",
  drivingQuestion: "驱动问题",
  overviewText: "项目概述",
  finalOutcomeRequirements: "成果要求",
  name: "阶段名称",
  timeSuggestion: "时间建议",
  requiredResources: "所需资源",
};

function getCurrentFieldValue(
  plan: PblPlan,
  patch: z.infer<typeof pblPlanPatchSchema>,
): string | undefined {
  if (patch.stageNumber) {
    const stage = plan.stages[patch.stageNumber - 1];
    if (!stage || !patch.field) return undefined;
    const val = stage[patch.field as keyof PblStage];
    if (Array.isArray(val)) return val.join("；");
    if (typeof val === "string") return val;
    return undefined;
  }
  if (!patch.field) return undefined;
  const val = plan[patch.field as keyof PblPlan];
  if (typeof val === "string") return val;
  return undefined;
}

function buildPatchPrompt(plan: PblPlan, patch: z.infer<typeof pblPlanPatchSchema>) {
  const context: string[] = [
    `项目标题：${plan.title}`,
    `驱动问题：${plan.drivingQuestion}`,
    `学科：${plan.primarySubject}`,
    `难度：${plan.difficulty}`,
    `总课时：${plan.totalPeriods}`,
  ];

  if (patch.stageNumber) {
    const stage = plan.stages[patch.stageNumber - 1];
    if (stage) {
      context.push(`\n当前阶段 ${stage.stageNumber}（${stage.name}）：`);
      context.push(`  目标：${stage.objective}`);
      context.push(`  核心活动：${stage.coreActivities.join("；")}`);
      context.push(`  教师角色：${stage.teacherRole}`);
      context.push(`  脚手架：${stage.scaffolding.join("；")}`);
      context.push(`  交付物：${stage.deliverables.join("；")}`);
      context.push(`  时间建议：${stage.timeSuggestion}`);
      context.push(`  所需资源：${stage.requiredResources.join("；")}`);
    }
  }

  const fieldLabel = patch.field ? (FIELD_LABEL_MAP[patch.field] ?? patch.field) : "内容";
  const currentValue = getCurrentFieldValue(plan, patch);
  const currentValueHint = currentValue ? `\n\n## 当前「${fieldLabel}」的值\n${currentValue}` : "";

  const isArrayField = patch.field && ["coreActivities", "scaffolding", "deliverables", "requiredResources"].includes(patch.field);

  return {
    system: "你是 PBL 方案局部修改助手。根据教师指令修改方案的指定字段。只返回修改后的内容，不要返回其他信息。",
    user: `## 方案上下文\n${context.join("\n")}${currentValueHint}\n\n## 要修改的字段\n${fieldLabel}\n\n## 修改指令\n${patch.instruction}\n\n## 返回格式\n${isArrayField ? "返回一个字符串数组，每个元素是一条内容。" : "返回一个字符串。"}`,
  };
}

function applyPatchToPlan(
  plan: PblPlan,
  patch: z.infer<typeof pblPlanPatchSchema>,
  newValue: string | string[],
): PblPlan {
  if (!patch.stageNumber) {
    if (patch.field === "drivingQuestion" && typeof newValue === "string") {
      return { ...plan, drivingQuestion: newValue, updatedAt: new Date().toISOString() };
    }
    if (patch.field === "overviewText" && typeof newValue === "string") {
      return { ...plan, overviewText: newValue, updatedAt: new Date().toISOString() };
    }
    if (patch.field === "finalOutcomeRequirements" && typeof newValue === "string") {
      return { ...plan, finalOutcomeRequirements: newValue, updatedAt: new Date().toISOString() };
    }
    return plan;
  }

  const stageIndex = patch.stageNumber - 1;
  if (stageIndex < 0 || stageIndex >= plan.stages.length) return plan;

  const updatedStages = plan.stages.map((stage, i) => {
    if (i !== stageIndex) return stage;
    const updates: Partial<PblStage> = {};

    if (patch.field === "objective" && typeof newValue === "string") {
      updates.objective = newValue;
    } else if (patch.field === "coreActivities" && Array.isArray(newValue)) {
      updates.coreActivities = newValue;
    } else if (patch.field === "teacherRole" && typeof newValue === "string") {
      updates.teacherRole = newValue;
    } else if (patch.field === "knowledgeEmbedding" && typeof newValue === "string") {
      updates.knowledgeEmbedding = newValue;
    } else if (patch.field === "scaffolding" && Array.isArray(newValue)) {
      updates.scaffolding = newValue;
    } else if (patch.field === "deliverables" && Array.isArray(newValue)) {
      updates.deliverables = newValue;
    } else if (patch.field === "name" && typeof newValue === "string") {
      updates.name = newValue;
    } else if (patch.field === "timeSuggestion" && typeof newValue === "string") {
      updates.timeSuggestion = newValue;
    } else if (patch.field === "requiredResources" && Array.isArray(newValue)) {
      updates.requiredResources = newValue;
    }

    return { ...stage, ...updates };
  });

  return { ...plan, stages: updatedStages, updatedAt: new Date().toISOString() };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { planPatch } = requestSchema.parse(rawBody);
    if (!planPatch.field) {
      return jsonError("VALIDATION_ERROR", "planPatch.field 是必填字段", 400);
    }
    const { id } = await params;
    const plan = await getProjectPlan(contextResult.value, id);
    if (!plan) {
      return jsonError("NOT_FOUND", "未找到项目", 404);
    }

    const { system, user } = buildPatchPrompt(plan, planPatch);

    const { input: result } = await generateToolInputWithGateway<{ value: unknown }>({
      model: getResolvedLanguageModelForTask("pbl_assistant"),
      systemPrompt: system,
      userPrompt: user,
      tool: PATCH_RESULT_TOOL,
      maxTokens: 2800,
      temperature: 0.3,
    });

    const rawValue = result.value;
    const isArrayField = planPatch.field && ["coreActivities", "scaffolding", "deliverables", "requiredResources"].includes(planPatch.field);

    let normalizedValue: string | string[];
    if (isArrayField) {
      if (Array.isArray(rawValue) && rawValue.every((v) => typeof v === "string")) {
        normalizedValue = rawValue as string[];
      } else if (typeof rawValue === "string") {
        normalizedValue = [rawValue];
      } else {
        return jsonError("INTERNAL_ERROR", "AI 返回了非预期格式，请重试", 500);
      }
    } else {
      if (typeof rawValue === "string") {
        normalizedValue = rawValue;
      } else if (Array.isArray(rawValue)) {
        normalizedValue = rawValue.join("\n");
      } else {
        return jsonError("INTERNAL_ERROR", "AI 返回了非预期格式，请重试", 500);
      }
    }

    const patchedPlan = applyPatchToPlan(plan, planPatch, normalizedValue);
    if (patchedPlan === plan) {
      return jsonError("VALIDATION_ERROR", "修改未能应用，请检查阶段号和字段名", 400);
    }

    const updated = await replaceProjectPlan(contextResult.value, id, patchedPlan);

    return Response.json({ plan: updated ?? patchedPlan });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "参数不合法", 400, error.flatten());
    }
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    console.error("PBL plan patch 失败", error);
    if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
      return jsonError("INTERNAL_ERROR", "AI 响应超时，请稍后重试", 504);
    }
    if (errorMessage.includes("rate") || errorMessage.includes("429")) {
      return jsonError("INTERNAL_ERROR", "AI 请求频率过高，请稍后重试", 429);
    }
    return jsonError("INTERNAL_ERROR", `方案局部修改失败：${errorMessage}`, 500);
  }
}
