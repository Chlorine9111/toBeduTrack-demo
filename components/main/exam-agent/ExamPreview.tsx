"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { FileText, Edit3, Download } from "lucide-react";
import ExamStatsBar from "./ExamStatsBar";
import ExamQuestionCard from "./ExamQuestionCard";
import type { ExamTask } from "@/lib/exam-agent/types";

// ─── Component ─────────────────────────────────────────

interface ExamPreviewProps {
  task: ExamTask;
  onShowPipeline: () => void;
}

export default function ExamPreview({ task, onShowPipeline }: ExamPreviewProps) {
  const [activeTab, setActiveTab] = useState<"questions" | "answers">("questions");
  const [exporting, setExporting] = useState(false);

  const result = task.result;
  if (!result) return null;

  const { examName, sections, stats } = result;

  async function handleExportPdf() {
    setExporting(true);
    try {
      const response = await fetch(`/api/exam-agent/tasks/${task.id}/export`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${examName}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // PDF export error is non-critical; silently fail to avoid unhandled rejection
      void err;
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{examName}</h2>
          <p className="mt-0.5 text-xs text-default-500">
            {stats.totalQuestions} 题 · 平均质量 {Math.round(stats.averageQuality * 100)}% ·{" "}
            {Math.round(stats.totalTimeMs / 1000)}s 生成
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="ghost"
            onPress={onShowPipeline}
            className="flex items-center gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            Pipeline 日志
          </Button>
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              /* Navigate to editor — handled by parent */
            }}
            className="flex items-center gap-1.5"
          >
            <Edit3 className="h-3.5 w-3.5" />
            去编辑器微调
          </Button>
          <Button
            size="sm"
            onPress={handleExportPdf}
            isDisabled={exporting}
            className="flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "导出中…" : "导出 PDF"}
          </Button>
        </div>
      </div>

      {/* Stats bar + tab switcher */}
      <ExamStatsBar
        stats={stats}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Body: sections with questions */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-8">
          {sections.map((section, sectionIdx) => (
            <section key={sectionIdx}>
              {/* Section header */}
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  <p className="mt-0.5 text-xs text-default-500">
                    {section.questions.length} 题 · 每题 {section.pointsPerQuestion} 分 · 共{" "}
                    {section.totalPoints} 分
                  </p>
                </div>
                <span className="rounded-full bg-default-100 px-2.5 py-0.5 text-[10px] font-medium text-default-600">
                  {section.questionType}
                </span>
              </div>

              <div className="mb-3 h-px bg-default-200" />

              {/* Question cards */}
              <div className="space-y-3">
                {section.questions.map((question) => (
                  <ExamQuestionCard
                    key={question.index}
                    question={question}
                    showAnswer={activeTab === "answers"}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
