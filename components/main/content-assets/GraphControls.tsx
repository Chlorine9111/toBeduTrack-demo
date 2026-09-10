"use client";

import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

type Filters = {
  types: Set<string>;
  courseLabel: string;
  daysRange: number;
};

type GraphControlsProps = {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  courseLabels: string[];
  nodeCount: number;
  linkCount: number;
};

export default function GraphControls({
  filters,
  onFiltersChange,
  courseLabels,
  nodeCount,
  linkCount,
}: GraphControlsProps) {
  const { isZh } = useAppI18n();
  const typeOptions = [
    { key: "pdf", label: "PDF", color: "var(--heroui-danger)" },
    { key: "ai", label: isZh ? "AI 生成" : "AI Generated", color: "#6940A5" },
    { key: "image", label: isZh ? "图片" : "Image", color: "#D9730D" },
    { key: "text", label: isZh ? "文本" : "Text", color: "#0B6E99" },
  ] as const;
  const timeOptions = [
    { value: 0, label: isZh ? "全部" : "All Time" },
    { value: 7, label: isZh ? "7 天" : "7 Days" },
    { value: 30, label: isZh ? "30 天" : "30 Days" },
    { value: 90, label: isZh ? "90 天" : "90 Days" },
  ] as const;

  const toggleType = (key: string) => {
    const next = new Set(filters.types);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    onFiltersChange({ ...filters, types: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-divider bg-white">
      {/* 类型筛选 */}
      <div className="flex items-center gap-1">
        {typeOptions.map((opt) => (
          <Button
            key={opt.key}
            size="sm"
            variant="ghost"
            onPress={() => toggleType(opt.key)}
            className={cn(
              "flex h-auto items-center gap-1 rounded-md px-2 py-1 text-[12px]",
              filters.types.has(opt.key)
                ? "bg-default-200 text-foreground"
                : "text-default-200 hover:text-foreground-400",
            )}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: opt.color, opacity: filters.types.has(opt.key) ? 1 : 0.3 }}
            />
            {opt.label}
          </Button>
        ))}
      </div>

      {/* 学科筛选 */}
      {courseLabels.length > 0 && (
        <select
          value={filters.courseLabel}
          onChange={(e) => onFiltersChange({ ...filters, courseLabel: e.target.value })}
          className="h-7 rounded-md border border-divider bg-white px-2 text-[12px] text-foreground outline-none"
        >
          <option value="">{isZh ? "全部学科" : "All Courses"}</option>
          {courseLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      )}

      {/* 时间范围 */}
      <div className="flex items-center gap-1">
        {timeOptions.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant="ghost"
            onPress={() => onFiltersChange({ ...filters, daysRange: opt.value })}
            className={cn(
              "h-auto rounded-md px-2 py-1 text-[12px]",
              filters.daysRange === opt.value
                ? "bg-default-200 text-foreground"
                : "text-default-200 hover:text-foreground-400",
            )}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* 统计信息 */}
      <span className="ml-auto text-[11px] text-default-400">
        {isZh
          ? `${nodeCount} 节点 · ${linkCount} 关联`
          : `${nodeCount} nodes · ${linkCount} links`}
      </span>
    </div>
  );
}
