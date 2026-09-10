"use client";

import { PencilLine, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { WorksheetEditorSection } from "@/components/main/question-bank/worksheet-editor/types";

export default function SectionHeader({
  section,
  questionCount,
  totalPoints,
  onRename,
  onAddAfter,
  onDelete,
}: {
  section: WorksheetEditorSection;
  questionCount: number;
  totalPoints: number;
  onRename: (title: string) => void;
  onAddAfter: () => void;
  onDelete: () => void;
}) {
  const { isZh } = useAppI18n();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(section.title);

  useEffect(() => {
    if (!editing) {
      setDraftTitle(section.title);
    }
  }, [editing, section.title]);

  function beginRename() {
    setDraftTitle(section.title);
    setEditing(true);
  }

  function commitRename() {
    const nextTitle = draftTitle.trim();
    if (nextTitle) {
      onRename(nextTitle);
    } else {
      setDraftTitle(section.title);
    }
    setEditing(false);
  }

  return (
    <div className="group border-b border-[rgba(55,53,47,0.08)] pb-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#37352F]/30">
            {isZh ? "分组" : "Section"}
          </p>
          {editing ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === "Escape") {
                  setDraftTitle(section.title);
                  setEditing(false);
                }
              }}
              className="w-full rounded-lg border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-base font-semibold text-[#37352F] outline-none"
            />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onDoubleClick={beginRename}
                className="text-left transition hover:text-[#111827]"
              >
                <h3 className="text-[17px] font-semibold text-[#37352F]">{section.title}</h3>
              </button>
              <button
                type="button"
                onClick={beginRename}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#8c7e68]/75 opacity-70 transition hover:bg-[#f5f4f2] hover:text-[#37352F] hover:opacity-100 group-hover:opacity-100"
                aria-label={isZh ? "重命名分组" : "Rename section"}
              >
                <PencilLine className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="mt-1 text-[13px] text-[#37352F]/52">
            {isZh
              ? `${questionCount} 题 · 共 ${totalPoints} 分`
              : `${questionCount} questions · ${totalPoints} pts`}
          </p>
        </div>

        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={onAddAfter}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3]"
          >
            <Plus className="h-4 w-4" />
            {isZh ? "新增分组" : "Add section"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] transition hover:bg-rose-50",
              questionCount > 0 ? "text-rose-600" : "text-[#37352F]/70",
            )}
          >
            <Trash2 className="h-4 w-4" />
            {isZh ? "删除分组" : "Delete section"}
          </button>
        </div>
      </div>
    </div>
  );
}
