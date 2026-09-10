import type { UploadedMaterial } from "@/lib/agent/chat-shared";

export type MaterialTaskKind =
  | "lesson_plan"
  | "exercise"
  | "rubric"
  | "pbl"
  | "research"
  | "summary"
  | "general";

function getTaskAwarePrefix(taskKind: MaterialTaskKind): string {
  switch (taskKind) {
    case "lesson_plan":
      return "可用于教案的当前材料摘录：请在生成教案时优先整合这些材料中的内容、示例和结构。";
    case "exercise":
      return "可用于出题的当前材料摘录：请基于这些材料中的知识点、题型和难度风格出题。";
    case "rubric":
      return "可用于 Rubric 的当前材料摘录：请参考其中的评分标准和维度设计 Rubric。";
    case "pbl":
      return "可用于 PBL 的当前材料摘录：请在项目式学习方案中整合这些材料的核心概念和资源。";
    case "research":
      return "可用于分析总结的当前材料摘录：请基于这些内容进行分析和总结。";
    case "summary":
      return "可用于摘要的当前材料摘录：";
    case "general":
    default:
      return "可用当前材料摘录：";
  }
}

function trimMaterialContext(text: string, maxLength?: number) {
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

/**
 * 将当前材料的完整文本拼接为上下文块，不分块、不评分、不截断。
 * 当前材料既包括本轮上传文件，也包括老师显式引用的内容库条目。
 */
export function buildTaskAwareMaterialContext(params: {
  materials: UploadedMaterial[] | undefined;
  taskKind: MaterialTaskKind;
  query: string;
  maxLength?: number;
  maxMaterials?: number;
}) {
  const materials = params.materials ?? [];
  if (materials.length === 0) return "";

  const textMaterials = materials
    .slice(0, params.maxMaterials ?? 2)
    .filter((item) => item.textContent.trim());

  if (textMaterials.length === 0) {
    const imageMaterials = materials.filter((item) => item.images && item.images.length > 0);
    if (imageMaterials.length > 0) {
      return trimMaterialContext(
        imageMaterials
        .map((item, index) =>
          `【当前材料 ${index + 1}: ${item.fileName}】(${item.fileType}, ${item.images!.length} 页图片已附在消息中)`,
        )
        .join("\n"),
        params.maxLength,
      );
    }
    return "";
  }

  const taskPrefix = getTaskAwarePrefix(params.taskKind);

  return trimMaterialContext(
    [
      taskPrefix,
      ...textMaterials.map((item, index) =>
        `【当前材料 ${index + 1}: ${item.fileName}】(${item.fileType})\n${item.textContent}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n---\n\n"),
    params.maxLength,
  );
}

export function buildTaskAwareMaterialPreview(params: {
  materials: UploadedMaterial[] | undefined;
  taskKind: MaterialTaskKind;
  query: string;
  maxLength?: number;
}) {
  return buildTaskAwareMaterialContext({
    materials: params.materials,
    taskKind: params.taskKind,
    query: params.query,
    maxLength: params.maxLength,
    maxMaterials: 2,
  });
}
