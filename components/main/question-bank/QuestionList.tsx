"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CheckSquare2,
  Edit3,
  FolderOpen,
  Loader2,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import MathText from "@/components/main/chatflow/MathText";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import { cn } from "@/lib/utils";
import type {
  QuestionBankQuestionDetail,
  QuestionBankQuestionListItem,
  SidebarFilter,
} from "./helpers";
import {
  classificationLabel,
  classificationTone,
  cleanText,
  difficultyDots,
  requestJson,
  reviewLabel,
  reviewTone,
  sourceKindLabel,
  typeBadgeStyle,
  typeLabel,
} from "./helpers";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  questions: QuestionBankQuestionListItem[];
  loading: boolean;
  total: number;
  sidebarFilter: SidebarFilter;
  requestedQuestionId?: string;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (visibleIds: string[], allVisibleSelected: boolean) => void;
  onDeleteSingle: (id: string) => void;
  /** 搜索关键词，用于高亮匹配文字 */
  searchQuery?: string;
};

type ContextMenuState = {
  x: number;
  y: number;
  questionId: string;
} | null;

type FlatItem =
  | { type: "group-header"; label: string; count: number; key: string; clusterKey: string }
  | { type: "subgroup-header"; label: string; count: number; key: string }
  | { type: "question"; item: QuestionBankQuestionListItem; key: string };

// ---------------------------------------------------------------------------
// Difficulty & type label helpers for card style
// ---------------------------------------------------------------------------

function difficultyLabel(d: string | number | null | undefined): { text: string; className: string } {
  if (typeof d === "string") {
    if (d === "easy") return { text: "Easy", className: "bg-green-100/50 text-[#4D7C0F]" };
    if (d === "hard") return { text: "Hard", className: "bg-red-100/50 text-[#DC2626]" };
    return { text: "Medium", className: "bg-amber-100/50 text-[#B45309]" };
  }
  if (!d || d <= 2) return { text: "Easy", className: "bg-green-100/50 text-[#4D7C0F]" };
  if (d <= 3) return { text: "Medium", className: "bg-amber-100/50 text-[#B45309]" };
  return { text: "Hard", className: "bg-red-100/50 text-[#DC2626]" };
}

function typeDisplayLabel(t: string | null | undefined): { text: string; className: string } {
  const label = typeLabel(t ?? "");
  return { text: label, className: "bg-blue-100/50 text-[#5E6AD2]" };
}

// ---------------------------------------------------------------------------
// Search highlight component
// ---------------------------------------------------------------------------

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Card-style question row (collapsed)
// ---------------------------------------------------------------------------

function QuestionRow({
  item,
  isExpanded,
  isSelected,
  isFocused,
  selectionMode,
  searchQuery,
  onToggle,
  onClick,
  onContextMenu,
}: {
  item: QuestionBankQuestionListItem;
  isExpanded: boolean;
  isSelected: boolean;
  isFocused: boolean;
  selectionMode: boolean;
  searchQuery: string;
  onToggle: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const preview = cleanText(item.questionText).slice(0, 160);
  const title = cleanText(item.questionText).slice(0, 80);
  const diff = difficultyLabel(item.difficulty);
  const typeInfo = typeDisplayLabel(item.type);
  const idPrefix = (item.knowledgeClusterLabel || "Q").slice(0, 4).toUpperCase();
  const idNum = item.id.slice(-4).toUpperCase();

  if (isExpanded) return null; // 展开态由 ExpandedDetail 渲染

  return (
    <div
      onClick={selectionMode ? onToggle : onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "bg-white border border-[rgba(0,0,0,0.05)] rounded-xl hover:shadow-md transition-all cursor-pointer p-6",
        selectionMode && isSelected && "ring-2 ring-[#5E6AD2] border-[#5E6AD2]/30",
        isFocused && "ring-2 ring-[#5E6AD2]/50",
      )}
    >
      <div className="flex items-start gap-4">
        {/* 选择模式 checkbox */}
        {selectionMode ? (
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] mt-0.5",
              isSelected
                ? "border-[#5E6AD2] bg-[#5E6AD2] font-bold text-white"
                : "border-[#1D1D1F]/20 bg-white",
            )}
          >
            {isSelected ? "✓" : ""}
          </span>
        ) : (
          /* 展开箭头圆形按钮 */
          <div className="w-6 h-6 rounded-full bg-[#EBEBEB] flex items-center justify-center shrink-0 mt-0.5">
            <ChevronRight className="h-3.5 w-3.5 text-[#1D1D1F]/40" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* ID + 难度/类型标签 */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[11px] font-bold text-[#1D1D1F]/30 tracking-tight">
              #{idPrefix}-{idNum}
            </span>
            <div className="flex gap-2">
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold", diff.className)}>
                {diff.text}
              </span>
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold", typeInfo.className)}>
                {typeInfo.text}
              </span>
            </div>
          </div>
          {/* 标题（1行截断）*/}
          <h4 className="text-[15px] font-medium text-[#1D1D1F] line-clamp-1">
            <HighlightText text={title} query={searchQuery} />
          </h4>
          {/* 预览（2行截断）*/}
          <p className="text-[13px] text-[#1D1D1F]/50 mt-1 line-clamp-2">
            <HighlightText text={preview} query={searchQuery} />
          </p>
        </div>

        {/* 右侧 + 按钮 */}
        {!selectionMode ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); }}
            className="p-2 bg-[#F7F7F7] hover:bg-[rgba(94,106,210,0.12)] transition-colors rounded-lg shrink-0"
          >
            <Plus className="h-5 w-5 text-[#1D1D1F]/60" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline expanded detail (card style)
