import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { loadKnowledgePoints } from "@/lib/pbl/data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const curriculumSystem = url.searchParams.get("curriculumSystem");
    const subject = url.searchParams.get("subject")?.toLowerCase() ?? "";

    if (!curriculumSystem) {
      return jsonError("VALIDATION_ERROR", "curriculumSystem 为必填项", 400);
    }

    const points = (await loadKnowledgePoints()).filter((item) => {
      if (item.curriculumSystem !== curriculumSystem) return false;
      if (!subject) return true;
      return item.subject.toLowerCase().includes(subject);
    });

    const grouped = points.reduce<Record<string, typeof points>>((acc, point) => {
      if (!acc[point.hierarchyLabel]) {
        acc[point.hierarchyLabel] = [];
      }
      acc[point.hierarchyLabel].push(point);
      return acc;
    }, {});

    return NextResponse.json({
      curriculumSystem,
      subject: subject || null,
      total: points.length,
      grouped,
      points,
    });
  } catch (error) {
    console.error("读取课标知识点失败", error);
    return jsonError("INTERNAL_ERROR", "读取课标知识点失败", 500);
  }
}
