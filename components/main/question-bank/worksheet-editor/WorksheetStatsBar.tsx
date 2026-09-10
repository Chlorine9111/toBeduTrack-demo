"use client";

import { FileDown, Loader2, Save } from "lucide-react";
import { getQuestionTypeLabel } from "@/components/main/question-bank/worksheet-editor/utils";
import type { WorksheetEditorStats } from "@/components/main/question-bank/worksheet-editor/types";

export default function WorksheetStatsBar({
  stats,
  saving,
  exportingPdf,
  exportingWord,
  onSave,
  onExportPdf,
  onExportWord,
}: {
  stats: WorksheetEditorStats;
  saving: boolean;
  exportingPdf: boolean;
  exportingWord: boolean;
  onSave: () => void;
  onExportPdf: () => void;
  onExportWord: () => void;
}) {
  const typeSummary = Object.entries(stats.countsByType)
    .map(([type, count]) => `${getQuestionTypeLabel(type as any)} ${count} 题`)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[#37352F]/55">
        {stats.questionCount} 题 / 总分 {stats.totalPoints} 分
        {typeSummary ? ` / ${typeSummary}` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(55,53,47,0.1)] bg-white px-4 py-2.5 text-sm text-[#37352F]/70 transition hover:bg-[#fbf7ef] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存草稿
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          disabled={exportingPdf}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#37352F] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#27241f] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {exportingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          导出 PDF
        </button>
        <button
          type="button"
          onClick={onExportWord}
          disabled={exportingWord}
          className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(55,53,47,0.1)] bg-white px-4 py-2.5 text-sm text-[#37352F]/70 transition hover:bg-[#fbf7ef] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exportingWord ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          导出 Word
        </button>
      </div>
    </div>
  );
}
