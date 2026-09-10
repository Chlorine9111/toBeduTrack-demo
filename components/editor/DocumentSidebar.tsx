"use client";

import { useState, useCallback } from "react";
import {
  Search,
  TableProperties,
  BookOpen,
  FileQuestion,
  Plus,
  ChevronRight,
} from "lucide-react";
import { Button, Spinner } from "@heroui/react";
import { cn } from "@/lib/utils";

export type SidebarDocItem = {
  id: string;
  title: string;
  kind?: string;
  updatedAt?: string;
};

type DocumentSidebarProps = {
  currentDocId?: string;
  recentDocs?: SidebarDocItem[];
  typeCounts?: Record<string, number>;
  typeDocuments?: Record<string, SidebarDocItem[]>;
  loadingType?: string | null;
  onDocSelect?: (id: string) => void;
  onNewDoc?: () => void;
  onExpandType?: (kind: string) => void;
};

const TYPE_ITEMS = [
  { kind: "rubric", label: "评分标准", icon: TableProperties },
  { kind: "lesson-plan", label: "教案", icon: BookOpen },
  { kind: "exam", label: "试卷", icon: FileQuestion },
] as const;

export default function DocumentSidebar({
  currentDocId,
  recentDocs = [],
  typeCounts = {},
  typeDocuments = {},
  loadingType = null,
  onDocSelect,
  onNewDoc,
  onExpandType,
}: DocumentSidebarProps) {
  const [query, setQuery] = useState("");
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const filteredDocs = recentDocs.filter((doc) =>
    doc.title.toLowerCase().includes(query.toLowerCase()),
  );

  const handleDocClick = useCallback(
    (id: string) => {
      onDocSelect?.(id);
    },
    [onDocSelect],
  );

  const handleTypeToggle = useCallback(
    (kind: string) => {
      const nextType = expandedType === kind ? null : kind;
      setExpandedType(nextType);
      if (
        nextType &&
        !Object.prototype.hasOwnProperty.call(typeDocuments, nextType)
      ) {
        onExpandType?.(nextType);
      }
    },
    [expandedType, onExpandType, typeDocuments],
  );

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-[#E9E9E7] bg-default-100">
      {/* 搜索框 */}
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-default-200 bg-white px-2.5 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-default-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="快速查找..."
            style={{}}
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-hidden placeholder:text-default-300"
          />
        </div>
      </div>

      {/* 可滚动主体 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* Recent Edits */}
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-default-400">
          最近编辑
        </h4>
        <div className="mb-4 space-y-0.5">
          {filteredDocs.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-default-300">
              {query ? "没有匹配结果" : "还没有最近文档"}
            </p>
          ) : (
            filteredDocs.map((doc) => {
              const isActive = doc.id === currentDocId;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => handleDocClick(doc.id)}
                  className={cn(
                    "flex w-full items-center rounded px-2 py-1.5 text-left text-[13px] transition-colors",
                    isActive
                      ? "border-l-2 border-foreground bg-default-200 pl-1.5 font-medium text-foreground"
                      : "text-default-600 hover:bg-default-100",
                  )}
                >
                  <span className="truncate">{doc.title || "未命名文档"}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Browse by Type */}
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-default-400">
          按类型查看
        </h4>
        <div className="space-y-0.5">
          {TYPE_ITEMS.map((item) => {
            const Icon = item.icon;
            const count = typeCounts[item.kind] ?? 0;
            const isExpanded = expandedType === item.kind;
            const docs = typeDocuments[item.kind] ?? [];
            const isLoading = loadingType === item.kind;
            return (
              <div key={item.kind}>
                <button
                  type="button"
                  onClick={() => handleTypeToggle(item.kind)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors",
                    isExpanded
                      ? "bg-default-200 font-medium text-foreground"
                      : "text-default-600 hover:bg-default-100",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-default-400" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="rounded bg-default-100 px-1.5 py-0.5 text-[10px] font-medium text-default-400">
                    {count}
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-default-300 transition-transform",
                      isExpanded ? "rotate-90" : "rotate-0",
                    )}
                  />
                </button>

                {isExpanded ? (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-divider pl-3">
                    {isLoading ? (
                      <div className="flex items-center gap-2 px-2 py-2 text-xs text-default-400">
                        <Spinner size="sm" />
                        正在加载
                      </div>
                    ) : docs.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-default-400">
                        暂无文档
                      </p>
                    ) : (
                      docs.map((doc) => {
                        const isActive = doc.id === currentDocId;
                        return (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => handleDocClick(doc.id)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
                              isActive
                                ? "bg-default-200 font-medium text-foreground"
                                : "text-default-500 hover:bg-default-100",
                            )}
                          >
                            <span className="truncate">{doc.title || "未命名文档"}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部新建按钮 */}
      <div className="shrink-0 border-t border-[#E9E9E7] p-3">
        <Button
          className="w-full"
          onPress={onNewDoc}
        >
          <Plus className="h-4 w-4" />
          新建文档
        </Button>
      </div>
    </aside>
  );
}
