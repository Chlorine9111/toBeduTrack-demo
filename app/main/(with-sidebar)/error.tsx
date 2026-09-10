"use client";

import MainRouteError from "@/components/shells/MainRouteError";

export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  return (
    <MainRouteError
      error={error}
      reset={reset}
      unstable_retry={unstable_retry}
      title="主工作区加载失败"
      description="先重试当前页面；如果还不行，再检查刚才的操作是否触发了异常数据。"
    />
  );
}
