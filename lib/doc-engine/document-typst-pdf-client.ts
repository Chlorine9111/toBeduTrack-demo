import type { DocumentModel } from "@/lib/doc-engine/block-types";

type ExportDocumentTypstPdfParams = {
  document: DocumentModel;
  title?: string | null;
  pageSize?: "A4" | "Letter";
};

export async function exportDocumentTypstPdf(params: ExportDocumentTypstPdfParams) {
  const response = await fetch("/api/doc/export-document-typst-pdf", {
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
    throw new Error(message || "Typst PDF 导出失败");
  }

  return response.blob();
}
