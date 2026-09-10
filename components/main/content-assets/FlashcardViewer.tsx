"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button, Spinner } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { apiGet } from "@/lib/api/client";

type Flashcard = {
  id: string;
  front_text: string;
  back_text: string;
  sort_order: number;
  difficulty: string | null;
};

type FlashcardSet = {
  id: string;
  title: string;
  card_count: number;
};

type FlashcardViewerProps = {
  setId: string;
};

export default function FlashcardViewer({ setId }: FlashcardViewerProps) {
  const { isZh } = useAppI18n();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [setData, setSetData] = useState<FlashcardSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const loadFlashcards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ set: FlashcardSet; cards: Flashcard[] }>(
        `/api/content-assets/flashcards/${setId}`,
      );
      setSetData(data.set);
      setCards(data.cards);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isZh, setId]);

  useEffect(() => {
    loadFlashcards();
  }, [loadFlashcards]);

  const goToPrev = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goToNext = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev < cards.length - 1 ? prev + 1 : prev));
  };

  const toggleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrev();
      else if (e.key === "ArrowRight") goToNext();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleFlip();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards.length, currentIndex],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm text-rose-600">{error}</p>
        <Button
          variant="ghost"
          size="sm"
          onPress={loadFlashcards}
          className="text-xs text-foreground-400 underline hover:text-foreground-600"
        >
          {isZh ? "重试" : "Retry"}
        </Button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-default-400">
        {isZh ? "暂无卡片" : "No cards available"}
      </div>
    );
  }

  const card = cards[currentIndex];
  const difficultyColors: Record<string, string> = {
    easy: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    hard: "bg-rose-100 text-rose-700",
  };
  const difficultyLabels: Record<string, string> = {
    easy: isZh ? "简单" : "Easy",
    medium: isZh ? "中等" : "Medium",
    hard: isZh ? "困难" : "Hard",
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {setData && (
        <h3 className="text-sm font-medium text-default-500">
          {setData.title}
        </h3>
      )}

      {/* Card */}
      <div
        className="relative w-full cursor-pointer select-none"
        style={{ perspective: "1000px" }}
        onClick={toggleFlip}
        role="button"
        tabIndex={0}
        aria-label={isFlipped ? (isZh ? "点击显示正面" : "Click to show front") : (isZh ? "点击显示背面" : "Click to show back")}
      >
        <div
          className="relative w-full transition-transform duration-400 ease-in-out"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="flex min-h-[200px] w-full flex-col items-center justify-center rounded-xl border border-divider bg-white px-6 py-8 shadow-sm"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="mb-2 text-[11px] font-medium text-foreground/40">
              {isZh ? "问题" : "Question"}
            </span>
            <p className="text-center text-base font-medium leading-relaxed text-foreground">
              {card.front_text}
            </p>
            {card.difficulty && (
              <span
                className={`mt-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${difficultyColors[card.difficulty] ?? ""}`}
              >
                {difficultyLabels[card.difficulty] ?? card.difficulty}
              </span>
            )}
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex min-h-[200px] w-full flex-col items-center justify-center rounded-xl border border-divider bg-content1 px-6 py-8 shadow-sm"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <span className="mb-2 text-[11px] font-medium text-foreground/40">
              {isZh ? "答案" : "Answer"}
            </span>
            <p className="text-center text-sm leading-relaxed text-[#3a3a3c]">
              {card.back_text}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex w-full items-center justify-between px-2">
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={goToPrev}
          isDisabled={currentIndex === 0}
          className="rounded-lg p-2 text-foreground-400 hover:bg-default-50"
          aria-label={isZh ? "上一张" : "Previous card"}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-default-400">
            {currentIndex + 1} / {cards.length}
          </span>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => {
              setIsFlipped(false);
              setCurrentIndex(0);
            }}
            className="rounded-lg p-1.5 text-foreground-400 hover:bg-default-50 hover:text-foreground-600"
            aria-label={isZh ? "重新开始" : "Restart"}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={goToNext}
          isDisabled={currentIndex === cards.length - 1}
          className="rounded-lg p-2 text-foreground-400 hover:bg-default-50"
          aria-label={isZh ? "下一张" : "Next card"}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <p className="text-[10px] text-default-200">
        {isZh ? "按左右箭头切换 | 空格键翻转" : "Use arrow keys to navigate | Space to flip"}
      </p>
    </div>
  );
}
