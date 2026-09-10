"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Wand2,
  X,
} from "lucide-react";
import MathText from "@/components/main/chatflow/MathText";
import QuestionTiptapEditor from "@/components/main/question-bank/shared/QuestionTiptapEditor";
import QuestionContentWithImages, {
  stripMarkdownImages,
} from "@/components/shared/QuestionContentWithImages";
import type { WorksheetQuestionBankItem } from "@/components/main/question-bank/worksheet-editor/types";
import {
  defaultPointsForQuestionType,
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/worksheet-editor/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

const DEFAULT_PANEL_WIDTH = 360;
const DEFAULT_PANEL_HEIGHT = 520;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;
const MIN_PANEL_HEIGHT = 340;
const MAX_PANEL_HEIGHT = 780;

function clampReplacePanelWidth(value: number) {
  if (typeof window === "undefined") {
    return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, value));
  }
  return Math.max(
    MIN_PANEL_WIDTH,
    Math.min(MAX_PANEL_WIDTH, window.innerWidth - 88, value),
  );
}

function clampReplacePanelHeight(value: number) {
  if (typeof window === "undefined") {
    return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, value));
  }
  return Math.max(
    MIN_PANEL_HEIGHT,
    Math.min(MAX_PANEL_HEIGHT, window.innerHeight - 24, value),
  );
}

type ResizeMode = "width" | "height" | "corner";

