"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { GraphNode, GraphLink, GraphData } from "@/lib/content-assets/client";
import { fetchGraph } from "@/lib/content-assets/client";
import GraphControls from "./GraphControls";

// react-force-graph-2d 依赖 canvas，只在客户端加载
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// 节点颜色映射
const NODE_COLORS: Record<string, string> = {
  pdf: "var(--heroui-danger)",
  ai: "#6940A5",
  image: "#D9730D",
  text: "#0B6E99",
};

const NODE_R = 6;

type Filters = {
  types: Set<string>;
  courseLabel: string;
  daysRange: number;
};

type GraphViewProps = {
  onOpenViewer: (assetId: string) => void;
};

// ForceGraph2D 内部使用的扩展节点类型（含 x, y 等 d3 注入属性）
type FGNode = GraphNode & {
  x?: number;
  y?: number;
  __bckgDimensions?: [number, number];
};

type FGLink = GraphLink & {
  source: FGNode | string;
  target: FGNode | string;
};

export default function GraphView({ onOpenViewer }: GraphViewProps) {
  const { isZh } = useAppI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverNode, setHoverNode] = useState<FGNode | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<FGLink>>(new Set());
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [filters, setFilters] = useState<Filters>({
    types: new Set(["pdf", "ai", "image", "text"]),
    courseLabel: "",
    daysRange: 0,
  });

  // 获取数据
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGraph()
      .then((data) => {
        if (!cancelled) setGraphData(data);
      })
      .catch((err) => {
        console.error("图谱数据加载失败:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 跟踪容器尺寸
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 预处理：交叉关联 neighbors 和 links
  const processedData = useMemo(() => {
    if (!graphData) return null;

    const now = Date.now();
    const cutoff = filters.daysRange > 0
      ? now - filters.daysRange * 24 * 60 * 60 * 1000
      : 0;

    const filteredNodes = graphData.nodes.filter((n) => {
      if (!filters.types.has(n.type)) return false;
      if (filters.courseLabel && n.courseLabel !== filters.courseLabel) return false;
      if (cutoff > 0 && new Date(n.createdAt).getTime() < cutoff) return false;
      return true;
    });

    const nodeIdSet = new Set(filteredNodes.map((n) => n.id));

    const filteredLinks = graphData.links.filter((l) => {
      const srcId = typeof l.source === "string" ? l.source : l.source.id;
      const tgtId = typeof l.target === "string" ? l.target : l.target.id;
      return nodeIdSet.has(srcId) && nodeIdSet.has(tgtId);
    });

    // 构建邻居映射
    const neighborsMap = new Map<string, Set<string>>();
    const nodeLinksMap = new Map<string, Set<FGLink>>();

    for (const link of filteredLinks) {
      const srcId = typeof link.source === "string" ? link.source : link.source.id;
      const tgtId = typeof link.target === "string" ? link.target : link.target.id;
      const fl = link as FGLink;

      if (!neighborsMap.has(srcId)) neighborsMap.set(srcId, new Set());
      if (!neighborsMap.has(tgtId)) neighborsMap.set(tgtId, new Set());
      neighborsMap.get(srcId)!.add(tgtId);
      neighborsMap.get(tgtId)!.add(srcId);

      if (!nodeLinksMap.has(srcId)) nodeLinksMap.set(srcId, new Set());
      if (!nodeLinksMap.has(tgtId)) nodeLinksMap.set(tgtId, new Set());
      nodeLinksMap.get(srcId)!.add(fl);
      nodeLinksMap.get(tgtId)!.add(fl);
    }

    return {
      graphData: { nodes: filteredNodes, links: filteredLinks },
      neighborsMap,
      nodeLinksMap,
    };
  }, [graphData, filters]);

  // 所有学科标签（用于筛选器选项）
  const courseLabels = useMemo(() => {
    if (!graphData) return [];
    const labels = new Set<string>();
    for (const n of graphData.nodes) {
      if (n.courseLabel) labels.add(n.courseLabel);
    }
    return Array.from(labels).sort();
  }, [graphData]);

  // hover 高亮
  const handleNodeHover = useCallback(
    (node: FGNode | null) => {
      if (!processedData) return;

      const newHighlightNodes = new Set<string>();
      const newHighlightLinks = new Set<FGLink>();

      if (node) {
        newHighlightNodes.add(node.id);
        const neighbors = processedData.neighborsMap.get(node.id);
        if (neighbors) {
          for (const nid of neighbors) newHighlightNodes.add(nid);
        }
        const links = processedData.nodeLinksMap.get(node.id);
        if (links) {
          for (const l of links) newHighlightLinks.add(l);
        }
      }

      setHoverNode(node);
      setHighlightNodes(newHighlightNodes);
      setHighlightLinks(newHighlightLinks);
    },
    [processedData],
  );

  const handleNodeClick = useCallback(
    (node: FGNode) => {
      onOpenViewer(node.id);
    },
    [onOpenViewer],
  );

  // 自定义节点渲染
  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const color = NODE_COLORS[node.type] ?? NODE_COLORS.text;
      const isHighlighted = highlightNodes.has(node.id);
      const isHovered = hoverNode?.id === node.id;
      const radius = NODE_R * Math.sqrt(Math.max(1, node.val));

      // 高亮光环
      if (isHighlighted) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
        ctx.fillStyle = isHovered ? "rgba(255,200,0,0.4)" : "rgba(255,200,0,0.2)";
        ctx.fill();
      }

      // 节点圆
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // 标签
      if (globalScale > 1.2 || isHighlighted) {
        const label = node.label.length > 16 ? node.label.slice(0, 15) + "…" : node.label;
        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isHovered ? "var(--heroui-foreground)" : "var(--heroui-default-500)";
        ctx.fillText(label, x, y + radius + 2);
      }
    },
    [highlightNodes, hoverNode],
  );

  // 节点点击区域
  const paintNodeArea = useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = NODE_R * Math.sqrt(Math.max(1, node.val));
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-default-400" />
        <span className="ml-2 text-[13px] text-default-400">
          {isZh ? "加载图谱…" : "Loading graph..."}
        </span>
      </div>
    );
  }

  if (!processedData || processedData.graphData.nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-20 text-default-400">
        <p className="text-[13px]">
          {isZh ? "暂无可显示的内容资产" : "No content assets to display"}
        </p>
        <p className="mt-1 text-[12px]">
          {isZh ? "上传文件后，图谱将自动构建" : "The graph will build automatically after you upload files"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <GraphControls
        filters={filters}
        onFiltersChange={setFilters}
        courseLabels={courseLabels}
        nodeCount={processedData.graphData.nodes.length}
        linkCount={processedData.graphData.links.length}
      />
      <div ref={containerRef} className="flex-1 min-h-0 relative bg-content1">
        {/* @ts-expect-error react-force-graph-2d types incomplete */}
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={processedData.graphData}
          nodeId="id"
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={paintNodeArea}
          linkWidth={(link: FGLink) => (highlightLinks.has(link) ? 2.5 : 1)}
          linkColor={(link: FGLink) =>
            link.type === "weak" ? "hsl(var(--heroui-default-200))" : "hsl(var(--heroui-default-300))"
          }
          linkLineDash={(link: FGLink) =>
            link.type === "weak" ? [4, 4] : undefined
          }
          onNodeHover={handleNodeHover as (node: object | null) => void}
          onNodeClick={handleNodeClick as (node: object) => void}
          cooldownTicks={80}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          backgroundColor="#FAFAFA"
        />
      </div>
    </div>
  );
}
