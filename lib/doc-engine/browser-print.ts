"use client";

import type { DocumentLayoutConfig } from "@/lib/doc-engine/block-types";
import type { DocumentModel } from "@/lib/doc-engine/block-types";
import { downloadBlob, exportDocumentPdfBlob } from "@/lib/doc-engine/client-pdf-export";

function escapeAttributeValue(value: string) {
  if (typeof window !== "undefined" && window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function collectHeadMarkup() {
  return Array.from(
    document.head.querySelectorAll('style, link[rel="stylesheet"]'),
  )
    .map((node) => node.outerHTML)
    .join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripPrintHiddenNodes(root: HTMLElement) {
  root
    .querySelectorAll("[data-print-hide], .doc-engine-selection-menu")
    .forEach((node) => node.remove());
}

function buildPrintHtml(container: HTMLElement, title: string) {
  const clonedPage = container.cloneNode(true) as HTMLElement;
  stripPrintHiddenNodes(clonedPage);

  const headMarkup = collectHeadMarkup();
  const printTitle = title.trim() || "Document";

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(printTitle)}</title>
    <base href="${window.location.origin}" />
    ${headMarkup}
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #f5f1e8;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .doc-engine-print-root {
        padding: 24px;
        position: relative;
      }

      .doc-engine-print-root .doc-engine-page {
        margin: 0 auto;
      }

      /* Deskmate 品牌水印 — 右下角 */
      .deskmate-export-watermark {
        position: fixed;
        bottom: 4px;
        right: 6px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 7px;
        opacity: 0.55;
        pointer-events: none;
        z-index: 9999;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .deskmate-export-watermark .wm-powered {
        font-family: "Palatino", "Georgia", serif;
        font-style: italic;
        font-size: 6pt;
        color: #858481;
        letter-spacing: 0.04em;
        line-height: 1;
      }

      .deskmate-export-watermark .wm-brand-wrap {
        display: flex;
        align-items: center;
      }

      .deskmate-export-watermark .wm-d-svg {
        width: 13px;
        height: 13px;
        fill: none;
        stroke: #3B2A22;
        stroke-width: 2.2px;
        stroke-linejoin: round;
        margin-right: 1.5px;
        transform: translateY(-1px);
      }

      .deskmate-export-watermark .wm-brand {
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: #3B2A22;
        letter-spacing: 0.02em;
        line-height: 1;
      }

      @media print {
        html, body {
          background: white;
        }

        .doc-engine-print-root {
          padding: 0;
        }

        .doc-engine-print-root .doc-engine-page {
          max-width: none !important;
          width: auto !important;
          min-height: auto !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        .deskmate-export-watermark {
          position: fixed;
          bottom: 2mm;
          right: 2mm;
          opacity: 0.25;
        }
      }
    </style>
  </head>
  <body>
    <div class="doc-engine-print-root" data-print-content="true" data-print-shell="true">${clonedPage.outerHTML}</div>
    <div class="deskmate-export-watermark" aria-hidden="true">
      <span class="wm-powered">powered by</span>
      <div class="wm-brand-wrap">
        <svg class="wm-d-svg" xmlns="http://www.w3.org/2000/svg" viewBox="2 2 20 20"><path d="M20 4 L20 20 L4 20 Z"/></svg>
        <span class="wm-brand">eskmate</span>
      </div>
    </div>
  </body>
</html>`;
}

function getDocumentContainer(artifactId: string) {
  const escapedArtifactId = escapeAttributeValue(artifactId);
  const container = document.querySelector(
    `[data-artifact-document-id="${escapedArtifactId}"] [data-doc-engine-page]`,
  );
  if (!(container instanceof HTMLElement)) {
    throw new Error("当前文档还没有完成渲染，暂时无法导出。");
  }
  return container;
}

export function buildDocumentPrintHtml(params: {
  artifactId: string;
  title: string;
}) {
  const container = getDocumentContainer(params.artifactId);
  return buildPrintHtml(container, params.title);
}

function printWithWindow(html: string) {
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    return false;
  }

  previewWindow.document.open();
  previewWindow.document.write(`${html}
    <script>
      window.addEventListener("load", function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 250);
      });

      window.addEventListener("afterprint", function () {
        window.close();
      });
    </script>`);
  previewWindow.document.close();
  return true;
}

function printWithIframe(html: string) {
  const iframe = window.document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";

  const cleanup = () => {
    iframe.remove();
  };

  iframe.onload = () => {
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(cleanup, 1000);
      }
    }, 250);
  };

  window.document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    cleanup();
    throw new Error("打印 iframe 初始化失败，请稍后重试。");
  }

  doc.open();
  doc.write(html);
  doc.close();
}

export function openDocumentPrintPreview(params: {
  artifactId: string;
  title: string;
}) {
  const html = buildDocumentPrintHtml(params);
  if (printWithWindow(html)) {
    return;
  }

  printWithIframe(html);
}

export async function exportDocumentPdf(params: {
  artifactId: string;
  title: string;
  layoutConfig: DocumentLayoutConfig;
}) {
  const html = buildDocumentPrintHtml({
    artifactId: params.artifactId,
    title: params.title,
  });
  await exportDocumentPdfBlob({
    html,
    title: params.title,
    layoutConfig: params.layoutConfig,
  });
}

export async function exportRubricPdf(params: {
  document: DocumentModel;
  title: string;
  pageSize?: "A4" | "Letter";
}) {
  const response = await fetch("/api/doc/export-rubric-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      document: params.document,
      title: params.title,
      pageSize: params.pageSize ?? params.document.layoutConfig.pageSize,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Rubric PDF 导出失败");
  }

  const blob = await response.blob();
  const filename = `${params.title.trim() || "rubric"}.pdf`;
  downloadBlob(blob, filename);
}
