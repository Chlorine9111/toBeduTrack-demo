import { cn } from "@/lib/utils";

type DotPulseLoaderProps = {
  className?: string;
  size?: "sm" | "md";
};

export default function DotPulseLoader({
  className,
  size = "sm",
}: DotPulseLoaderProps) {
  const dot = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  const gap = size === "sm" ? "gap-1" : "gap-1.5";

  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex items-center", gap, className)}
    >
      <span className={cn("rounded-full bg-current animate-[breath_1.4s_ease-in-out_0ms_infinite]", dot)} />
      <span className={cn("rounded-full bg-current animate-[breath_1.4s_ease-in-out_200ms_infinite]", dot)} />
      <span className={cn("rounded-full bg-current animate-[breath_1.4s_ease-in-out_400ms_infinite]", dot)} />
    </span>
  );
}