type ResizeState = {
  mode: ResizeMode;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

function ReplacementCandidateCard({
  item,
  onOpen,
}: {
  item: WorksheetQuestionBankItem;
  onOpen: () => void;
}) {
  const { isZh } = useAppI18n();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fbfbf8] px-3 py-2.5 text-left transition hover:border-[rgba(55,53,47,0.16)] hover:bg-white"
    >
      <div className="flex flex-wrap gap-1 text-[10px]">
        <span className="rounded-full bg-[#f6efe2] px-1.5 py-0.5 text-[#37352F]/55">
          {getQuestionTypeLabel(item.exerciseType, isZh)}
        </span>
        <span className="rounded-full bg-[#f6efe2] px-1.5 py-0.5 text-[#37352F]/55">
          {getDifficultyLabel(item.difficulty, isZh)}
        </span>
        <span className="rounded-full bg-[#f6efe2] px-1.5 py-0.5 text-[#37352F]/55">
          {isZh
            ? `${defaultPointsForQuestionType(item.exerciseType)} 分`
            : `${defaultPointsForQuestionType(item.exerciseType)} pts`}
        </span>
      </div>
      {item.stimulusImageUrl ? (
        <div className="mt-2.5">
          <img
            src={item.stimulusImageUrl}
            alt={isZh ? "题目配图" : "Question image"}
            referrerPolicy="no-referrer"
            className="block max-h-[120px] w-auto max-w-[50%] rounded-lg border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] object-scale-down"
          />
        </div>
      ) : null}
      <div className="mt-2.5">
        <QuestionContentWithImages
          content={item.stimulusImageUrl ? stripMarkdownImages(item.questionText) : item.questionText}
          className="space-y-0"
          textClassName="line-clamp-4 text-[13px] leading-6 text-[#37352F]"
          galleryClassName={item.stimulusImageUrl ? "hidden" : "mt-2 grid gap-2"}
          figureClassName="bg-[#fafaf8]"
          imageClassName="block max-h-[120px] w-auto max-w-[50%] object-scale-down"
        />
      </div>
      {item.options && item.options.length > 0 ? (
        <div className="mt-2 space-y-1">
          {item.options.slice(0, 4).map((option) => (
            <div
              key={`${item.id}-${option.label}`}
              className="flex items-start gap-1.5 text-[12px] leading-5 text-[#37352F]/68"
            >
              <span className="shrink-0 font-medium text-[#37352F]/46">
                {option.label}.
              </span>
              {option.imageUrl ? (
                <img
                  src={option.imageUrl}
                  alt={`Choice ${option.label}`}
                  className="h-8 rounded border border-slate-200 bg-white object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="min-w-0">
                  <QuestionContentWithImages
                    content={option.text}
                    className="space-y-1"
                    textClassName="line-clamp-1 text-[12px] leading-5"
                    galleryClassName="mt-1"
                    figureClassName="bg-[#fafaf8]"
                    imageClassName="max-h-[60px] w-auto object-contain"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 text-[10px] text-[#8c7e68]">
        {isZh ? "点击查看详情后再决定是否替换" : "Click to preview details before replacing"}
      </div>
    </button>
  );
}

function ReplacementDetailView({
  item,
}: {
  item: WorksheetQuestionBankItem;
}) {
  const { isZh } = useAppI18n();
  const candidatePoints = defaultPointsForQuestionType(item.exerciseType);

  return (
    <div className="space-y-4 px-3 py-3">
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-full bg-[#f6efe2] px-2 py-0.5 text-[#37352F]/65">
          {getQuestionTypeLabel(item.exerciseType, isZh)}
        </span>
        <span className="rounded-full bg-[#f6efe2] px-2 py-0.5 text-[#37352F]/65">
          {getDifficultyLabel(item.difficulty, isZh)}
        </span>
        <span className="rounded-full bg-[#f6efe2] px-2 py-0.5 text-[#37352F]/65">
          {isZh
            ? `${candidatePoints} 分`
            : `${candidatePoints} pts`}
        </span>
      </div>

      {item.stimulusImageUrl ? (
        <div className="overflow-hidden rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] p-2">
          <img
            src={item.stimulusImageUrl}
            alt={isZh ? "题目配图" : "Question image"}
            referrerPolicy="no-referrer"
            className="max-h-[240px] w-full object-contain"
          />
        </div>
      ) : null}

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
          {isZh ? "题干" : "Question"}
        </p>
        <div className="mt-1 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-3">
          <QuestionTiptapEditor
            content={item.stimulusImageUrl ? stripMarkdownImages(item.questionText) : item.questionText}
            editable={false}
            onUpdate={() => undefined}
            className="px-0"
            contentClassName="[&_p]:text-[13px] [&_p]:leading-6"
          />
        </div>
      </section>

      {item.options && item.options.length > 0 ? (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
            {isZh ? "选项" : "Options"}
          </p>
          <div className="mt-1 space-y-2 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-3">
            {item.options.map((option) => (
              <div
                key={`${item.id}-${option.label}`}
                className="flex items-start gap-2 text-[12px] leading-6 text-[#37352F]/82"
              >
                <span className="w-5 shrink-0 pt-0.5 font-semibold text-[#37352F]">
                  {option.label}.
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <QuestionTiptapEditor
                    content={option.text}
                    editable={false}
                    onUpdate={() => undefined}
                    className="px-0"
                    contentClassName="min-h-0 [&_.ProseMirror]:min-h-[24px] [&_p]:text-[12px] [&_p]:leading-6"
                  />
                  {option.imageUrl ? (
                    <img
                      src={option.imageUrl}
                      alt={`Choice ${option.label}`}
                      className="max-h-[140px] rounded-lg border border-slate-200 bg-white object-contain"
                      loading="lazy"
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-2 rounded-lg border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] p-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#8c7e68]">
            {isZh ? "分值" : "Points"}
          </span>
          <span className="inline-flex items-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white px-2.5 py-1 text-xs text-[#37352F]/80">
            {isZh ? `${candidatePoints} 分` : `${candidatePoints} pts`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] uppercase tracking-[0.16em] text-[#8c7e68]">
            {isZh ? "难度" : "Difficulty"}
          </span>
          <span className="inline-flex items-center rounded-full border border-[rgba(55,53,47,0.12)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#37352F]/72">
            {getDifficultyLabel(item.difficulty, isZh)}
          </span>
        </div>
      </div>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
          {isZh ? "正确答案" : "Correct answer"}
        </p>
        <div className="mt-1 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-3">
          {item.exerciseType === "MC" && item.options && item.options.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {item.options.map((option) => {
                const checked =
                  Boolean(option.isCorrect) || item.correctAnswer === option.label;
                return (
                  <span
                    key={`${item.id}-${option.label}-answer`}
                    className={cn(
                      "inline-flex min-w-[40px] items-center justify-center rounded-full border px-2.5 py-1.5 text-xs",
                      checked
                        ? "border-[#1f1f1f] bg-[#1f1f1f] text-white"
                        : "border-[rgba(55,53,47,0.12)] bg-white text-[#37352F]/72",
                    )}
                  >
                    {option.label}
                  </span>
                );
              })}
            </div>
          ) : item.correctAnswer ? (
            <MathText
              text={item.correctAnswer}
              className="whitespace-pre-wrap text-[12px] leading-6 text-[#37352F]"
            />
          ) : (
            <p className="text-[12px] leading-6 text-[#37352F]/55">
              {isZh ? "暂无" : "None"}
            </p>
          )}
        </div>
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7e68]">
          {isZh ? "解析" : "Explanation"}
        </p>
        <div className="mt-1 rounded-xl border border-[rgba(55,53,47,0.08)] bg-white px-3 py-3">
          {item.solutionSteps ? (
            <QuestionTiptapEditor
              content={item.solutionSteps}
              editable={false}
              onUpdate={() => undefined}
              className="px-0"
              contentClassName="[&_p]:text-[12px] [&_p]:leading-6 [&_blockquote]:text-[#37352F]/70"
            />
          ) : (
            <p className="text-[12px] leading-6 text-[#37352F]/55">
              {isZh ? "暂无解析" : "No explanation provided"}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function ReplaceQuestionPanel({
  onSearchReplacements,
  onConfirmReplace,
  onClose,
}: {
  onSearchReplacements: () => Promise<WorksheetQuestionBankItem[]>;
  onConfirmReplace: (item: WorksheetQuestionBankItem) => void;
  onClose: () => void;
}) {
  const { isZh } = useAppI18n();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<WorksheetQuestionBankItem[]>([]);
  const [selectedCandidate, setSelectedCandidate] =
    useState<WorksheetQuestionBankItem | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const initialSearchRef = useRef(onSearchReplacements);
  const resizeStateRef = useRef<ResizeState | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setCandidates([]);
      setSelectedCandidate(null);
      try {
        const results = await initialSearchRef.current();
        if (!active) return;
        setCandidates(results);
      } catch {
        if (!active) return;
        setCandidates([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleResizeStart = useCallback(
    (mode: ResizeMode) => (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      resizeStateRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: panelWidth,
        startHeight: panelHeight,
      };

      const cursor =
        mode === "width"
          ? "ew-resize"
          : mode === "height"
            ? "ns-resize"
            : "nesw-resize";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const current = resizeStateRef.current;
        if (!current) return;
        const dx = moveEvent.clientX - current.startX;
        const dy = moveEvent.clientY - current.startY;

        if (current.mode === "width" || current.mode === "corner") {
          setPanelWidth(clampReplacePanelWidth(current.startWidth - dx));
        }

        if (current.mode === "height" || current.mode === "corner") {
          setPanelHeight(clampReplacePanelHeight(current.startHeight + dy));
        }
      };

      const handlePointerUp = () => {
        resizeStateRef.current = null;
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [panelHeight, panelWidth],
  );

  return (
    <div className="absolute right-full top-0 mr-2">
      <div
        data-testid="worksheet-replace-panel"
        className="group relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-[rgba(55,53,47,0.16)] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        style={{
          width: `${panelWidth}px`,
          height: `${panelHeight}px`,
          maxWidth: "calc(100vw - 88px)",
          maxHeight: "calc(100vh - 24px)",
        }}
      >
        <div
          data-testid="worksheet-replace-panel-left-handle"
          onPointerDown={handleResizeStart("width")}
          className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize"
          title={isZh ? "拖动左边框调整宽度" : "Drag the left edge to resize"}
        />
        <div
          data-testid="worksheet-replace-panel-bottom-handle"
          onPointerDown={handleResizeStart("height")}
          className="absolute inset-x-0 bottom-0 z-20 h-2 cursor-ns-resize"
          title={isZh ? "拖动下边框调整高度" : "Drag the bottom edge to resize"}
        />
        <div
          data-testid="worksheet-replace-panel-corner-handle"
          onPointerDown={handleResizeStart("corner")}
          className="absolute bottom-0 left-0 z-30 h-4 w-4 cursor-nesw-resize"
          title={isZh ? "拖动左下角放大面板" : "Drag the bottom-left corner to resize"}
        />

        <div className="flex items-center justify-between border-b border-[rgba(55,53,47,0.08)] px-3 py-2">
          {selectedCandidate ? (
            <button
              type="button"
              data-testid="worksheet-replace-back-button"
              onClick={() => setSelectedCandidate(null)}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-[#37352F]/70 transition hover:bg-[#f7f6f3] hover:text-[#37352F]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {isZh ? "返回候选列表" : "Back to results"}
            </button>
          ) : (
            <span className="text-xs font-semibold text-[#37352F]">
              {isZh ? "换一题" : "Replace question"}
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#37352F]/40 transition hover:bg-[#f7f6f3] hover:text-[#37352F]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center px-4 text-xs text-[#37352F]/40">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {isZh ? "正在搜索相似题..." : "Searching for similar questions..."}
            </div>
          ) : selectedCandidate ? (
            <div data-testid="worksheet-replace-detail-view" className="h-full overflow-y-auto">
              <ReplacementDetailView item={selectedCandidate} />
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex h-full items-center justify-center px-5 text-center text-xs text-[#37352F]/40">
              {isZh ? "未找到相似题目" : "No similar questions found"}
            </div>
          ) : (
            <div data-testid="worksheet-replace-list-view" className="h-full overflow-y-auto px-3 py-2">
              <div className="space-y-2">
                {candidates.map((item) => (
                  <ReplacementCandidateCard
                    key={`replace-${item.id}`}
                    item={item}
                    onOpen={() => setSelectedCandidate(item)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[rgba(55,53,47,0.08)] px-3 py-2">
          {selectedCandidate ? (
            <>
              <span className="text-[10px] text-[#8c7e68]">
                {isZh ? "左上角可返回候选列表" : "Use the top-left button to return"}
              </span>
              <button
                type="button"
                data-testid="worksheet-replace-confirm-button"
                onClick={() => onConfirmReplace(selectedCandidate)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#37352F] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#27241f]"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {isZh ? "替换为这道题" : "Replace with this question"}
              </button>
            </>
          ) : (
            <>
              <span className="text-[10px] text-[#8c7e68]">
                {isZh ? "拖动左侧或下边框可放大面板" : "Drag the left or bottom edge to resize"}
              </span>
              <span className={cn("text-[10px] text-[#8c7e68]", candidates.length === 0 && "opacity-0")}>
                {isZh ? `${candidates.length} 道候选题` : `${candidates.length} candidates`}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
