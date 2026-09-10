import type { AssetStoreClient, ContentAsset } from "@/lib/content-assets/types";
import { getAsset, moveAsset, updateAsset, deleteAsset } from "@/lib/content-assets/store";
import { createFolder, listFolders, renameFolder, deleteFolder } from "@/lib/content-assets/folders";
import type { OrganizeOperation } from "@/lib/agent/workflows/organize-content";
import type { OrganizeOperationEvent } from "@/lib/agent/workflows/organize-content-types";

// ── Async Generator（流式执行） ────────────────────────────

export async function* executeOrganizePlanStream(params: {
  teacherId: string;
  operations: OrganizeOperation[];
  client: AssetStoreClient;
}): AsyncGenerator<OrganizeOperationEvent> {
  const total = params.operations.length;
  if (total === 0) {
    yield { phase: "summary", totalOps: 0, succeeded: 0, failed: 0, errors: [] };
    return;
  }

  yield { phase: "preparing", message: `准备执行 ${total} 项操作…` };

  // 获取最新的 folder 列表用于 name → id 映射
  const folders = await listFolders(params.client);
  const folderNameMap = new Map(folders.map((f) => [f.name, f.id]));

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < total; i++) {
    const op = params.operations[i];

    // 查询当前所在文件夹（用于前端 undo）
    let previousFolderId: string | null = null;
    if (op.action === "move" && op.targetId) {
      try {
        const current = await getAsset(params.client, op.targetId);
        previousFolderId = current?.folderId ?? null;
      } catch {
        // 查询失败不阻断执行
      }
    }

    yield { phase: "executing", index: i, total, op, previousFolderId };

    try {
      let result: ContentAsset | null = null;

      switch (op.action) {
        case "create_folder": {
          const existing = folderNameMap.get(op.destinationFolder);
          if (!existing) {
            const created = await createFolder(params.client, {
              name: op.destinationFolder,
            });
            folderNameMap.set(created.name, created.id);
          }
          // create_folder 没有直接关联的 ContentAsset，构造一个伪结果
          result = null;
          break;
        }

        case "move": {
          let targetFolderId = folderNameMap.get(op.destinationFolder) ?? null;
          if (!targetFolderId) {
            const created = await createFolder(params.client, {
              name: op.destinationFolder,
            });
            folderNameMap.set(created.name, created.id);
            targetFolderId = created.id;
          }
          result = await moveAsset(params.client, op.targetId, targetFolderId);
          break;
        }

        case "rename": {
          const isFolder = folderNameMap.has(op.targetTitle) ||
            folders.some((f) => f.id === op.targetId);
          if (isFolder) {
            await renameFolder(params.client, op.targetId, op.destinationFolder);
            folderNameMap.delete(op.targetTitle);
            folderNameMap.set(op.destinationFolder, op.targetId);
            result = null;
          } else {
            result = await updateAsset(params.client, op.targetId, {
              title: op.destinationFolder,
            });
          }
          break;
        }

        case "delete_folder": {
          await deleteFolder(params.client, op.targetId);
          // 从映射中移除
          for (const [name, id] of folderNameMap) {
            if (id === op.targetId) {
              folderNameMap.delete(name);
              break;
            }
          }
          result = null;
          break;
        }

        case "delete_file": {
          await deleteAsset(params.client, op.targetId);
          result = null;
          break;
        }

        case "categorize": {
          result = await updateAsset(params.client, op.targetId, {
            category: op.destinationFolder,
          });
          break;
        }
      }

      succeeded += 1;

      // done 事件：result 可能为 null（create_folder / rename folder）
      if (result) {
        yield { phase: "done", index: i, total, op, result, success: true };
      } else {
        // 对于无 ContentAsset 返回的操作，仍发 done 事件，用伪对象填充
        yield {
          phase: "done",
          index: i,
          total,
          op,
          result: { id: op.targetId || op.destinationFolder } as ContentAsset,
          success: true,
        };
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "未知错误";
      errors.push(`${op.action} "${op.targetTitle}": ${message}`);
      yield { phase: "error", index: i, total, op, error: message };
    }
  }

  yield { phase: "summary", totalOps: total, succeeded, failed, errors };
}

// ── 兼容包装（同步消费 generator） ──────────────────────────

export async function executeOrganizePlan(params: {
  teacherId: string;
  operations: OrganizeOperation[];
  client: AssetStoreClient;
}): Promise<{ executedCount: number; failedCount: number; errors: string[] }> {
  let result = { executedCount: 0, failedCount: 0, errors: [] as string[] };

  for await (const event of executeOrganizePlanStream(params)) {
    if (event.phase === "summary") {
      result = {
        executedCount: event.succeeded,
        failedCount: event.failed,
        errors: event.errors,
      };
    }
  }

  return result;
}
