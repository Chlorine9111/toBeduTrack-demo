import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";

export async function GET() {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    // 1. 查询 ready 状态的 content_assets → nodes
    const { data: assets, error: assetsError } = await supabase
      .from("content_assets")
      .select("id, title, file_type, asset_source, folder_id, course_label, unit_label, ref_entity_type, created_at")
      .eq("teacher_id", teacherId)
      .eq("processing_status", "ready");

    if (assetsError) {
      throw new Error(`查询 content_assets 失败: ${assetsError.message}`);
    }

    if (!assets || assets.length === 0) {
      return NextResponse.json({ nodes: [], links: [] });
    }

    // 2. 查询 content_asset_edges → strong links
    const edgeTable = (supabase.from as unknown as (table: string) => ReturnType<typeof supabase.from>)(
      "content_asset_edges",
    );
    const { data: edges } = await (edgeTable as ReturnType<typeof supabase.from>)
      .select("source_asset_id, target_asset_id, edge_type, weight") as { data: Array<{
        source_asset_id: string;
        target_asset_id: string;
        edge_type: string;
        weight: number;
      }> | null };

    // 3. 构建节点 ID 集合（用于过滤有效 edges）
    const assetIdSet = new Set(assets.map((a) => a.id));

    // 4. 构建 nodes
    type GraphNode = {
      id: string;
      label: string;
      type: string;
      source: string;
      val: number;
      folderId: string | null;
      courseLabel: string | null;
      unitLabel: string | null;
      createdAt: string;
    };

    const referenceCount = new Map<string, number>();

    const validEdges = (edges ?? []).filter(
      (e) => assetIdSet.has(e.source_asset_id) && assetIdSet.has(e.target_asset_id),
    );

    for (const edge of validEdges) {
      referenceCount.set(
        edge.source_asset_id,
        (referenceCount.get(edge.source_asset_id) ?? 0) + 1,
      );
      referenceCount.set(
        edge.target_asset_id,
        (referenceCount.get(edge.target_asset_id) ?? 0) + 1,
      );
    }

    const nodes: GraphNode[] = assets.map((a) => {
      const fileType = a.file_type ?? "";
      let type = "text";
      if (fileType.includes("pdf")) type = "pdf";
      else if (fileType.match(/^image\//)) type = "image";
      else if (a.asset_source === "reference") type = "ai";

      return {
        id: a.id as string,
        label: (a.title as string) || "未命名",
        type,
        source: a.asset_source as string,
        val: Math.max(1, referenceCount.get(a.id as string) ?? 0),
        folderId: a.folder_id as string | null,
        courseLabel: a.course_label as string | null,
        unitLabel: a.unit_label as string | null,
        createdAt: a.created_at as string,
      };
    });

    // 5. 构建 links：strong (edges) + weak (same folder)
    type GraphLink = {
      source: string;
      target: string;
      type: "strong" | "weak";
      edgeType?: string;
      weight: number;
    };

    const links: GraphLink[] = [];
    const linkSet = new Set<string>();

    for (const edge of validEdges) {
      const key = [edge.source_asset_id, edge.target_asset_id].sort().join(":");
      if (!linkSet.has(key)) {
        linkSet.add(key);
        links.push({
          source: edge.source_asset_id,
          target: edge.target_asset_id,
          type: "strong",
          edgeType: edge.edge_type,
          weight: edge.weight,
        });
      }
    }

    // 同 folder 的弱关联
    const folderGroups = new Map<string, string[]>();
    for (const asset of assets) {
      if (asset.folder_id) {
        const fid = asset.folder_id as string;
        const group = folderGroups.get(fid) ?? [];
        group.push(asset.id as string);
        folderGroups.set(fid, group);
      }
    }

    for (const [, group] of folderGroups) {
      if (group.length < 2 || group.length > 20) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const key = [group[i], group[j]].sort().join(":");
          if (!linkSet.has(key)) {
            linkSet.add(key);
            links.push({
              source: group[i],
              target: group[j],
              type: "weak",
              weight: 0.3,
            });
          }
        }
      }
    }

    return NextResponse.json({ nodes, links });
  } catch (error) {
    console.error("[content-assets/graph] 图谱查询失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "图谱查询失败",
      500,
    );
  }
}
