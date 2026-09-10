"use client";

import {
  CheckSquare2,
  FileText,
  Filter,
  FolderOpen,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionBankMaterialItem } from "./helpers";
import {
  buildMaterialSelectionKey,
  materialQuestionBankLabel,
  materialQuestionBankTone,
  sourceKindLabel,
} from "./helpers";

type Props = {
  materials: QuestionBankMaterialItem[];
  loading: boolean;
  selectionMode: boolean;
  selectedKeys: Set<string>;
  isDeletingSelection: boolean;
  onToggleSelect: (key: string) => void;
  onToggleSelectAll: () => void;
  onBulkDelete: () => void;
  allVisibleSelected: boolean;
};

export default function MaterialsGrid({
  materials,
  loading,
  selectionMode,
  selectedKeys,
  isDeletingSelection,
  onToggleSelect,
  onToggleSelectAll,
  onBulkDelete,
  allVisibleSelected,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 text-[13px] text-slate-600">
          <FileText className="h-4 w-4 text-slate-400" />
          <span>共 {materials.length} 份资料</span>
        </div>
        {selectionMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleSelectAll}
              disabled={materials.length === 0 || isDeletingSelection}
              className="rounded border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {allVisibleSelected ? "取消全选" : "全选"}
            </button>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={selectedKeys.size === 0 || isDeletingSelection}
              className="flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              {isDeletingSelection ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              删除 ({selectedKeys.size})
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Filter className="h-3.5 w-3.5" />
            资料删除会同步清理关联题目
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center text-[13px] text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在读取资料...
          </div>
        ) : materials.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center text-[13px] text-slate-500">
            <FolderOpen className="h-5 w-5 text-slate-400" />
            <p>当前还没有可整理的题目资料</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {materials.map((item) => {
              const key = buildMaterialSelectionKey(item);
              const isSelected = selectedKeys.has(key);

              return (
                <article
                  key={key}
                  onClick={
                    selectionMode ? () => onToggleSelect(key) : undefined
                  }
                  onKeyDown={
                    selectionMode
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleSelect(key);
                          }
                        }
                      : undefined
                  }
                  role={selectionMode ? "button" : undefined}
                  tabIndex={selectionMode ? 0 : undefined}
                  className={cn(
                    "rounded-xl border bg-white p-4 transition-all",
                    selectionMode
                      ? isSelected
                        ? "cursor-pointer border-blue-400 bg-blue-50 shadow-xs"
                        : "cursor-pointer border-slate-200 hover:border-slate-300"
                      : "border-slate-200",
                  )}
                >
                  {/* Type & status header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {selectionMode ? (
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                              isSelected
                                ? "border-blue-500 bg-blue-500 font-bold text-white"
                                : "border-slate-300 bg-white",
                            )}
                          >
                            {isSelected ? "✓" : ""}
                          </span>
                        ) : null}
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {sourceKindLabel(item.materialType)}
                        </p>
                      </div>
                      <h3 className="mt-1.5 line-clamp-2 text-[14px] font-semibold text-slate-900">
                        {item.title}
                      </h3>
                    </div>
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      {item.status}
                    </span>
                  </div>

                  {/* Summary */}
                  {item.summary ? (
                    <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-600">
                      {item.summary}
                    </p>
                  ) : null}

                  {/* Question bank status */}
                  {item.materialType === "knowledge_document" ||
                  item.materialType === "agent_generated_batch" ? (
                    <div
                      className={cn(
                        "mt-3 rounded-lg border px-2.5 py-2 text-[12px]",
                        materialQuestionBankTone(item.questionBankStatus),
                      )}
                    >
                      <p className="font-medium">
                        {materialQuestionBankLabel(item.questionBankStatus)}
                      </p>
                      {item.importBatchLabel ? (
                        <p className="mt-0.5 text-[11px] opacity-80">
                          批次: {item.importBatchLabel}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Stats */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-[10px] text-slate-400">识别题数</p>
                      <p className="mt-0.5 text-[15px] font-semibold text-slate-800">
                        {item.detectedQuestionCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-[10px] text-slate-400">已入题库</p>
                      <p className="mt-0.5 text-[15px] font-semibold text-slate-800">
                        {item.savedQuestionCount}
                      </p>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                    <p>学科: {item.subject || "未标注"}</p>
                    <p>单元: {item.unit || "未标注"}</p>
                  </div>

                  {/* Tags */}
                  {item.tags.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {item.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
