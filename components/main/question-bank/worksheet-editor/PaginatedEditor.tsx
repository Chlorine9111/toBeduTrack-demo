"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PageContainer, {
  A4_RATIO,
} from "@/components/main/question-bank/worksheet-editor/PageContainer";
import CompactQuestionView from "@/components/main/question-bank/worksheet-editor/CompactQuestionView";
import FloatingEditPanel from "@/components/main/question-bank/worksheet-editor/FloatingEditPanel";
import SectionHeader from "@/components/main/question-bank/worksheet-editor/SectionHeader";
import QuestionDropZone, { SectionDropZone } from "@/components/main/question-bank/worksheet-editor/QuestionDropZone";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type {
  WorksheetEditorQuestion,
  WorksheetEditorSection,
  WorksheetQuestionBankItem,
} from "@/components/main/question-bank/worksheet-editor/types";
import { cn } from "@/lib/utils";
import {
  sortQuestionsForCanvas,
  sortSections,
} from "@/components/main/question-bank/worksheet-editor/utils";

/** 第一页标题区域的估算高度 */
const HEADER_HEIGHT = 64;
/** 页脚区域高度 */
const FOOTER_HEIGHT = 28;
/** section 标题的估算高度 */
const SECTION_HEADER_HEIGHT = 36;
/** 题目之间的间距 */
const QUESTION_GAP = 6;
/** section 之间额外间距 */
const SECTION_GAP = 14;

/**
 * 分页单元（一道题或一个 section 标题）
 */
type PageItem =
  | { kind: "section-header"; sectionId: string; section: WorksheetEditorSection }
  | {
      kind: "question";
      questionId: string;
      question: WorksheetEditorQuestion;
      /** 在 section 内的顺序索引（非空白块） */
      displayIndex: number;
    };

/**
 * 一页包含的内容
 */
type PageData = {
  pageNumber: number;
  items: PageItem[];
};

