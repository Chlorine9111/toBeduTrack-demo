import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { read, utils, type WorkSheet } from "xlsx";
import { jsonError } from "@/lib/api/response";
import { getTeacherIdentity } from "@/lib/api/teacher-context";
import type {
  ContentAssetSpreadsheetPreview,
  ContentAssetSpreadsheetSheet,
} from "@/lib/content-assets/types";
import { getAssetFileSource } from "@/lib/content-assets/store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_PREVIEW_ROWS = 200;
const MAX_PREVIEW_COLUMNS = 40;

function toCellText(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function buildSheetPreview(
  name: string,
  sheet: WorkSheet | undefined,
): ContentAssetSpreadsheetSheet {
  if (!sheet) {
    return {
      name,
      headers: ["A"],
      rows: [],
      totalRows: 0,
      totalColumns: 1,
      visibleRows: 0,
      visibleColumns: 1,
      usedFirstRowAsHeader: false,
    };
  }

  const matrix = utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][];
  const normalizedRows = matrix.map((row) =>
    Array.isArray(row) ? row.map((cell) => toCellText(cell)) : [],
  );
  const totalColumns = Math.max(
    normalizedRows.reduce((max, row) => Math.max(max, row.length), 0),
    1,
  );
  const visibleColumns = Math.min(totalColumns, MAX_PREVIEW_COLUMNS);
  const firstRow = normalizedRows[0] ?? [];
  const usedFirstRowAsHeader = firstRow.some((cell) => cell.trim().length > 0);
  const dataRows = usedFirstRowAsHeader ? normalizedRows.slice(1) : normalizedRows;
  const rows = dataRows
    .slice(0, MAX_PREVIEW_ROWS)
    .map((row) =>
      Array.from({ length: visibleColumns }, (_, index) => row[index] ?? ""),
    );
  const headers = Array.from({ length: visibleColumns }, (_, index) => {
    const label = usedFirstRowAsHeader ? firstRow[index] ?? "" : "";
    return label.trim() || utils.encode_col(index);
  });

  return {
    name,
    headers,
    rows,
    totalRows: dataRows.length,
    totalColumns,
    visibleRows: rows.length,
    visibleColumns,
    usedFirstRowAsHeader,
  };
}

async function loadSpreadsheetPreview(
  teacherId: string,
  assetId: string,
): Promise<ContentAssetSpreadsheetPreview> {
  const supabase = createAdminSupabaseClient();
  const asset = await getAssetFileSource({ teacherId, supabase }, assetId);

  if (!asset) {
    throw new Error("NOT_FOUND");
  }

  if (asset.assetSource === "reference") {
    throw new Error("ASSET_NOT_FILE_BACKED");
  }

  if (!asset.storageBucket || !asset.storagePath) {
    throw new Error("ASSET_NOT_FILE_BACKED");
  }

  const { data, error } = await supabase.storage
    .from(asset.storageBucket)
    .download(asset.storagePath);

  if (error || !data) {
    throw new Error("DOWNLOAD_FAILED");
  }

  const workbook = read(Buffer.from(await data.arrayBuffer()), {
    type: "buffer",
    cellDates: true,
    dense: true,
  });

  return {
    sheets: workbook.SheetNames.map((sheetName) =>
      buildSheetPreview(sheetName, workbook.Sheets[sheetName]),
    ),
  };
}

function getCachedSpreadsheetPreview(teacherId: string, assetId: string) {
  return unstable_cache(
    async () => loadSpreadsheetPreview(teacherId, assetId),
    ["content-assets-spreadsheet-preview", teacherId, assetId],
    {
      tags: [`content-assets:${teacherId}`],
      revalidate: 60 * 15,
    },
  )();
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherIdentity();

  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const { id } = await context.params;
    const preview = await getCachedSpreadsheetPreview(teacherId, id);
    return NextResponse.json(preview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("NOT_FOUND", "资产不存在", 404);
    }

    if (error instanceof Error && error.message === "ASSET_NOT_FILE_BACKED") {
      return jsonError(
        "ASSET_NOT_FILE_BACKED",
        "该内容不是可下载的表格原件",
        400,
      );
    }

    console.error("[content-assets/spreadsheet-preview] GET 失败", error);
    return jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "读取表格预览失败",
      500,
    );
  }
}
