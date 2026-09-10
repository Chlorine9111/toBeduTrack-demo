"use client";

interface LayoutProgressBarProps {
  progress: number;
  message: string;
}

export function LayoutProgressBar({ progress, message }: LayoutProgressBarProps) {
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs text-neutral-600">{message}</p>
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
        <div className="h-full bg-[#1D1D1F] transition-all" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
      <p className="text-right text-[11px] text-neutral-500">{Math.round(progress)}%</p>
    </div>
  );
}
