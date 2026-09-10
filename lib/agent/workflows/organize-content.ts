import { z } from "zod";
import type { AssetStoreClient, AssetCategory } from "@/lib/content-assets/types";
import { listAssets } from "@/lib/content-assets/store";
import { listFolders } from "@/lib/content-assets/folders";
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { resolveLanguageModel } from "@/lib/ai/provider-registry";

// ── Types ────────────────────────────────────────────────────

const organizeOperationSchema = z.object({
  action: z.enum([
    "move",
    "create_folder",
    "rename",
    "delete_folder",
    "delete_file",
    "categorize",
  ]),
  targetId: z
    .string()
    .describe("asset id or folder id to operate on; empty for create_folder"),
  targetTitle: z.string().describe("current title of the target"),
  destinationFolder: z
    .string()
    .describe(
      "for move: folder name; for rename: new name; for categorize: one of instructional/assessment/student_work/reference/uncategorized; empty for delete",
    )
    .default(""),
  reason: z.string().describe("short reason for this operation"),
});

const organizePlanSchema = z.object({
  operations: z.array(organizeOperationSchema),
  summary: z
    .string()
    .describe("one-line summary of the plan")
    .default("内容整理完成"),
});

export type OrganizeOperation = z.infer<typeof organizeOperationSchema>;
export type OrganizePlan = z.infer<typeof organizePlanSchema>;

// ── 分类标签映射 ─────────────────────────────────────────────

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  instructional: "教学",
  assessment: "评估",
  student_work: "学生作品",
  reference: "参考资源",
  uncategorized: "未分类",
};

// ── 递归构建文件夹树 ─────────────────────────────────────────

type FolderInfo = { id: string; name: string; parentId: string | null; isSystem: boolean };
type AssetInfo = {
  id: string;
  title: string;
  folderId: string | null;
  tags: string[];
  category: AssetCategory;
  mimeType: string | null;
  fileName: string | null;
  summaryText: string | null;
};

function buildContentStructureText(params: {
  folders: FolderInfo[];
  assets: AssetInfo[];
}) {
  const lines: string[] = [];
  const childrenByParent = new Map<string | null, FolderInfo[]>();
  const assetsByFolder = new Map<string | null, AssetInfo[]>();

  for (const folder of params.folders) {
    const bucket = childrenByParent.get(folder.parentId) ?? [];
    bucket.push(folder);
    childrenByParent.set(folder.parentId, bucket);
  }

  for (const asset of params.assets) {
    const bucket = assetsByFolder.get(asset.folderId) ?? [];
    bucket.push(asset);
    assetsByFolder.set(asset.folderId, bucket);
  }

  function formatAsset(asset: AssetInfo, indent: string) {
    const ext = asset.fileName?.split(".").pop() || asset.mimeType?.split("/").pop() || "?";
    const cat = CATEGORY_LABEL[asset.category] || "未分类";
    const tagStr = asset.tags.length > 0 ? ` tags:[${asset.tags.join(",")}]` : "";
    const summaryStr = asset.summaryText ? ` 摘要:${asset.summaryText}` : "";
    return `${indent}- [${ext}] ${asset.title} (id:${asset.id}) 分类:${cat}${tagStr}${summaryStr}`;
  }

  function renderFolder(folder: FolderInfo, depth: number) {
    const indent = "  ".repeat(depth);
    const sysTag = folder.isSystem ? " [系统]" : "";
    lines.push(`${indent}- [folder] ${folder.name}${sysTag} (id:${folder.id})`);

    const children = childrenByParent.get(folder.id) ?? [];
    for (const child of children) {
      renderFolder(child, depth + 1);
    }

    const folderAssets = assetsByFolder.get(folder.id) ?? [];
    for (const asset of folderAssets) {
      lines.push(formatAsset(asset, "  ".repeat(depth + 1)));
    }
  }

  lines.push("## 文件夹结构");
  const rootFolders = childrenByParent.get(null) ?? [];
  for (const folder of rootFolders) {
    renderFolder(folder, 0);
  }

  const rootAssets = assetsByFolder.get(null) ?? [];
  if (rootAssets.length > 0) {
    lines.push("- [根目录未归档文件]");
    for (const asset of rootAssets) {
      lines.push(formatAsset(asset, "  "));
    }
  }

  // 分类统计
  const catCounts = new Map<string, number>();
  for (const asset of params.assets) {
    const label = CATEGORY_LABEL[asset.category] || "未分类";
    catCounts.set(label, (catCounts.get(label) ?? 0) + 1);
  }
  lines.push("");
  lines.push("## 分类统计");
  for (const [label, count] of catCounts) {
    lines.push(`- ${label}: ${count} 个文件`);
  }

  return lines.join("\n");
}

