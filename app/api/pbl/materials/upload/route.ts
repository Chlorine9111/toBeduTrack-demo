import { randomUUID } from "crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { addPrivateMaterial } from "@/lib/pbl/store";

const uploadMaterialSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(["competition", "pbl_case", "driving_question", "curriculum_map"]),
  source: z.string().trim().min(1).max(200),
  year: z.number().int().min(1900).max(2100),
  tags: z.array(z.string().trim().min(1)).min(3),
  link: z.string().trim().min(1),
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
    const payload = uploadMaterialSchema.parse(rawBody);
    const material = await addPrivateMaterial(contextResult.value, {
      id: `U-${randomUUID().slice(0, 8).toUpperCase()}`,
      curriculumScope: "GENERIC",
      ...payload,
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "上传素材参数不合法", 400, error.flatten());
    }
    console.error("上传私有素材失败", error);
    return jsonError("INTERNAL_ERROR", "上传素材失败", 500);
  }
}
