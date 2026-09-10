"use client";

import { useEffect } from "react";
import { Button, Card } from "@heroui/react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type MainRouteErrorProps = {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
  title?: string;
  description?: string;
};

export default function MainRouteError({
  error,
  reset,
  unstable_retry,
  title = "这个工作区暂时打不开",
  description = "你可以先重试当前页面；如果问题持续，再刷新浏览器。",
}: MainRouteErrorProps) {
  const isChunkLoadError =
    error.name === "ChunkLoadError" ||
    error.message.includes("ChunkLoadError") ||
    error.message.includes("Loading chunk");

  const chunkRetryKey =
    typeof window === "undefined"
      ? null
      : `deskmate:chunk-retry:${window.location.pathname}`;

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (!isChunkLoadError || !chunkRetryKey) {
      return;
    }

    const retried = window.sessionStorage.getItem(chunkRetryKey);
    if (retried === "1") {
      return;
    }

    window.sessionStorage.setItem(chunkRetryKey, "1");
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, 120);
    return () => {
      window.clearTimeout(timer);
    };
  }, [chunkRetryKey, isChunkLoadError]);

  const retry = () => {
    if (isChunkLoadError && chunkRetryKey) {
      window.sessionStorage.removeItem(chunkRetryKey);
      window.location.reload();
      return;
    }
    const baseRetry = unstable_retry ?? reset ?? (() => window.location.reload());
    baseRetry();
  };

  const resolvedTitle = isChunkLoadError ? "页面资源刚更新，正在重新连接" : title;
  const resolvedDescription = isChunkLoadError
    ? "检测到浏览器里缓存的是旧前端资源。系统会自动刷新一次；如果仍失败，再手动重试。"
    : description;
  const buttonLabel = isChunkLoadError ? "立即刷新页面" : "重新加载";

  return (
    <div className="flex h-full min-h-[360px] flex-1 items-center justify-center bg-default-50 px-6 py-10">
      <Card className="w-full max-w-md text-center">
        <Card.Content className="p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-foreground">{resolvedTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-default-500">{resolvedDescription}</p>
          <Button
            variant="primary"
            onPress={() => retry()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-foreground/90"
          >
            <RefreshCw className="h-4 w-4" />
            {buttonLabel}
          </Button>
        </Card.Content>
      </Card>
    </div>
  );
}
