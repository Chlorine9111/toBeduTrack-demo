"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { BookOpenText } from "lucide-react";
import { Button, Spinner } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ContentAsset } from "@/lib/content-assets/types";
import * as assetClient from "@/lib/content-assets/client";
import AssetViewerHeader from "@/components/main/content-assets/AssetViewerHeader";
import AssetPdfViewer from "@/components/main/content-assets/AssetPdfViewer";
import AssetTextViewer from "@/components/main/content-assets/AssetTextViewer";
import FlashcardViewer from "@/components/main/content-assets/FlashcardViewer";

type AssetViewerPanelProps = {
  assetId: string | null;
  onClose: () => void;
};

function isPdf(asset: ContentAsset) {
  if (asset.mimeType === "application/pdf") return true;
  if (asset.fileType === "pdf") return true;
  if (asset.fileName && /\.pdf$/i.test(asset.fileName)) return true;
  return false;
}


export default function AssetViewerPanel({
  assetId,
  onClose,
}: AssetViewerPanelProps) {
  const { isZh } = useAppI18n();
  const router = useRouter();
  const [asset, setAsset] = useState<ContentAsset | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAsset = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    try {
      const result = await assetClient.getAsset(id);
      // API 可能返回 { asset } 包裹或直接返回 ContentAsset
      const resolved =
        (result as unknown as { asset?: ContentAsset }).asset ?? result;
      setAsset(resolved);

      if (resolved.storageBucket && resolved.storagePath) {
        try {
          const url = await assetClient.getAssetSignedUrl(id);
          setSignedUrl(url);
        } catch {
          // 签名 URL 获取失败不阻塞面板
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isZh]);

  useEffect(() => {
    if (assetId) {
      loadAsset(assetId);
    } else {
      setAsset(null);
      setSignedUrl(null);
      setError(null);
    }
  }, [assetId, loadAsset]);

  return (
    <AnimatePresence>
      {assetId ? (
        <>
          <motion.button
            key="overlay"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-900/36"
            onClick={onClose}
            aria-label={isZh ? "关闭面板" : "Close panel"}
          />
          <motion.aside
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-divider bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] md:max-w-[420px]"
          >
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-medium text-rose-600">
                  {isZh ? "加载失败" : "Failed to load"}
                </p>
                <p className="text-xs text-default-400">{error}</p>
              </div>
            ) : asset ? (
              <>
                <AssetViewerHeader asset={asset} onClose={onClose} />

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {typeof (asset.metadata as Record<string, unknown>)?.flashcard_set_id === "string" ? (
                    <FlashcardViewer setId={(asset.metadata as Record<string, unknown>).flashcard_set_id as string} />
                  ) : isPdf(asset) && signedUrl ? (
                    <AssetPdfViewer fileUrl={signedUrl} />
                  ) : asset.rawText ? (
                    <AssetTextViewer
                      rawText={asset.rawText}
                      fileType={asset.fileType}
                      fileName={asset.fileName}
                    />
                  ) : signedUrl && isPdf(asset) ? (
                    <AssetPdfViewer fileUrl={signedUrl} />
                  ) : (
                    <div className="flex items-center justify-center rounded-xl border border-dashed border-divider py-10 text-sm text-default-400">
                      {isZh ? "暂无可预览的内容" : "No preview available"}
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-divider px-4 py-2.5">
                  <div className="flex items-center justify-end">
                    <Button
                      onPress={() =>
                        router.push(
                          `/main/agent?refAssetId=${encodeURIComponent(asset.id)}`,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
                    >
                      <BookOpenText className="h-4 w-4" />
                      {isZh ? "引用到 Agent" : "Add to Agent"}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
