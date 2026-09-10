"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import OutlineNav from "@/components/main/question-bank/split-editor/OutlineNav";
import type {
  QuestionBankOutlineSection,
  QuestionBankSplitDocument,
} from "@/components/main/question-bank/split-editor/types";

export default function DocumentSidebar({
  documents,
  activeDocumentId,
  activeQuestionId,
  outlineSections,
  onSelectDocument,
  onSelectQuestion,
  onUploadClick,
  onRetryDocument,
  onRemoveDocument,
}: {
  documents: QuestionBankSplitDocument[];
  activeDocumentId: string | null;
  activeQuestionId: string | null;
  outlineSections: QuestionBankOutlineSection[];
  onSelectDocument: (documentId: string) => void;
  onSelectQuestion: (questionId: string) => void;
  onUploadClick: () => void;
  onRetryDocument: (documentId: string) => void;
  onRemoveDocument: (documentId: string) => void;
}) {
  const [tab, setTab] = useState<"documents" | "outline">("outline");

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[rgba(55,53,47,0.08)] bg-[#fbfbf8]">
      <div className="border-b border-[rgba(55,53,47,0.08)] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-[#f5f5f1] p-1">
            <button
              type="button"
              onClick={() => setTab("documents")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === "documents" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
              )}
            >
              文档({documents.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("outline")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === "outline" ? "bg-white text-[#37352F]" : "text-[#37352F]/55",
              )}
            >
              大纲
            </button>
          </div>
          <button
            type="button"
            onClick={onUploadClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(55,53,47,0.1)] text-[#37352F]/65 transition hover:bg-[#faf8f3]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tab === "documents" ? (
          <div className="space-y-1">
            {documents.map((document) => (
              <div
                key={document.id}
                className={cn(
                  "rounded-xl border px-3 py-2 transition-colors",
                  document.id === activeDocumentId
                    ? "border-[#37352F]/16 bg-white shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
                    : "border-transparent bg-transparent hover:bg-white",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectDocument(document.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#37352F]">
                        {document.label || document.fileName}
                      </p>
                      <p className="mt-1 text-xs text-[#37352F]/48">
                        {document.questionCount > 0 ? `${document.questionCount} 题` : document.progressLabel}
                      </p>
                    </div>
                    {document.status === "completed" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : document.status === "failed" ? (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    ) : (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-500" />
                    )}
                  </div>
                </button>

                <div className="mt-2 flex items-center gap-2">
                  {document.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => onRetryDocument(document.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(55,53,47,0.1)] px-2.5 py-1 text-xs text-[#37352F]/70 transition hover:bg-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      重试
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveDocument(document.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(55,53,47,0.1)] px-2.5 py-1 text-xs text-rose-600/70 transition hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <OutlineNav
            sections={outlineSections}
            activeQuestionId={activeQuestionId}
            onSelectQuestion={onSelectQuestion}
          />
        )}
      </div>

      <div className="border-t border-[rgba(55,53,47,0.08)] px-3 py-3 text-xs text-[#37352F]/45">
        {documents.find((document) => document.id === activeDocumentId)?.progressLabel ?? "等待上传"}
      </div>
    </aside>
  );
}