// ── Main function ────────────────────────────────────────────

export async function executeOrganizeContent(params: {
  teacherId: string;
  userRequest: string;
  client: AssetStoreClient;
}): Promise<{ plan: OrganizePlan; executed: boolean }> {
  const [foldersResult, assetsResult] = await Promise.all([
    listFolders(params.client),
    listAssets(params.client, { limit: 300 }),
  ]);

  const folders: FolderInfo[] = foldersResult.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    isSystem: f.isSystem,
  }));

  // 只整理上传的文件，不整理 reference（AI 生成物的快照）
  const assets: AssetInfo[] = assetsResult.items
    .filter((a) => a.assetSource === "uploaded")
    .map((a) => ({
      id: a.id,
      title: a.title,
      folderId: a.folderId,
      tags: a.tags,
      category: a.category,
      mimeType: a.mimeType,
      fileName: a.fileName,
      summaryText: a.summaryText,
    }));

  if (assets.length === 0) {
    return {
      plan: {
        operations: [],
        summary: "没有需要整理的上传文件。",
      },
      executed: false,
    };
  }

  const structureText = buildContentStructureText({ folders, assets });

  const resolved = resolveLanguageModel("claude-haiku-4-5-20251001");

  const { object: plan } = await generateStructuredObjectWithGateway({
    model: resolved,
    schema: organizePlanSchema,
    schemaName: "organize_plan",
    schemaDescription: "Content organization plan",
    systemPrompt: [
      "你是教师内容库智能整理助手。根据教师请求和当前库结构，生成最优整理计划。",
      "",
      "可用操作（6 种）：",
      "- move: 移动文件到文件夹。destinationFolder = 文件夹名称",
      "- create_folder: 创建新文件夹。destinationFolder = 新文件夹名称",
      "- rename: 重命名。destinationFolder = 新名称",
      "- delete_folder: 删除空文件夹（先移走文件）",
      "- delete_file: 删除文件（仅教师明确要求时）",
      "- categorize: 设置文件分类。destinationFolder = instructional/assessment/student_work/reference/uncategorized",
      "",
      "分类含义：",
      "- instructional: 教案、课件、讲义、学习指南、教学笔记",
      "- assessment: 试卷、练习题、Quiz、FRQ、MCQ、Rubric、考试",
      "- student_work: 学生提交的作业、答卷",
      "- reference: 教材、College Board 文档、参考论文",
      "- uncategorized: 无法判断",
      "",
      "智能整理规则：",
      "- 按学科创建文件夹（AP Calculus / AP Physics / AP Chemistry ...）",
      "- 同一学科的所有材料放同一文件夹（教案+习题+参考资料）",
      "- 每个文件可能附带「摘要」字段，这是 AI 自动生成的内容概述，可作为学科和分类判断的重要参考",
      "- 根据文件名、tags 和摘要推断学科和分类",
      "- 文件名含 exam/quiz/test/practice → categorize: assessment",
      "- 文件名含 lesson/plan/教案/notes → categorize: instructional",
      "- 文件名含 CB/College Board/textbook → categorize: reference",
      "- 已在正确位置的文件不要移动",
      "- 已有正确分类的文件不要重新分类",
      "- 不要创建超过 2 层的文件夹嵌套",
      "- 标记为 [系统] 的文件夹不要删除或重命名",
      "- 不确定分类时保持 uncategorized",
      "- 除非教师明确要求，不删除任何文件",
      "- 每步都要有简短 reason",
      "- 先 create_folder → 再 move → 最后 categorize（操作顺序）",
    ].join("\n"),
    userPrompt: `当前内容库结构：\n${structureText}\n\n教师请求：${params.userRequest}`,
    maxTokens: 3000,
    timeout: 45_000,
  });

  return { plan, executed: false };
}