// ---------------------------------------------------------------------------

const DETAIL_CACHE_MAX = 500;
const DETAIL_CACHE_TTL = 30 * 60 * 1000; // 30 分钟

type DetailCacheMap = Map<string, { data: QuestionBankQuestionDetail; ts: number }>;

/** 写入缓存，LRU 淘汰：超容量时删除最久未访问的条目 */
function setDetailCache(cache: DetailCacheMap, id: string, data: QuestionBankQuestionDetail) {
  // LRU: 先删后 set，保证最近写入的在 Map 尾部
  cache.delete(id);
  if (cache.size >= DETAIL_CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(id, { data, ts: Date.now() });
}

/** 读取缓存，LRU: 命中时移到 Map 尾部；过期条目自动删除 */
function getDetailCache(cache: DetailCacheMap, id: string): QuestionBankQuestionDetail | null {
  const cached = cache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.ts > DETAIL_CACHE_TTL) {
    cache.delete(id);
    return null;
  }
  // LRU: 命中时移到尾部
  cache.delete(id);
  cache.set(id, cached);
  return cached.data;
}

function ExpandedDetail({
  questionId,
  item,
  detailCacheRef,
  onCollapse,
  onDelete,
}: {
  questionId: string;
  item: QuestionBankQuestionListItem;
  detailCacheRef: React.RefObject<DetailCacheMap>;
  onCollapse: () => void;
  onDelete: (id: string) => void;
}) {
  const [detail, setDetail] = useState<QuestionBankQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const diff = difficultyLabel(item.difficulty);
  const typeInfo = typeDisplayLabel(item.type);
  const idPrefix = (item.knowledgeClusterLabel || "Q").slice(0, 4).toUpperCase();
  const idNum = item.id.slice(-4).toUpperCase();

  useEffect(() => {
    let cancelled = false;
    const cache = detailCacheRef.current;

    // 检查缓存
    if (cache) {
      const cachedData = getDetailCache(cache, questionId);
      if (cachedData) {
        setDetail(cachedData);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    requestJson<QuestionBankQuestionDetail>(
      `/api/question-bank/${questionId}`,
    )
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          // 写入缓存（带 FIFO 淘汰）
          if (cache) setDetailCache(cache, questionId, data);
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questionId, detailCacheRef]);

  if (loading) {
    return (
      <div className="bg-white border border-[rgba(0,0,0,0.05)] rounded-xl overflow-hidden shadow-xs">
        <div className="flex items-center gap-2 p-6 text-[13px] text-[#1D1D1F]/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          加载详情...
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="bg-white border border-[rgba(0,0,0,0.05)] rounded-xl overflow-hidden shadow-xs">
        <div className="p-6 text-[13px] text-[#1D1D1F]/60">
          无法加载详情
        </div>
      </div>
    );
  }

  const ex = detail.exercise;

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.05)] rounded-xl overflow-hidden shadow-xs">
      {/* 上部内容区 */}
      <div className="p-6 border-b border-[rgba(0,0,0,0.05)]">
        {/* ID badge + 标签 + 操作按钮 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* 折叠箭头 */}
            <button
              type="button"
              onClick={onCollapse}
              className="w-6 h-6 rounded-full bg-[#EBEBEB] flex items-center justify-center shrink-0"
            >
              <ChevronDown className="h-3.5 w-3.5 text-[#1D1D1F]/40" />
            </button>
            <span className="text-[11px] font-bold text-[#1D1D1F]/30 tracking-tight">
              #{idPrefix}-{idNum}
            </span>
            <div className="flex gap-2">
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold", diff.className)}>
                {diff.text}
              </span>
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold", typeInfo.className)}>
                {typeInfo.text}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 rounded-lg text-[#1D1D1F]/40 hover:bg-[#F7F7F7] hover:text-[#1D1D1F]/60 transition-colors"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(questionId)}
              className="p-1.5 rounded-lg text-[#1D1D1F]/40 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="rounded-md border border-[rgba(0,0,0,0.05)] bg-[#F7F7F7] px-2.5 py-0.5 text-[11px] text-[#1D1D1F]/60">
            {detail.courseName ?? "未分类课程"}
            {detail.unitName ? ` · ${detail.unitName}` : ""}
          </span>
          <span className="rounded-md border border-[rgba(0,0,0,0.05)] bg-[#F7F7F7] px-2.5 py-0.5 text-[11px] text-[#1D1D1F]/60">
            {detail.knowledgeClusterLabel}
          </span>
          {detail.knowledgeSubskillLabel ? (
            <span className="rounded-md border border-[rgba(0,0,0,0.05)] bg-[#F7F7F7] px-2.5 py-0.5 text-[11px] text-[#1D1D1F]/60">
              {detail.knowledgeSubskillLabel}
            </span>
          ) : null}
          <span className="rounded-md border border-[rgba(0,0,0,0.05)] bg-[#F7F7F7] px-2.5 py-0.5 text-[11px] text-[#1D1D1F]/60">
            {detail.assessmentStyleLabel}
          </span>
          <span
            className={cn(
              "rounded-md border px-2.5 py-0.5 text-[11px]",
              reviewTone(detail.sourceReviewStatus),
            )}
          >
            {reviewLabel(detail.sourceReviewStatus)}
          </span>
          <span
            className={cn(
              "rounded-md border px-2.5 py-0.5 text-[11px]",
              classificationTone(detail.classificationStatus),
            )}
          >
            {classificationLabel(detail.classificationStatus)}
          </span>
        </div>

        {/* Question text (with inline images) */}
        <div className="mt-3">
          <QuestionContentWithImages
            content={ex.questionText}
            textClassName="text-[16px] leading-relaxed font-medium text-[#1D1D1F]"
            galleryClassName="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            figureClassName="bg-[#F7F7F7]"
            imageClassName="max-h-[240px] w-full cursor-zoom-in object-scale-down"
          />
        </div>

        {/* Options (MC) */}
        {Array.isArray(ex.options) && ex.options.length > 0 ? (
          <div className="mt-4 space-y-2">
            {ex.options.map((opt) => (
              <div
                key={`${opt.label}-${opt.text}`}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  opt.isCorrect
                    ? "border-[#DDEDEA] bg-[#DDEDEA] text-[#1D1D1F]"
                    : "border-[rgba(0,0,0,0.05)] bg-white text-[#1D1D1F]/80",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                    opt.isCorrect
                      ? "bg-white text-[#4D7C0F]"
                      : "bg-[#F7F7F7] text-[#1D1D1F]/50",
                  )}>
                    {opt.label}
                  </span>
                  <div className="flex-1">
                    <QuestionContentWithImages
                      content={opt.text}
                      textClassName="text-[14px] leading-6 text-inherit"
                      galleryClassName="mt-2 grid gap-2"
                      figureClassName="bg-white"
                      imageClassName="max-h-[160px] w-full object-scale-down"
                    />
                  </div>
                  {opt.isCorrect ? (
                    <span className="text-[10px] font-semibold text-[#4D7C0F] bg-white px-2 py-0.5 rounded-full">
                      Correct
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* 解析区 */}
        <div className="mt-4 rounded-lg bg-[#F7F7F7] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1D1D1F]/40 mb-2">
            Answer & Explanation
          </p>
          <p className="text-[14px] font-medium text-[#1D1D1F]">
            <MathText text={ex.correctAnswer} />
          </p>
          {ex.solutionSteps ? (
            <div className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[#1D1D1F]/60">
              <MathText text={ex.solutionSteps} />
            </div>
          ) : null}
        </div>

        {/* Source info */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[#1D1D1F]/50">
          <span>来源: {sourceKindLabel(detail.sourceKind)}</span>
          {detail.sourceFileName ? (
            <span>文件: {detail.sourceFileName}</span>
          ) : null}
          {detail.sourcePageLabel ? (
            <span>页码: {detail.sourcePageLabel}</span>
          ) : null}
          {detail.importBatchLabel ? (
            <span>批次: {detail.importBatchLabel}</span>
          ) : null}
          {typeof detail.sourceConfidence === "number" ? (
            <span>置信度: {detail.sourceConfidence}%</span>
          ) : null}
        </div>

        {detail.sourcePageImageUrl ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.05)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.05)] px-4 py-2.5 text-[11px] font-medium text-[#1D1D1F]/50">
              PDF 原页参考
            </div>
            <img
              src={detail.sourcePageImageUrl}
              alt={detail.sourcePageLabel ? `来源页截图 ${detail.sourcePageLabel}` : "来源页截图"}
              className="block max-h-[320px] w-full object-scale-down bg-[#F7F7F7]"
              loading="lazy"
            />
          </div>
        ) : null}

        {/* Similar items */}
        {detail.similarItems.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-[#1D1D1F]/50">
              相似题 ({detail.similarItems.length})
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {detail.similarItems.map((sim) => (
                <span
                  key={sim.id}
                  className="rounded-lg bg-[#F7F7F7] px-2.5 py-1 text-[11px] text-[#1D1D1F]/60"
                >
                  {sim.title.slice(0, 40)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* 底部操作栏 */}
      <div className="px-6 py-4 bg-white flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1.5 text-[13px] text-[#1D1D1F]/50 hover:text-[#1D1D1F]/70 transition-colors"
        >
          <Archive className="h-4 w-4" />
          Archive
        </button>
        <button
          type="button"
          className="flex items-center gap-2 bg-[#5E6AD2] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[#4E5BC2] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add to Exam
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Knowledge group (cluster + subskill grouping)
// ---------------------------------------------------------------------------

type GroupedData = {
  clusterKey: string;
  clusterLabel: string;
  totalCount: number;
  subgroups: Array<{
    subskillLabel: string | null;
    items: QuestionBankQuestionListItem[];
  }>;
};

function humanizeUnitKey(key: string): string {
  const unitMatch = key.match(/^unit_(\d+)_(.+)$/);
  if (unitMatch) {
    const rest = unitMatch[2]
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `Unit ${unitMatch[1]}: ${rest}`;
  }
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupByKnowledge(
  questions: QuestionBankQuestionListItem[],
): GroupedData[] {
  const clusters = new Map<
    string,
    {
      label: string;
      units: Map<string, { label: string; topics: Map<string, QuestionBankQuestionListItem[]> }>;
    }
  >();

  for (const q of questions) {
    const key = q.knowledgeCluster || "general";
    const label = q.knowledgeClusterLabel || "综合知识";

    if (!clusters.has(key)) {
      clusters.set(key, { label, units: new Map() });
    }
    const cluster = clusters.get(key)!;
    const unitKey = q.knowledgeSubskillKey || "__no_unit__";
    if (!cluster.units.has(unitKey)) {
      cluster.units.set(unitKey, {
        label: unitKey === "__no_unit__" ? "" : humanizeUnitKey(unitKey),
        topics: new Map(),
      });
    }
    const unit = cluster.units.get(unitKey)!;
    const topicKey = q.knowledgeSubskillLabel || "__none__";
    if (!unit.topics.has(topicKey)) {
      unit.topics.set(topicKey, []);
    }
    unit.topics.get(topicKey)!.push(q);
  }

  return Array.from(clusters.entries())
    .map(([clusterKey, data]) => {
      // Flatten units → subgroups with unit label prefix
      const subgroups: Array<{
        subskillLabel: string | null;
        items: QuestionBankQuestionListItem[];
      }> = [];

      const sortedUnits = Array.from(data.units.entries()).sort((a, b) => {
        if (a[0] === "__no_unit__") return 1;
        if (b[0] === "__no_unit__") return -1;
        return a[0].localeCompare(b[0]);
      });

      for (const [, unit] of sortedUnits) {
        const unitItems = Array.from(unit.topics.values()).flat();
        // Group all items under the unit label (ignore topic sub-grouping)
        const unitLabel = unit.label || null;
        subgroups.push({ subskillLabel: unitLabel, items: unitItems });
      }

      return {
        clusterKey,
        clusterLabel: data.label,
        totalCount: subgroups.reduce((sum, sg) => sum + sg.items.length, 0),
        subgroups: subgroups.sort((a, b) => b.items.length - a.items.length),
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount);
}

// ---------------------------------------------------------------------------
// Main QuestionList component
// ---------------------------------------------------------------------------

export default function QuestionList({
  questions,
  loading,
  total,
  sidebarFilter,
  requestedQuestionId = "",
  selectionMode,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSingle,
  searchQuery = "",
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const autoExpandedIdRef = useRef("");

  // 详情缓存（最多 100 条，5 分钟 TTL，FIFO 淘汰）
  const detailCacheRef = useRef<DetailCacheMap>(new Map());

  // Filter questions based on sidebar selection
  const filtered = useMemo(() => {
    if (sidebarFilter.type === "all") return questions;
    if (sidebarFilter.type === "cluster") {
      return questions.filter(
        (q) => (q.knowledgeCluster || "general") === sidebarFilter.clusterKey,
      );
    }
    if (sidebarFilter.type === "unit") {
      return questions.filter(
        (q) =>
          (q.knowledgeCluster || "general") === sidebarFilter.clusterKey &&
          q.knowledgeSubskillKey === sidebarFilter.unitKey,
      );
    }
    // topic
    return questions.filter(
      (q) =>
        (q.knowledgeCluster || "general") === sidebarFilter.clusterKey &&
        (sidebarFilter.unitKey
          ? q.knowledgeSubskillKey === sidebarFilter.unitKey
          : true) &&
        q.knowledgeSubskillLabel === sidebarFilter.topicLabel,
    );
  }, [questions, sidebarFilter]);

  const visibleQuestionIds = useMemo(
    () => filtered.map((question) => question.id),
    [filtered],
  );

  const allVisibleSelected =
    visibleQuestionIds.length > 0 &&
    visibleQuestionIds.every((id) => selectedIds.has(id));

  // Group by knowledge
  const groups = useMemo(() => groupByKnowledge(filtered), [filtered]);

  // 扁平化 groups → 一维数组（包含分组头行和题目行）
  const flatItems = useMemo(() => {
    const result: FlatItem[] = [];
    for (const group of groups) {
      const isCollapsed = collapsedGroups.has(group.clusterKey);
      result.push({
        type: "group-header",
        label: group.clusterLabel,
        count: group.totalCount,
        key: `g-${group.clusterKey}`,
        clusterKey: group.clusterKey,
      });
      if (isCollapsed) continue;
      for (const sub of group.subgroups) {
        if (sub.subskillLabel) {
          result.push({
            type: "subgroup-header",
            label: sub.subskillLabel,
            count: sub.items.length,
            key: `s-${group.clusterKey}-${sub.subskillLabel}`,
          });
        }
        for (const item of sub.items) {
          result.push({ type: "question", item, key: item.id });
        }
      }
    }
    return result;
  }, [groups, collapsedGroups]);

  // 修复 2: expandedId 竞态 — 搜索/筛选后如果展开的题目不在列表中，自动关闭
  useEffect(() => {
    if (!expandedId) return;
    const stillExists = flatItems.some(
      (item) => item.type === "question" && item.item.id === expandedId,
    );
    if (!stillExists) {
      setExpandedId(null);
    }
  }, [flatItems, expandedId]);

  // 修复 4: focusedIndex 越界校正
  useEffect(() => {
    if (focusedIndex >= flatItems.length) {
      setFocusedIndex(flatItems.length > 0 ? flatItems.length - 1 : -1);
    }
  }, [flatItems, focusedIndex]);

  // 修复 4: 键盘导航
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const questionItems = flatItems
        .map((fi, idx) => ({ fi, idx }))
        .filter((x) => x.fi.type === "question");

      // 当前 focusedIndex 在 questionItems 中的序号
      const currentQIdx = questionItems.findIndex(
        (x) => x.idx === focusedIndex,
      );

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextQIdx = Math.min(currentQIdx + 1, questionItems.length - 1);
          const nextItem = questionItems[Math.max(nextQIdx, 0)];
          if (nextItem) setFocusedIndex(nextItem.idx);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevQIdx = Math.max(currentQIdx - 1, 0);
          const prevItem = questionItems[prevQIdx];
          if (prevItem) setFocusedIndex(prevItem.idx);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (currentQIdx >= 0) {
            const fi = questionItems[currentQIdx].fi;
            if (fi.type === "question") {
              setExpandedId((prev) =>
                prev === fi.item.id ? null : fi.item.id,
              );
            }
          }
          break;
        }
        case "Escape":
          setExpandedId(null);
          break;
        case "Home": {
          e.preventDefault();
          const first = questionItems[0];
          if (first) setFocusedIndex(first.idx);
          break;
        }
        case "End": {
          e.preventDefault();
          const last = questionItems[questionItems.length - 1];
          if (last) setFocusedIndex(last.idx);
          break;
        }
      }
    },
    [flatItems, focusedIndex],
  );

  // 虚拟滚动
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const fi = flatItems[index];
      if (fi.type === "group-header") return 48;
      if (fi.type === "subgroup-header") return 36;
      // 题目行：展开时估算更大
      if (fi.type === "question" && expandedId === fi.item.id) return 600;
      return 140; // 卡片高度比紧凑行更高
    },
    overscan: 5,
    gap: 12, // 卡片间距
  });

  useEffect(() => {
    if (!requestedQuestionId) {
      autoExpandedIdRef.current = "";
      return;
    }
    if (autoExpandedIdRef.current === requestedQuestionId) return;

    const targetIndex = flatItems.findIndex(
      (item) => item.type === "question" && item.item.id === requestedQuestionId,
    );
    if (targetIndex < 0) return;

    autoExpandedIdRef.current = requestedQuestionId;
    setExpandedId(requestedQuestionId);
    setFocusedIndex(targetIndex);
    virtualizer.scrollToIndex(targetIndex, { align: "center" });
  }, [flatItems, requestedQuestionId, virtualizer]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
    },
    [],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, questionId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, questionId });
    },
    [],
  );

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          label: "复制题目 ID",
          icon: <Copy className="h-3.5 w-3.5" />,
          onClick: () => {
            navigator.clipboard.writeText(contextMenu.questionId).catch(() => {});
          },
        },
        {
          label: "删除题目",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          onClick: () => onDeleteSingle(contextMenu.questionId),
        },
      ]
    : [];

  // 计算当前筛选条件的标签名称
  const filterLabel = useMemo(() => {
    if (sidebarFilter.type === "all") return "All Questions";
    if (sidebarFilter.type === "topic" && sidebarFilter.topicLabel) return sidebarFilter.topicLabel;
    if (sidebarFilter.type === "unit" && sidebarFilter.unitKey) {
      return humanizeUnitKey(sidebarFilter.unitKey);
    }
    if (sidebarFilter.type === "cluster" && sidebarFilter.clusterKey) {
      return sidebarFilter.clusterKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "All Questions";
  }, [sidebarFilter]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] flex-1 items-center justify-center text-[13px] text-[#1D1D1F]/60">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在读取题库...
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 text-center text-[13px] text-[#1D1D1F]/60">
        <FolderOpen className="h-5 w-5 text-[#1D1D1F]/40" />
        <p>当前没有符合条件的题目</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Summary bar with selection controls */}
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.05)] bg-white px-6 py-3">
        <span className="text-[13px] text-[#1D1D1F]/60">
          {sidebarFilter.type === "all"
            ? `${total} questions`
            : `${filtered.length} of ${total} questions`}
        </span>
        {selectionMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onToggleSelectAll(visibleQuestionIds, allVisibleSelected)
              }
              disabled={visibleQuestionIds.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,0,0,0.05)] px-2.5 py-1 text-[11px] text-[#1D1D1F]/60 hover:bg-[#F7F7F7] disabled:opacity-50"
            >
              <CheckSquare2 className="h-3 w-3" />
              {allVisibleSelected ? "取消全选" : "全选"}
            </button>
            <span className="text-[12px] font-medium text-[#5E6AD2]">
              已选 {selectedIds.size} 道
            </span>
          </div>
        ) : null}
      </div>

      {/* Virtualized question list */}
      <div
        ref={parentRef}
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        role="listbox"
        aria-label="题目列表"
        className="min-h-0 flex-1 overflow-y-auto focus:outline-hidden bg-[#FAFAFA] px-6 py-4"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow, visibleIndex) => {
            const fi = flatItems[virtualRow.index];

            const staggerDelay = `${Math.min(visibleIndex * 25, 250)}ms`;

            if (fi.type === "group-header") {
              const isCollapsed = collapsedGroups.has(fi.clusterKey);
              return (
                <div
                  key={fi.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="animate-list-item-enter"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    animationDelay: staggerDelay,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(fi.clusterKey)}
                    className="sticky top-0 z-10 flex w-full items-center gap-2.5 rounded-lg bg-[#EBEBEB]/95 px-4 py-2.5 text-left backdrop-blur-xs mb-2"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-[#1D1D1F]/40" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[#1D1D1F]/40" />
                    )}
                    <span className="text-[13px] font-semibold text-[#1D1D1F]">
                      {fi.label}
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded text-[10px] text-[#1D1D1F]/40 font-bold">
                      {fi.count}
                    </span>
                  </button>
                </div>
              );
            }

            if (fi.type === "subgroup-header") {
              return (
                <div
                  key={fi.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="animate-list-item-enter"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    animationDelay: staggerDelay,
                  }}
                >
                  <div className="flex items-center gap-2 px-4 py-2">
                    <Tag className="h-3 w-3 text-[#1D1D1F]/40" />
                    <span className="text-[12px] font-medium text-[#1D1D1F]/50">
                      {fi.label}
                    </span>
                    <span className="text-[10px] text-[#1D1D1F]/30">
                      ({fi.count})
                    </span>
                  </div>
                </div>
              );
            }

            // fi.type === "question"
            return (
              <div
                key={fi.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="animate-list-item-enter"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  animationDelay: staggerDelay,
                }}
              >
                {expandedId === fi.item.id ? (
                  <ExpandedDetail
                    questionId={fi.item.id}
                    item={fi.item}
                    detailCacheRef={detailCacheRef}
                    onCollapse={() => setExpandedId(null)}
                    onDelete={onDeleteSingle}
                  />
                ) : (
                  <QuestionRow
                    item={fi.item}
                    isExpanded={false}
                    isSelected={selectedIds.has(fi.item.id)}
                    isFocused={focusedIndex === virtualRow.index}
                    selectionMode={selectionMode}
                    searchQuery={searchQuery}
                    onToggle={() => onToggleSelect(fi.item.id)}
                    onClick={() => handleRowClick(fi.item.id)}
                    onContextMenu={(e) =>
                      handleContextMenu(e, fi.item.id)
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 分页栏 */}
      <div className="flex items-center justify-between h-10 border-t border-[rgba(0,0,0,0.05)] bg-[#F7F7F7]/30 px-8">
        <span className="text-[12px] text-[#1D1D1F]/40">
          Showing 1-{Math.min(filtered.length, total)} of {total} Questions
          {sidebarFilter.type !== "all" ? ` in ${filterLabel}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] text-[#1D1D1F]/30 disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <button
            type="button"
            disabled
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] text-[#1D1D1F]/30 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Context menu portal */}
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
