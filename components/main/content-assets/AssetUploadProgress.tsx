"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { UploadItem } from "@/hooks/use-content-assets";
import { useAppI18n } from "@/lib/app-i18n/provider";
import AssetUploadItem from "./AssetUploadItem";

const MAX_VISIBLE = 3;
const AUTO_HIDE_DELAY = 3000;

type Props = {
  uploads: UploadItem[];
  onRetry?: (assetId: string) => void;
};

export default function AssetUploadProgress({ uploads, onRetry }: Props) {
  const { isZh } = useAppI18n();
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const activeUploads = uploads.filter(
    (u) => u.status === "uploading" || u.status === "processing",
  );
  const allDone = uploads.length > 0 && activeUploads.length === 0;

  useEffect(() => {
    if (allDone) {
      timerRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_DELAY);
    } else {
      setVisible(true);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [allDone]);

  useEffect(() => {
    if (uploads.some((u) => u.status === "uploading")) {
      setVisible(true);
    }
  }, [uploads]);

  if (uploads.length === 0 || !visible) return null;

  const visibleItems = uploads.slice(-MAX_VISIBLE);
  const hiddenCount = uploads.length - MAX_VISIBLE;
  const formatUploadingLabel = (count: number, prefix = "") =>
    isZh
      ? `${prefix}${count} 个文件上传中`
      : `${prefix}${count} file${count === 1 ? "" : "s"} uploading`;

  return (
    <div className="overflow-hidden rounded-lg border border-foreground/8 bg-white shadow-sm">
      {hiddenCount > 0 && (
        <div className="border-b border-foreground/6 px-3 py-2 text-[12px] font-medium text-foreground/50">
          {formatUploadingLabel(hiddenCount, "+")}
        </div>
      )}

      {activeUploads.length > 1 && hiddenCount <= 0 && (
        <div className="border-b border-foreground/6 px-3 py-2 text-[12px] font-medium text-foreground/50">
          {formatUploadingLabel(activeUploads.length)}
        </div>
      )}

      <AnimatePresence initial={false}>
        {visibleItems.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <AssetUploadItem
              item={item}
              onRetry={
                item.status === "failed" && item.asset?.id
                  ? () => onRetry?.(item.asset!.id)
                  : undefined
              }
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {allDone && (
        <div className="animate-ink-spread h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent bg-[length:200%_100%]" />
      )}
    </div>
  );
}
