"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

// ── 类型 ────────────────────────────────────────────────────
export type OpenTab = {
  assetId: string;
  title: string;
  fileType: string | null;
};

type AssetTabBarProps = {
  tabs: OpenTab[];
  activeTabId: string | null;
  onActivate: (assetId: string) => void;
  onClose: (assetId: string) => void;
  onReorder: (tabs: OpenTab[]) => void;
};

const TAB_MIN_WIDTH_PX = 132;
const TAB_DEFAULT_WIDTH_PX = 330;

// ── 单个 Tab ────────────────────────────────────────────────
function SortableTab({
  tab,
  index,
  width,
  isActive,
  isOnly,
  onActivate,
  onClose,
}: {
  tab: OpenTab;
  index: number;
  width: number;
  isActive: boolean;
  isOnly: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const { isZh } = useAppI18n();
  const { ref, isDragging } = useSortable({
    id: tab.assetId,
    index,
    data: { type: "tab", tab },
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 中键关闭
      if (e.button === 1) {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group relative flex h-[34px] shrink-0 items-center gap-1.5 border-r border-divider px-3 text-[12px] select-none transition-colors",
        isActive
          ? "bg-white text-foreground"
          : "bg-default-100 text-default-500 hover:bg-default-100",
        isDragging && "opacity-50",
      )}
      style={{
        cursor: isDragging ? "grabbing" : "pointer",
        width: `${width}px`,
        minWidth: `${TAB_MIN_WIDTH_PX}px`,
        maxWidth: `${TAB_DEFAULT_WIDTH_PX}px`,
      }}
      data-testid={`content-asset-tab-${tab.assetId}`}
      onClick={onActivate}
      onMouseDown={handleMouseDown}
    >
      <span className="min-w-0 flex-1 truncate">{tab.title}</span>

      {/* 关闭按钮 — hover 或激活时显示 */}
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        className={cn(
          "flex h-4 w-4 min-w-0 shrink-0 items-center justify-center rounded-sm",
          isActive || !isOnly
            ? "opacity-0 group-hover:opacity-100 hover:bg-default-200"
            : "opacity-0",
        )}
        onPress={onClose}
        aria-label={`${isZh ? "关闭" : "Close"} ${tab.title}`}
      >
        <X className="h-[8px] w-[8px]" />
      </Button>

      {/* 激活态底部无线（与内容区融合） */}
      {isActive && (
        <motion.div
          layoutId="active-tab-line"
          className="absolute bottom-0 left-0 right-0 h-[1px] bg-white"
        />
      )}
    </motion.div>
  );
}

// ── Tab 栏 ──────────────────────────────────────────────────
export default function AssetTabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
}: AssetTabBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => {
      setContainerWidth(node.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? node.clientWidth;
      setContainerWidth(nextWidth);
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, [tabs.length]);

  const tabWidth = useMemo(() => {
    if (!containerWidth || tabs.length === 0) {
      return TAB_DEFAULT_WIDTH_PX;
    }

    return Math.max(
      TAB_MIN_WIDTH_PX,
      Math.min(TAB_DEFAULT_WIDTH_PX, Math.floor(containerWidth / tabs.length)),
    );
  }, [containerWidth, tabs.length]);

  if (tabs.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="flex h-[34px] shrink-0 overflow-x-auto border-b border-divider bg-default-100"
    >
      <AnimatePresence initial={false}>
        {tabs.map((tab, index) => (
          <SortableTab
            key={tab.assetId}
            tab={tab}
            index={index}
            width={tabWidth}
            isActive={activeTabId === tab.assetId}
            isOnly={tabs.length === 1}
            onActivate={() => onActivate(tab.assetId)}
            onClose={() => onClose(tab.assetId)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