export default function PaginatedEditor({
  questions,
  sections,
  title,
  activeQuestionId,
  activeSectionId,
  expandedQuestionId,
  onFocusQuestion,
  onExpandQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
  onSearchReplacements,
  onConfirmReplace,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDropBefore,
  onMoveQuestion,
  canMoveUp,
  canMoveDown,
  onAddBlankAfter,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  externalDropActive = false,
  onPageCountChange,
}: {
  questions: WorksheetEditorQuestion[];
  sections: WorksheetEditorSection[];
  title: string;
  activeQuestionId: string | null;
  activeSectionId: string | null;
  expandedQuestionId: string | null;
  onFocusQuestion: (id: string) => void;
  onExpandQuestion: (id: string | null) => void;
  onUpdateQuestion: (
    id: string,
    updater: (q: WorksheetEditorQuestion) => WorksheetEditorQuestion,
  ) => void;
  onRemoveQuestion: (id: string) => void;
  onSearchReplacements: (id: string) => Promise<WorksheetQuestionBankItem[]>;
  onConfirmReplace: (questionId: string, item: WorksheetQuestionBankItem) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDropBefore: (id: string) => void;
  onMoveQuestion: (questionId: string, sectionId: string, beforeId?: string) => void;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
  onAddBlankAfter: (afterQuestionId: string) => void;
  onAddSection: (afterSectionId?: string) => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (sectionId: string) => void;
  externalDropActive?: boolean;
  onPageCountChange?: (pageCount: number) => void;
}) {
  const { isZh } = useAppI18n();
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef(new Map<string, HTMLDivElement | null>());

  const [containerWidth, setContainerWidth] = useState(650);
  const [itemHeights, setItemHeights] = useState<Map<string, number>>(new Map());
  const [panelDragPos, setPanelDragPos] = useState<{ x: number; y: number } | null>(null);
  const [autoOpenReplaceQuestionId, setAutoOpenReplaceQuestionId] = useState<string | null>(null);

  const sortedSections = useMemo(() => sortSections(sections), [sections]);
  const sortedQuestions = useMemo(
    () => sortQuestionsForCanvas(questions, sections),
    [questions, sections],
  );

  // 监听容器宽度变化
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const width = container.clientWidth;
      // A4 页面宽度 = 容器宽度 - 左右间距
      const pageWidth = Math.min(width - 48, 700);
      setContainerWidth(Math.max(400, pageWidth));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 构建渲染序列（section 标题 + 题目交错）
  const renderItems: PageItem[] = useMemo(() => {
    const items: PageItem[] = [];
    let globalQuestionCounter = 0;

    for (const section of sortedSections) {
      items.push({
        kind: "section-header",
        sectionId: section.id,
        section,
      });

      const sectionQuestions = sortedQuestions.filter(
        (q) => q.sectionId === section.id,
      );

      for (const question of sectionQuestions) {
        const displayIndex = question.isBlankBlock
          ? -1
          : globalQuestionCounter++;
        items.push({
          kind: "question",
          questionId: question.id,
          question,
          displayIndex,
        });
      }
    }

    return items;
  }, [sortedSections, sortedQuestions]);

  // DOM 测量：在隐藏容器中渲染后测量每个条目的高度
  useLayoutEffect(() => {
    const nextHeights = new Map<string, number>();
    for (const [id, el] of measureRefs.current) {
      if (el) {
        nextHeights.set(id, el.getBoundingClientRect().height);
      }
    }
    if (nextHeights.size > 0) {
      setItemHeights(nextHeights);
    }
  }, [renderItems, containerWidth]);

  // 在图片加载后重新测量
  useEffect(() => {
    const container = measureContainerRef.current;
    if (!container) return;

    const handleLoad = () => {
      const nextHeights = new Map<string, number>();
      for (const [id, el] of measureRefs.current) {
        if (el) {
          nextHeights.set(id, el.getBoundingClientRect().height);
        }
      }
      if (nextHeights.size > 0) {
        setItemHeights(nextHeights);
      }
    };

    container.addEventListener("load", handleLoad, true);
    return () => container.removeEventListener("load", handleLoad, true);
  }, [renderItems]);

  // 页面尺寸计算
  const pageHeight = containerWidth * A4_RATIO;
  const paddingY = pageHeight * (22 / 297);
  const firstPageContentHeight = pageHeight - paddingY * 2 - FOOTER_HEIGHT - HEADER_HEIGHT;
  const normalPageContentHeight = pageHeight - paddingY * 2 - FOOTER_HEIGHT;

  // 贪心分页算法
  const pages: PageData[] = useMemo(() => {
    const result: PageData[] = [];
    let currentItems: PageItem[] = [];
    let currentHeight = 0;
    let isFirstPage = true;
    const maxHeight = () =>
      isFirstPage ? firstPageContentHeight : normalPageContentHeight;

    for (const item of renderItems) {
      const itemKey =
        item.kind === "section-header"
          ? `section-${item.sectionId}`
          : item.questionId;
      const measuredHeight = itemHeights.get(itemKey) ?? (
        item.kind === "section-header" ? SECTION_HEADER_HEIGHT : 80
      );
      const gap =
        currentItems.length > 0
          ? item.kind === "section-header"
            ? SECTION_GAP
            : QUESTION_GAP
          : 0;
      const totalItemHeight = measuredHeight + gap;

      // 空白块（isBlankBlock）不跨页 — 整块放一页
      const isBlankBlock =
        item.kind === "question" && item.question.isBlankBlock;

      if (
        currentHeight + totalItemHeight > maxHeight() &&
        currentItems.length > 0
      ) {
        result.push({
          pageNumber: result.length + 1,
          items: currentItems,
        });
        currentItems = [];
        currentHeight = 0;
        isFirstPage = false;
      }

      // 如果空白块单独超过一页高度，强制放入当前页（避免无限循环）
      if (isBlankBlock && measuredHeight > maxHeight() && currentItems.length === 0) {
        currentItems.push(item);
        result.push({
          pageNumber: result.length + 1,
          items: currentItems,
        });
        currentItems = [];
        currentHeight = 0;
        isFirstPage = false;
        continue;
      }

      currentItems.push(item);
      currentHeight += totalItemHeight;
    }

    if (currentItems.length > 0) {
      result.push({
        pageNumber: result.length + 1,
        items: currentItems,
      });
    }

    // 至少一页
    if (result.length === 0) {
      result.push({ pageNumber: 1, items: [] });
    }

    return result;
  }, [renderItems, itemHeights, firstPageContentHeight, normalPageContentHeight]);

  useEffect(() => {
    onPageCountChange?.(Math.max(1, pages.length));
  }, [onPageCountChange, pages.length]);

  // 展开面板的锚点信息
  const [anchorRect, setAnchorRect] = useState<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
  } | null>(null);

  const updateAnchorRect = useCallback(() => {
    if (!expandedQuestionId || !editorContainerRef.current) {
      setAnchorRect(null);
      return;
    }
    // 只在可见的页面区域中搜索（排除隐藏的测量容器）
    const pagesContainer = editorContainerRef.current.querySelector("[data-pages-container]");
    const questionEl = pagesContainer
      ? pagesContainer.querySelector(`[data-question-id="${expandedQuestionId}"]`)
      : null;
    if (!questionEl) {
      setAnchorRect(null);
      return;
    }
    const rect = questionEl.getBoundingClientRect();
    setAnchorRect((prev) => {
      if (
        prev &&
        Math.abs(prev.top - rect.top) < 1 &&
        Math.abs(prev.left - rect.left) < 1 &&
        Math.abs(prev.right - rect.right) < 1 &&
        Math.abs(prev.bottom - rect.bottom) < 1 &&
        Math.abs(prev.width - rect.width) < 1
      ) {
        return prev;
      }
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
      };
    });
  }, [expandedQuestionId]);

  useEffect(() => {
    updateAnchorRect();
    // DOM 可能还没完全更新，多试一次
    const timer = setTimeout(updateAnchorRect, 50);
    return () => clearTimeout(timer);
  }, [updateAnchorRect, pages, expandedQuestionId]);

  // 面板是 fixed 可拖拽的，不再跟随滚动，也不在滚动时关闭

  const containerRect = editorContainerRef.current?.getBoundingClientRect() ?? {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
  };

  // 查找展开题目的信息
  const expandedQuestion = expandedQuestionId
    ? questions.find((q) => q.id === expandedQuestionId) ?? null
    : null;

  const expandedQuestionIndex = expandedQuestionId
    ? renderItems.findIndex(
        (item) =>
          item.kind === "question" && item.questionId === expandedQuestionId,
      )
    : -1;

  const expandedDisplayIndex =
    expandedQuestionIndex >= 0
      ? (renderItems[expandedQuestionIndex] as Extract<PageItem, { kind: "question" }>)
          .displayIndex
      : 0;

  // 为每个 section 的题目计算 section 内的序号信息
  const sectionQuestionMap = useMemo(() => {
    const map = new Map<string, WorksheetEditorQuestion[]>();
    for (const q of sortedQuestions) {
      const list = map.get(q.sectionId) ?? [];
      list.push(q);
      map.set(q.sectionId, list);
    }
    return map;
  }, [sortedQuestions]);

  const handleQuestionClick = useCallback(
    (questionId: string) => {
      onFocusQuestion(questionId);
      // 只展开，不 toggle 关闭。关闭通过面板 X 按钮或 ESC
      if (expandedQuestionId !== questionId) {
        onExpandQuestion(questionId);
      }
      // 更新锚点，等 DOM 刷新后
      requestAnimationFrame(() => updateAnchorRect());
    },
    [expandedQuestionId, onFocusQuestion, onExpandQuestion, updateAnchorRect],
  );

  // 测量容器中每个条目的内容宽度
  const paddingX = containerWidth * (20 / 210);
  const contentWidth = containerWidth - paddingX * 2;

  return (
    <div
      ref={editorContainerRef}
      className="relative h-full"
    >
      {/* 隐藏的测量容器 */}
      <div
        ref={measureContainerRef}
        className="pointer-events-none fixed left-[-9999px] top-0"
        style={{ width: `${contentWidth}px` }}
        aria-hidden="true"
      >
        {renderItems.map((item) => {
          if (item.kind === "section-header") {
            const sectionQuestions = sectionQuestionMap.get(item.sectionId) ?? [];
            const realQuestions = sectionQuestions.filter((q) => !q.isBlankBlock);
            const totalPoints = realQuestions.reduce(
              (sum, q) => sum + (Number(q.points) || 0),
              0,
            );
            return (
              <div
                key={`measure-section-${item.sectionId}`}
                ref={(el) => {
                  measureRefs.current.set(`section-${item.sectionId}`, el);
                }}
              >
                <SectionHeader
                  section={item.section}
                  questionCount={realQuestions.length}
                  totalPoints={totalPoints}
                  onRename={() => undefined}
                  onAddAfter={() => undefined}
                  onDelete={() => undefined}
                />
              </div>
            );
          }
          return (
            <div
              key={`measure-${item.questionId}`}
              ref={(el) => {
                measureRefs.current.set(item.questionId, el);
              }}
            >
              <CompactQuestionView
                question={item.question}
                index={item.displayIndex}
              />
            </div>
          );
        })}
      </div>

      {/* A4 分页显示 */}
      <div data-pages-container className="flex flex-col items-center gap-4 pb-8">
        {pages.map((page) => (
          <PageContainer
            key={page.pageNumber}
            pageNumber={page.pageNumber}
            totalPages={pages.length}
            width={containerWidth}
            isFirstPage={page.pageNumber === 1}
            title={title}
          >
            <div className="space-y-0">
              {page.items.map((item) => {
                if (item.kind === "section-header") {
                  const sectionQuestions =
                    sectionQuestionMap.get(item.sectionId) ?? [];
                  const realQuestions = sectionQuestions.filter(
                    (q) => !q.isBlankBlock,
                  );
                  const totalPoints = realQuestions.reduce(
                    (sum, q) => sum + (Number(q.points) || 0),
                    0,
                  );
                  const firstQuestionId = sectionQuestions[0]?.id;
                  const isEmptySection = sectionQuestions.length === 0;
                  return (
                    <div
                      key={`page-section-${item.sectionId}`}
                      data-section-id={item.sectionId}
                      className={cn(
                        "pt-2 pb-1 transition-colors",
                        activeSectionId === item.sectionId
                          ? "rounded-lg bg-[#fcfbf7]"
                          : null,
                      )}
                    >
                      <SectionHeader
                        section={item.section}
                        questionCount={realQuestions.length}
                        totalPoints={totalPoints}
                        onRename={(t) => onRenameSection(item.sectionId, t)}
                        onAddAfter={() => onAddSection(item.sectionId)}
                        onDelete={() => onDeleteSection(item.sectionId)}
                      />
                      {isEmptySection ? (
                        <SectionDropZone
                          sectionId={item.sectionId}
                          enabled={externalDropActive}
                        />
                      ) : (
                        <SectionDropZone
                          sectionId={item.sectionId}
                          beforeQuestionId={firstQuestionId}
                          enabled={externalDropActive}
                        />
                      )}
                    </div>
                  );
                }

                const sectionQuestions =
                  sectionQuestionMap.get(item.question.sectionId) ?? [];
                const isLastQuestionInSection =
                  sectionQuestions[sectionQuestions.length - 1]?.id === item.questionId;

                return (
                  <div
                    key={`page-q-${item.questionId}`}
                    data-question-id={item.questionId}
                    className="py-[3px]"
                  >
                    <QuestionDropZone
                      sectionId={item.question.sectionId}
                      questionId={item.questionId}
                      enabled={externalDropActive}
                    >
                      <CompactQuestionView
                        question={item.question}
                        index={item.displayIndex}
                        active={activeQuestionId === item.questionId}
                        onClick={() => handleQuestionClick(item.questionId)}
                        onMoveUp={() => onMoveUp(item.questionId)}
                        onMoveDown={() => onMoveDown(item.questionId)}
                        onReplace={() => {
                          setAutoOpenReplaceQuestionId(item.questionId);
                          onExpandQuestion(item.questionId);
                        }}
                        onRemove={() => onRemoveQuestion(item.questionId)}
                        onAddBlankAfter={() => onAddBlankAfter(item.questionId)}
                        canMoveUp={canMoveUp(item.questionId)}
                        canMoveDown={canMoveDown(item.questionId)}
                      />
                    </QuestionDropZone>
                    {isLastQuestionInSection ? (
                      <SectionDropZone
                        sectionId={item.question.sectionId}
                        enabled={externalDropActive}
                      />
                    ) : null}
                  </div>
                );
              })}

              {/* 空页面提示 */}
              {page.items.length === 0 && page.pageNumber === 1 ? (
                <div className="flex h-full items-center justify-center text-center text-xs text-[#37352F]/40">
                  {isZh
                    ? "先从左侧题库添加题目，或从右上角打开 AI 组卷。"
                    : "Add questions from the left bank first, or open AI assembly from the top right."}
                </div>
              ) : null}
            </div>
          </PageContainer>
        ))}
      </div>

      {/* 浮动编辑面板 */}
      {expandedQuestion && anchorRect ? (
        <FloatingEditPanel
          question={expandedQuestion}
          index={expandedDisplayIndex}
          anchorRect={anchorRect}
          containerRect={containerRect}
          savedDragPos={panelDragPos}
          onDragPosChange={setPanelDragPos}
          autoOpenReplace={autoOpenReplaceQuestionId === expandedQuestion.id}
          onAutoOpenReplaceHandled={() => {
            setAutoOpenReplaceQuestionId((current) =>
              current === expandedQuestion.id ? null : current,
            );
          }}
          onUpdateQuestion={(updater) =>
            onUpdateQuestion(expandedQuestion.id, updater)
          }
          onRemoveQuestion={() => {
            onRemoveQuestion(expandedQuestion.id);
            onExpandQuestion(null);
          }}
          onSearchReplacements={() => onSearchReplacements(expandedQuestion.id)}
          onConfirmReplace={(item) => onConfirmReplace(expandedQuestion.id, item)}
          onMoveUp={() => onMoveUp(expandedQuestion.id)}
          onMoveDown={() => onMoveDown(expandedQuestion.id)}
          canMoveUp={canMoveUp(expandedQuestion.id)}
          canMoveDown={canMoveDown(expandedQuestion.id)}
          onClose={() => onExpandQuestion(null)}
        />
      ) : null}
    </div>
  );
}
