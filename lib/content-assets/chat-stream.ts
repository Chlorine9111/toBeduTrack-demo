import type { AssetStoreClient } from "@/lib/content-assets/types";
import { listAssets } from "@/lib/content-assets/store";
import { listFolders } from "@/lib/content-assets/folders";
import { executeOrganizePlanStream } from "@/lib/agent/workflows/organize-content-executor";
import type { OrganizeOperationEvent } from "@/lib/agent/workflows/organize-content-types";
import type { OrganizePlan } from "@/lib/agent/workflows/organize-content";

// ── 构建内容库快照 ──────────────────────────────────────────

export type ContentStructureSnapshot = {
  folders: Array<{ id: string; name: string; parentId: string | null }>;
  assets: Array<{ id: string; title: string; folderId: string | null; tags: string[] }>;
};

export async function buildContentStructureSnapshot(
  client: AssetStoreClient,
): Promise<ContentStructureSnapshot> {
  const [foldersResult, assetsResult] = await Promise.all([
    listFolders(client),
    listAssets(client, { limit: 200 }),
  ]);

  return {
    folders: foldersResult.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
    })),
    assets: assetsResult.items.map((a) => ({
      id: a.id,
      title: a.title,
      folderId: a.folderId,
      tags: a.tags,
    })),
  };
}

// ── 流式执行并 yield 事件 ───────────────────────────────────

export async function* streamOrganizePlanExecution(params: {
  teacherId: string;
  plan: OrganizePlan;
  client: AssetStoreClient;
}): AsyncGenerator<OrganizeOperationEvent> {
  if (params.plan.operations.length === 0) {
    yield { phase: "summary", totalOps: 0, succeeded: 0, failed: 0, errors: [] };
    return;
  }

  yield* executeOrganizePlanStream({
    teacherId: params.teacherId,
    operations: params.plan.operations,
    client: params.client,
  });
}

// ── 生成多轮上下文摘要 ─────────────────────────────────────

export function buildContextSummary(params: {
  plan: OrganizePlan;
  succeeded: number;
  failed: number;
}): string {
  const { plan, succeeded, failed } = params;
  const parts: string[] = [];

  parts.push(`已完成 ${succeeded} 项操作`);
  if (failed > 0) {
    parts.push(`${failed} 项失败`);
  }

  if (plan.operations.length > 0) {
    const opSummaries = plan.operations
      .slice(0, 5)
      .map((op) => {
        const actionLabel =
          op.action === "move" ? "移动"
            : op.action === "create_folder" ? "新建文件夹"
            : "重命名";
        return `${actionLabel} "${op.targetTitle || op.destinationFolder}"`;
      });
    parts.push(opSummaries.join("、"));
    if (plan.operations.length > 5) {
      parts.push(`等共 ${plan.operations.length} 项`);
    }
  }

  return parts.join("；");
}

// ── 撤回意图检测 ───────────────────────────────────────────

const UNDO_PATTERNS = [
  /撤回/,
  /撤销/,
  /还原/,
  /恢复/,
  /undo/i,
  /回滚/,
  /取消(刚才|上次|之前)/,
  /放回/,
  /移回/,
];

export function detectUndoIntent(message: string): boolean {
  return UNDO_PATTERNS.some((pattern) => pattern.test(message));
}
