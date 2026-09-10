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
      title="内容库暂时没有连上"
      description="系统会先尝试重连一次；如果刚做过本地改动或重启过开发服务，手动刷新后再进内容库即可。"
    />
  );
}
