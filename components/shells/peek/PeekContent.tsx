"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { GlobalSearchItem } from "@/lib/search/types";
import type { SearchPeekResponse } from "@/lib/search/peek-types";
import PeekModal from "./PeekModal";
import QuestionPeek from "./QuestionPeek";
import ConversationPeek, { ConversationPeekFooter } from "./ConversationPeek";
import LessonPlanPeek, { LessonPlanPeekFooter } from "./LessonPlanPeek";
import PblPeek, { PblPeekFooter } from "./PblPeek";
import ContentLibraryPeek, { ContentLibraryPeekFooter } from "./ContentLibraryPeek";

type PeekContentProps = {
  /** The search result that triggered this peek */
  peekItem: GlobalSearchItem | null;
  onClose: () => void;
  onBack: () => void;
};

function cleanErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const data = error as Record<string, unknown>;
  if (typeof data.message === "string") return data.message;
  if (data.error && typeof data.error === "object") {
    const nested = data.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return fallback;
}

export default function PeekContent({
  peekItem,
  onClose,
  onBack,
}: PeekContentProps) {
  const router = useRouter();
  const [peekData, setPeekData] = useState<SearchPeekResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!peekItem) {
      setPeekData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchPeek = async () => {
      setLoading(true);
      setError(null);
      setPeekData(null);

      try {
        const url = `/api/search/peek?type=${encodeURIComponent(peekItem.type)}&id=${encodeURIComponent(peekItem.id)}`;
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (!response.ok) {
          throw new Error(cleanErrorMessage(payload, "读取预览失败"));
        }

        setPeekData(payload as SearchPeekResponse);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "读取预览失败",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPeek();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [peekItem]);

  const handleExpand = useCallback(() => {
    if (peekData?.item.route) {
      onClose();
      router.push(peekData.item.route);
    } else if (peekItem?.route) {
      onClose();
      router.push(peekItem.route);
    }
  }, [onClose, peekData, peekItem, router]);

  const handleNavigate = useCallback(
    (route: string) => {
      onClose();
      router.push(route);
    },
    [onClose, router],
  );

  const renderContent = (): ReactNode => {
    if (!peekData) return null;

    const { item, preview } = peekData;

    switch (preview.kind) {
      case "question":
        return <QuestionPeek item={item} preview={preview} />;
      case "conversation":
        return <ConversationPeek item={item} preview={preview} />;
      case "lesson_plan":
        return <LessonPlanPeek item={item} preview={preview} />;
      case "pbl_project":
        return <PblPeek item={item} preview={preview} />;
      case "content_library_item":
        return <ContentLibraryPeek item={item} preview={preview} />;
      default:
        return null;
    }
  };

  const renderFooter = (): ReactNode => {
    if (!peekData) return null;

    const { preview } = peekData;
    const route = peekData.item.route;

    switch (preview.kind) {
      case "question":
        return route ? (
          <button
            type="button"
            onClick={() => handleNavigate(route)}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-all hover:bg-accent/90 active:opacity-80"
          >
            <Pencil className="h-4 w-4" />
            <span>打开详情</span>
          </button>
        ) : null;
      case "conversation":
        return (
          <ConversationPeekFooter
            onContinueChat={() => handleNavigate(route)}
          />
        );
      case "lesson_plan":
        return (
          <LessonPlanPeekFooter
            onEdit={() => handleNavigate(route)}
          />
        );
      case "pbl_project":
        return <PblPeekFooter onEdit={() => handleNavigate(route)} />;
      case "content_library_item":
        return (
          <ContentLibraryPeekFooter
            onEdit={() => handleNavigate(route)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <PeekModal
      open={peekItem !== null}
      loading={loading}
      error={error}
      onClose={onClose}
      onBack={onBack}
      onExpand={handleExpand}
      footer={renderFooter()}
    >
      {renderContent()}
    </PeekModal>
  );
}
