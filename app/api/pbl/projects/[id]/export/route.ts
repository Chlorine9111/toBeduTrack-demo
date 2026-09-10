import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { getProjectPlan } from "@/lib/pbl/store";

type ExportFormat = "json" | "md";

function parseFormat(input: string | null): ExportFormat {
  return input === "json" ? "json" : "md";
}

function buildMarkdownResponse(filename: string, body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const { id } = await params;
    const plan = await getProjectPlan(contextResult.value, id);
    if (!plan) {
      return jsonError("NOT_FOUND", "未找到项目", 404);
    }

    const url = new URL(request.url);
    const format = parseFormat(url.searchParams.get("format"));

    if (format === "json") {
      return NextResponse.json({ plan });
    }

    return buildMarkdownResponse(`pbl-${plan.id}.md`, plan.markdownContent);
  } catch (error) {
    console.error("导出 PBL 项目失败", error);
    return jsonError("INTERNAL_ERROR", "导出失败", 500);
  }
}
