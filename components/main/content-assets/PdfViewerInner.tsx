"use client";

import { Download, ExternalLink } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";

type PdfViewerInnerProps = {
  fileUrl: string;
};

export default function PdfViewerInner({ fileUrl }: PdfViewerInnerProps) {
  const { isZh } = useAppI18n();

  return (
    <div
      data-testid="content-asset-pdf-native"
      className="flex h-full min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex items-center justify-between rounded-xl border border-divider bg-[rgba(255,255,255,0.92)] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {isZh ? "PDF 原生预览" : "Native PDF Preview"}
          </p>
          <p className="mt-1 text-xs text-default-500">
            {isZh
              ? "使用浏览器内置 PDF 查看器，避免额外渲染引擎带来的兼容问题。"
              : "Uses the browser's built-in PDF viewer to avoid compatibility issues from extra rendering engines."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={fileUrl}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-default-50"
          >
            <Download className="h-3.5 w-3.5" />
            {isZh ? "下载" : "Download"}
          </a>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent/90"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {isZh ? "新窗口打开" : "Open in New Window"}
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-divider bg-white">
        <iframe
          src={fileUrl}
          title={isZh ? "PDF 原生预览" : "Native PDF Preview"}
          className="h-full min-h-[520px] w-full md:min-h-[640px]"
        />
      </div>
    </div>
  );
}
