"use client";

import dynamic from "next/dynamic";

const PdfViewerInner = dynamic(
  () => import("@/components/main/content-assets/PdfViewerInner"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] animate-pulse rounded-xl bg-slate-100" />
    ),
  },
);

type AssetPdfViewerProps = {
  fileUrl: string;
};

export default function AssetPdfViewer({ fileUrl }: AssetPdfViewerProps) {
  return <PdfViewerInner fileUrl={fileUrl} />;
}
