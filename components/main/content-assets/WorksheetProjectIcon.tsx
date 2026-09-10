"use client";

export default function WorksheetProjectIcon({
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M22 22V2L2 22h20Z" fill="currentColor" />
    </svg>
  );
}
