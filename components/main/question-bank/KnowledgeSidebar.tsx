"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Library,
  Layers,
  Plus,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionBankQuestionListItem, SidebarFilter } from "./helpers";
import { buildKnowledgeTree } from "./helpers";

type Props = {
  questions: QuestionBankQuestionListItem[];
  activeFilter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
};

// 学科文件夹图标颜色映射
const SUBJECT_COLORS = [
  "#976D57", // 棕色
  "#AD7F24", // 金色
  "#5E6AD2", // 蓝色
  "#6B8E23", // 橄榄绿
  "#9B59B6", // 紫色
  "#E67E22", // 橙色
  "#1ABC9C", // 青绿
  "#C0392B", // 红色
];

function getSubjectColor(index: number): string {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

export default function KnowledgeSidebar({
  questions,
  activeFilter,
  onFilterChange,
}: Props) {
  const tree = useMemo(() => buildKnowledgeTree(questions), [questions]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-[rgba(0,0,0,0.04)] bg-[#F7F7F7]">
      {/* 头部区域 */}
      <div className="px-4 pt-5 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1D1D1F]/40">
          KNOWLEDGE BASE
        </p>
        <div className="mt-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#1D1D1F]">
            Curriculum Tree
          </h2>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5E6AD2] hover:bg-white/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {/* All questions */}
        <button
          type="button"
          onClick={() => onFilterChange({ type: "all" })}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
            activeFilter.type === "all"
              ? "bg-white/80 text-[#5E6AD2] font-medium"
              : "text-[#1D1D1F]/60 hover:bg-white",
          )}
        >
          <Library className="h-4 w-4 shrink-0 text-[#1D1D1F]/40" />
          <span className="flex-1 truncate">All Questions</span>
          <span className="bg-white px-1.5 py-0.5 rounded text-[10px] text-[#1D1D1F]/40 font-bold">
            {questions.length}
          </span>
        </button>

        {/* Level 1: Subjects */}
        {tree.map((subject, subjectIndex) => {
          const subjectExpanded = expanded.has(subject.clusterKey);
          const isSubjectActive =
            activeFilter.type === "cluster" &&
            activeFilter.clusterKey === subject.clusterKey;
          const isChildActive =
            (activeFilter.type === "unit" || activeFilter.type === "topic") &&
            activeFilter.clusterKey === subject.clusterKey;
          const folderColor = getSubjectColor(subjectIndex);

          return (
            <div key={subject.clusterKey} className="mt-0.5">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggle(subject.clusterKey)}
                  className="flex h-8 w-7 shrink-0 items-center justify-center text-[#1D1D1F]/40 hover:text-[#1D1D1F]/60"
                >
                  {subject.units.length > 0 || subject.subskills.length > 0 ? (
                    subjectExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )
                  ) : (
                    <span className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isSubjectActive) {
                      onFilterChange({ type: "all" });
                    } else {
                      onFilterChange({
                        type: "cluster",
                        clusterKey: subject.clusterKey,
                      });
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.add(subject.clusterKey);
                        return next;
                      });
                    }
                  }}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
                    isSubjectActive || isChildActive
                      ? "bg-white/80 text-[#5E6AD2] font-medium"
                      : "text-[#1D1D1F]/60 hover:bg-white",
                  )}
                >
                  <FolderOpen
                    className="h-4 w-4 shrink-0"
                    style={{ color: folderColor }}
                  />
                  <span className="flex-1 truncate font-medium">{subject.label}</span>
                  <span className="bg-white px-1.5 py-0.5 rounded text-[10px] text-[#1D1D1F]/40 font-bold">
                    {subject.count}
                  </span>
                </button>
              </div>

              {/* Level 2: Units */}
              {subjectExpanded &&
                subject.units.map((unit) => {
                  const unitExpandKey = `${subject.clusterKey}:${unit.key}`;
                  const unitExpanded = expanded.has(unitExpandKey);
                  const isUnitActive =
                    activeFilter.type === "unit" &&
                    activeFilter.clusterKey === subject.clusterKey &&
                    activeFilter.unitKey === unit.key;
                  const isTopicChildActive =
                    activeFilter.type === "topic" &&
                    activeFilter.clusterKey === subject.clusterKey &&
                    activeFilter.unitKey === unit.key;

                  return (
                    <div key={unit.key} className="pl-6 border-l border-[rgba(0,0,0,0.04)] ml-4">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => toggle(unitExpandKey)}
                          className="flex h-7 w-6 shrink-0 items-center justify-center text-[#1D1D1F]/40 hover:text-[#1D1D1F]/60"
                        >
                          {unit.topics.length > 0 ? (
                            unitExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )
                          ) : (
                            <span className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isUnitActive) {
                              onFilterChange({
                                type: "cluster",
                                clusterKey: subject.clusterKey,
                              });
                            } else {
                              onFilterChange({
                                type: "unit",
                                clusterKey: subject.clusterKey,
                                unitKey: unit.key,
                              });
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                next.add(unitExpandKey);
                                return next;
                              });
                            }
                          }}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-[12px] transition-colors",
                            isUnitActive || isTopicChildActive
                              ? "bg-white/80 text-[#5E6AD2] font-medium"
                              : "text-[#1D1D1F]/60 hover:bg-white",
                          )}
                        >
                          <Layers className="h-3.5 w-3.5 shrink-0 text-[#1D1D1F]/40" />
                          <span className="flex-1 truncate">{unit.label}</span>
                          <span className="bg-white px-1.5 py-0.5 rounded text-[10px] text-[#1D1D1F]/40 font-bold">
                            {unit.count}
                          </span>
                        </button>
                      </div>

                      {/* Level 3: Topics */}
                      {unitExpanded &&
                        unit.topics.map((topic) => {
                          const isTopicActive =
                            activeFilter.type === "topic" &&
                            activeFilter.clusterKey === subject.clusterKey &&
                            activeFilter.unitKey === unit.key &&
                            activeFilter.topicLabel === topic.label;
                          return (
                            <button
                              key={topic.label}
                              type="button"
                              onClick={() => {
                                if (isTopicActive) {
                                  onFilterChange({
                                    type: "unit",
                                    clusterKey: subject.clusterKey,
                                    unitKey: unit.key,
                                  });
                                } else {
                                  onFilterChange({
                                    type: "topic",
                                    clusterKey: subject.clusterKey,
                                    unitKey: unit.key,
                                    topicLabel: topic.label,
                                  });
                                }
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-lg py-1 pl-8 pr-3 text-left text-[11px] transition-colors",
                                isTopicActive
                                  ? "bg-white/80 text-[#5E6AD2] font-medium"
                                  : "text-[#1D1D1F]/60 hover:bg-white",
                              )}
                            >
                              <Tag className="h-2.5 w-2.5 shrink-0 text-[#1D1D1F]/40" />
                              <span className="flex-1 truncate">
                                {topic.label}
                              </span>
                              <span className="bg-white px-1.5 py-0.5 rounded text-[10px] text-[#1D1D1F]/40 font-bold">
                                {topic.count}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}

              {/* Orphan subskills (no unit key) */}
              {subjectExpanded &&
                subject.subskills.map((sub) => (
                  <button
                    key={sub.label}
                    type="button"
                    onClick={() =>
                      onFilterChange({
                        type: "topic",
                        clusterKey: subject.clusterKey,
                        topicLabel: sub.label,
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg py-1 pl-10 pr-3 text-left text-[11px] transition-colors ml-4 border-l border-[rgba(0,0,0,0.04)]",
                      activeFilter.type === "topic" &&
                        activeFilter.clusterKey === subject.clusterKey &&
                        !activeFilter.unitKey &&
                        activeFilter.topicLabel === sub.label
                        ? "bg-white/80 text-[#5E6AD2] font-medium"
                        : "text-[#1D1D1F]/60 hover:bg-white",
                    )}
                  >
                    <Tag className="h-2.5 w-2.5 shrink-0 text-[#1D1D1F]/40" />
                    <span className="flex-1 truncate">{sub.label}</span>
                    <span className="bg-white px-1.5 py-0.5 rounded text-[10px] text-[#1D1D1F]/40 font-bold">
                      {sub.count}
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
      </nav>

      {/* 底部固定按钮 */}
      <div className="border-t border-[rgba(0,0,0,0.04)] p-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D1D1F] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1D1D1F]/90"
        >
          <Plus className="h-4 w-4" />
          New Knowledge Point
        </button>
      </div>
    </aside>
  );
}
