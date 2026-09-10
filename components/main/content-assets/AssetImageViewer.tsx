"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Copy, Check, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";

type AssetImageViewerProps = {
  fileUrl: string;
  rawText?: string | null;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export default function AssetImageViewer({ fileUrl, rawText }: AssetImageViewerProps) {
  const { isZh } = useAppI18n();
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) =>
      clampScale(
        e.deltaY < 0 ? prev * (1 + ZOOM_STEP) : prev / (1 + ZOOM_STEP),
      ),
    );
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
  }, [translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setTranslate({
      x: dragStart.current.tx + (e.clientX - dragStart.current.x),
      y: dragStart.current.ty + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleDoubleClick = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const handleCopyOcr = useCallback(async () => {
    if (!rawText) return;
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默
    }
  }, [rawText]);

  const showZoomBadge = scale !== 1;

  return (
    <div
      data-testid="content-asset-image-view"
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex shrink-0 items-center justify-between rounded-xl border border-divider bg-white/92 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {isZh ? "图片预览" : "Image Preview"}
          </p>
          <p className="mt-1 text-xs text-default-500">
            {isZh ? "滚轮缩放，拖拽平移，双击恢复默认视图。" : "Use the wheel to zoom, drag to pan, and double-click to reset."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => setScale((prev) => clampScale(prev / (1 + ZOOM_STEP)))}
            aria-label={isZh ? "缩小" : "Zoom out"}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={handleDoubleClick}
            className="min-w-0 gap-1.5 px-3 text-[12px]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {isZh ? "重置" : "Reset"}
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => setScale((prev) => clampScale(prev * (1 + ZOOM_STEP)))}
            aria-label={isZh ? "放大" : "Zoom in"}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        data-testid="content-asset-image-stage"
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-divider bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(241,245,249,0.92))]"
        style={{ cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "zoom-in" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          data-testid="content-asset-image"
          src={fileUrl}
          alt=""
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-[90%] max-w-[95%] select-none object-contain shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
          style={{
            transform: `translate(-50%, -50%) translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />

        {showZoomBadge && (
          <div className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
            {Math.round(scale * 100)}%
          </div>
        )}
      </div>

      {rawText && (
        <div className="shrink-0 border-t border-divider">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setOcrOpen((prev) => !prev)}
            className="flex h-auto w-full items-center justify-between rounded-none px-4 py-2 text-[12px] text-foreground-400 hover:text-foreground"
          >
            <span>{ocrOpen ? (isZh ? "收起识别文字" : "Hide recognized text") : (isZh ? "查看识别文字" : "Show recognized text")}</span>
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: ocrOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </Button>
          <AnimatePresence>
            {ocrOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="relative max-h-[200px] overflow-y-auto px-4 pb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => void handleCopyOcr()}
                    className="absolute top-0 right-4 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-foreground-400 hover:bg-default-200 hover:text-foreground"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? (isZh ? "已复制" : "Copied") : (isZh ? "复制" : "Copy")}
                  </Button>
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-default-500 pr-14">
                    {rawText}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
