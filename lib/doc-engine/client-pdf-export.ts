"use client";

import type { DocumentLayoutConfig } from "@/lib/doc-engine/block-types";

function sanitizeFileStem(value: string, fallback = "document") {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

export function buildPdfFileName(title: string, fallback = "document") {
  return `${sanitizeFileStem(title, fallback)}.pdf`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function requestDocumentPdfBlob(params: {
  html: string;
  title: string;
  layoutConfig: DocumentLayoutConfig;
}) {
  const response = await fetch("/api/doc/export-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html: params.html,
      title: params.title,
      layoutConfig: params.layoutConfig,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "PDF 导出失败");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf")) {
    throw new Error("导出响应不是 PDF 文件");
  }

  return response.blob();
}

export async function exportDocumentPdfBlob(params: {
  html: string;
  title: string;
  layoutConfig: DocumentLayoutConfig;
  fileName?: string;
}) {
  const blob = await requestDocumentPdfBlob(params);
  downloadBlob(blob, params.fileName || buildPdfFileName(params.title));
  return blob;
}
