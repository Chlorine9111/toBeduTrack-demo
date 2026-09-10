import { Skeleton } from "@heroui/react";

type StreamingSkeletonProps = {
  visible: boolean;
};

export default function StreamingSkeleton({ visible }: StreamingSkeletonProps) {
  return (
    <div
      className="flex justify-start"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 100ms ease",
      }}
    >
      <div
        className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface-tertiary px-3.5 py-2.5"
        style={{ minHeight: 72 }}
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 rounded" style={{ width: "80%" }} />
          <Skeleton className="h-3 rounded" style={{ width: "65%" }} />
          <Skeleton className="h-3 rounded" style={{ width: "40%" }} />
        </div>
      </div>
    </div>
  );
}
