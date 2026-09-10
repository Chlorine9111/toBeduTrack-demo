import { z } from "zod";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { getProjectPlan, replaceProjectPlan } from "@/lib/pbl/store";
import type { PblPlan } from "@/lib/pbl/types";

const requestSchema = z.object({
  path: z.string().min(1, "path 不能为空"),
  value: z.union([z.string(), z.array(z.string())]),
});

/**
 * 将点分路径解析为 segments 数组。
 * 例："stages.0.objective" → ["stages", 0, "objective"]
 */
function parsePath(path: string): Array<string | number> {
  return path.split(".").map((segment) => {
    const num = Number(segment);
    return Number.isInteger(num) && num >= 0 ? num : segment;
  });
}

/**
 * 以 immutable 方式在嵌套对象中设置值。
 * 返回一个新对象，不修改原对象。
 */
function setNestedValue(
  obj: Record<string, unknown>,
  segments: Array<string | number>,
  value: unknown,
): Record<string, unknown> {
  if (segments.length === 0) return obj;

  const [head, ...rest] = segments;

  if (rest.length === 0) {
    return { ...obj, [head!]: value };
  }

  const child = obj[head as string];

  if (typeof head === "number" || typeof head === "string") {
    const currentChild =
      child !== undefined && child !== null
        ? (child as Record<string, unknown>)
        : {};

    if (Array.isArray(child)) {
      const nextKey = rest[0];
      if (typeof nextKey === "number") {
        const newArray = child.map((item, i) => {
          if (i !== nextKey) return item;
          if (rest.length === 1) return value;
          return setNestedValue(
            item as Record<string, unknown>,
            rest.slice(1),
            value,
          );
        });
        return { ...obj, [head]: newArray };
      }
      return { ...obj, [head]: setNestedValue({ ...child } as unknown as Record<string, unknown>, rest, value) };
    }

    if (typeof currentChild === "object" && !Array.isArray(currentChild)) {
      return {
        ...obj,
        [head]: setNestedValue(
          { ...currentChild } as Record<string, unknown>,
          rest,
          value,
        ),
      };
    }

    if (Array.isArray(currentChild)) {
      const nextKey = rest[0];
      if (typeof nextKey === "number") {
        const newArray = currentChild.map((item, i) => {
          if (i !== nextKey) return item;
          if (rest.length === 1) return value;
          return setNestedValue(
            item as Record<string, unknown>,
            rest.slice(1),
            value,
          );
        });
        return { ...obj, [head]: newArray };
      }
    }
  }

  return obj;
}

/**
 * 检查路径在对象中是否可达（字段存在）。
 */
function hasNestedPath(
  obj: Record<string, unknown>,
  segments: Array<string | number>,
): boolean {
  if (segments.length === 0) return true;

  const [head, ...rest] = segments;
  const child = Array.isArray(obj)
    ? (obj as unknown[])[head as number]
    : obj[head as string];

  if (child === undefined) return false;
  if (rest.length === 0) return true;

  if (typeof child === "object" && child !== null) {
    return hasNestedPath(child as Record<string, unknown>, rest);
  }

  return false;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError(
      "UNAUTHORIZED",
      contextResult.error.message,
      contextResult.error.status,
    );
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
    const { path, value } = requestSchema.parse(rawBody);
    const { id } = await params;

    const plan = await getProjectPlan(contextResult.value, id);
    if (!plan) {
      return jsonError("NOT_FOUND", "未找到项目", 404);
    }

    const segments = parsePath(path);

    if (!hasNestedPath(plan as unknown as Record<string, unknown>, segments)) {
      return jsonError(
        "VALIDATION_ERROR",
        `路径 "${path}" 在方案中不存在`,
        400,
      );
    }

    const updatedPlan = {
      ...setNestedValue(
        plan as unknown as Record<string, unknown>,
        segments,
        value,
      ),
      updatedAt: new Date().toISOString(),
    } as unknown as PblPlan;

    const saved = await replaceProjectPlan(contextResult.value, id, updatedPlan);

    return Response.json({ plan: saved ?? updatedPlan });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "参数不合法", 400, error.flatten());
    }
    throw error;
  }
}
