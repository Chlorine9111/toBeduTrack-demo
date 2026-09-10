import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RenderedPage } from "./types";

const execFileAsync = promisify(execFile);
const PAGE_FILE_PATTERN = /^page-(\d+)\.png$/;

type RenderPdfPagesOptions = {
  scale?: number;
  maxPages?: number;
  pageNumbers?: number[];
};

function resolveDpi(scale: number) {
  return Math.max(72, Math.round(Math.max(scale, 0.5) * 72));
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return { width: 0, height: 0 };
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function renderPdfPages(
  pdfBuffer: Buffer,
  scaleOrOptions: number | RenderPdfPagesOptions = 2,
): Promise<RenderedPage[]> {
  const options =
    typeof scaleOrOptions === "number"
      ? { scale: scaleOrOptions }
      : scaleOrOptions;
  const scale = options.scale ?? 2;
  const workdir = await mkdtemp(join(tmpdir(), "tobtrack-pdftoppm-"));
  const inputPath = join(workdir, "input.pdf");
  const outputPrefix = join(workdir, "page");

  await writeFile(inputPath, pdfBuffer);

  try {
    const pageNumbers = Array.from(
      new Set(
        (options.pageNumbers ?? [])
          .map((pageNumber) => Math.floor(pageNumber))
          .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0),
      ),
    ).sort((left, right) => left - right);
    const firstPage =
      pageNumbers.length > 0
        ? pageNumbers[0]
        : Number.isFinite(options.maxPages) && (options.maxPages ?? 0) > 0
          ? 1
          : null;
    const lastPage =
      pageNumbers.length > 0
        ? pageNumbers[pageNumbers.length - 1]
        : Number.isFinite(options.maxPages) && (options.maxPages ?? 0) > 0
          ? Math.max(1, Math.floor(options.maxPages ?? 1))
          : null;
    const args = [
      "-png",
      "-r",
      String(resolveDpi(scale)),
    ];
    if (firstPage && lastPage) {
      args.push("-f", String(firstPage), "-l", String(lastPage));
    }
    args.push(inputPath, outputPrefix);
    await execFileAsync("pdftoppm", args);

    const pageFiles = (await readdir(workdir))
      .map((name) => {
        const match = name.match(PAGE_FILE_PATTERN);
        return match ? { name, pageNumber: Number(match[1]) } : null;
      })
      .filter((item): item is { name: string; pageNumber: number } => item !== null)
      .sort((left, right) => left.pageNumber - right.pageNumber);

    const filteredPageFiles = pageNumbers.length
      ? pageFiles.filter((item) => pageNumbers.includes(item.pageNumber))
      : pageFiles;

    if (filteredPageFiles.length === 0) {
      throw new Error("未生成任何 PDF 页面图片");
    }

    return Promise.all(
      filteredPageFiles.map(async ({ name, pageNumber }) => {
        const buffer = await readFile(join(workdir, name));
        const { width, height } = readPngDimensions(buffer);
        return {
          pageNumber,
          width,
          height,
          buffer,
        };
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`pdftoppm 渲染 PDF 失败: ${detail}`);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
