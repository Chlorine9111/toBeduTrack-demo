import type { OrganizeOperation } from "@/lib/agent/workflows/organize-content";
import type { ContentAsset } from "@/lib/content-assets/types";

// ── 流式执行事件类型 ────────────────────────────────────────

export type OrganizeOperationEvent =
  | { phase: "preparing"; message: string }
  | {
      phase: "executing";
      index: number;
      total: number;
      op: OrganizeOperation;
      previousFolderId: string | null;
    }
  | {
      phase: "done";
      index: number;
      total: number;
      op: OrganizeOperation;
      result: ContentAsset;
      success: true;
    }
  | {
      phase: "error";
      index: number;
      total: number;
      op: OrganizeOperation;
      error: string;
    }
  | {
      phase: "summary";
      totalOps: number;
      succeeded: number;
      failed: number;
      errors: string[];
    }
  | { phase: "context"; summary: string };
