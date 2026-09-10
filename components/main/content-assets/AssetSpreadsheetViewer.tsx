"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type {
  ContentAssetSpreadsheetPreview,
  ContentAssetSpreadsheetSheet,
} from "@/lib/content-assets/types";

type AssetSpreadsheetViewerProps = {
  preview: ContentAssetSpreadsheetPreview | null;
  fileName?: string | null;
};

function buildSummaryLine(
  sheet: ContentAssetSpreadsheetSheet,
  sheetCount: number,
  isZh: boolean,
) {
  const rowsText = isZh
    ? `显示 ${sheet.visibleRows}/${sheet.totalRows} 行`
    : `Showing ${sheet.visibleRows}/${sheet.totalRows} rows`;
  const columnsText = isZh
    ? `${sheet.visibleColumns}/${sheet.totalColumns} 列`
    : `${sheet.visibleColumns}/${sheet.totalColumns} columns`;
  const sheetsText = isZh
    ? `${sheetCount} 个工作表`
    : `${sheetCount} sheet${sheetCount > 1 ? "s" : ""}`;

  return `${sheetsText} · ${rowsText} · ${columnsText}`;
}

export default function AssetSpreadsheetViewer({
  preview,
  fileName,
}: AssetSpreadsheetViewerProps) {
  const { isZh } = useAppI18n();
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);

  useEffect(() => {
    setActiveSheetName(preview?.sheets[0]?.name ?? null);
  }, [preview]);

  const activeSheet = useMemo(() => {
    if (!preview?.sheets.length) return null;
    return (
      preview.sheets.find((sheet) => sheet.name === activeSheetName) ??
      preview.sheets[0]
    );
  }, [activeSheetName, preview]);

  if (!preview?.sheets.length || !activeSheet) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-divider bg-default-50 text-sm text-default-400">
        {isZh ? "该表格没有可展示的内容" : "This spreadsheet has no previewable content"}
      </div>
    );
  }

  const rowsTruncated = activeSheet.visibleRows < activeSheet.totalRows;
  const columnsTruncated = activeSheet.visibleColumns < activeSheet.totalColumns;
  const rowNumberOffset = activeSheet.usedFirstRowAsHeader ? 2 : 1;

  return (
    <div
      data-testid="content-asset-spreadsheet-table"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-divider bg-white"
    >
      <div className="shrink-0 border-b border-divider px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">
          {fileName || activeSheet.name}
        </p>
        <p className="mt-1 text-xs text-default-500">
          {buildSummaryLine(activeSheet, preview.sheets.length, isZh)}
        </p>
      </div>

      {preview.sheets.length > 1 ? (
        <div className="shrink-0 overflow-x-auto border-b border-divider px-4 py-3">
          <div className="flex min-w-max items-center gap-2">
            {preview.sheets.map((sheet) => {
              const active = sheet.name === activeSheet.name;
              return (
                <button
                  key={sheet.name}
                  type="button"
                  onClick={() => setActiveSheetName(sheet.name)}
                  className={
                    active
                      ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white"
                      : "rounded-full border border-divider bg-white px-3 py-1.5 text-xs font-medium text-default-500 transition-colors hover:border-default-300 hover:text-foreground"
                  }
                >
                  {sheet.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {rowsTruncated || columnsTruncated ? (
        <div className="shrink-0 border-b border-divider bg-default-50 px-4 py-2 text-[12px] text-default-500">
          {isZh
            ? `为了保证预览性能，当前只显示前 ${activeSheet.visibleRows} 行和前 ${activeSheet.visibleColumns} 列。`
            : `For preview performance, only the first ${activeSheet.visibleRows} rows and ${activeSheet.visibleColumns} columns are shown.`}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-[12px] text-foreground">
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-divider bg-white px-3 py-2 text-left font-medium text-default-400">
                {isZh ? "行" : "Row"}
              </th>
              {activeSheet.headers.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  className="border-b border-divider bg-white px-3 py-2 text-left font-medium text-default-500"
                >
                  <div className="min-w-[120px] max-w-[280px] truncate">
                    {header}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.rows.length > 0 ? (
              activeSheet.rows.map((row, rowIndex) => (
                <tr key={`${activeSheet.name}-${rowIndex}`}>
                  <th className="sticky left-0 z-10 border-b border-r border-divider bg-default-50 px-3 py-2 text-left font-medium text-default-400">
                    {rowIndex + rowNumberOffset}
                  </th>
                  {activeSheet.headers.map((_, columnIndex) => (
                    <td
                      key={`${activeSheet.name}-${rowIndex}-${columnIndex}`}
                      className="border-b border-divider px-3 py-2 align-top text-[12px] leading-5 text-foreground"
                    >
                      <div className="min-w-[120px] max-w-[280px] whitespace-pre-wrap break-words">
                        {row[columnIndex] || "—"}
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={activeSheet.headers.length + 1}
                  className="px-4 py-12 text-center text-sm text-default-400"
                >
                  {isZh ? "这个工作表是空的" : "This sheet is empty"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
