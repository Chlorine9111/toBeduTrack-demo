import {
  File,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Table2,
} from "lucide-react";
import type { ComponentType } from "react";
import type {
  ContentLibraryOriginEntity,
  ContentLibraryRenderer,
} from "@/lib/content-library/types";
import WorksheetProjectIcon from "./WorksheetProjectIcon";

type AssetIcon = ComponentType<{
  className?: string;
  size?: number;
}>;

export type FileTypeVisual = {
  /** 显示标签: "PDF", "文档", "图片", "文本", "AI 生成", "文件" */
  label: string;
  /** 语义颜色值 (hex 或 CSS 变量) */
  color: string;
  /** Tailwind 背景类（低透明度） */
  bgClass: string;
  /** Tailwind 文字类 */
  textClass: string;
  /** Lucide 图标组件 */
  icon: AssetIcon;
  /** HeroUI Chip color */
  chipColor: "danger" | "accent" | "warning" | "default";
  /** 树节点极简标签 */
  tag: string;
};

const VISUALS: Record<string, FileTypeVisual> = {
  reference: {
    label: "AI 生成",
    color: "#6940A5",
    bgClass: "bg-[#6940A5]/10",
    textClass: "text-[#6940A5]",
    icon: Sparkles,
    chipColor: "accent",
    tag: "ref",
  },
  pdf: {
    label: "PDF",
    color: "var(--heroui-danger)",
    bgClass: "bg-danger/10",
    textClass: "text-danger",
    icon: FileText,
    chipColor: "danger",
    tag: "pdf",
  },
  image: {
    label: "图片",
    color: "#D9730D",
    bgClass: "bg-[#D9730D]/10",
    textClass: "text-[#D9730D]",
    icon: ImageIcon,
    chipColor: "warning",
    tag: "img",
  },
  doc: {
    label: "文档",
    color: "#0B6E99",
    bgClass: "bg-[#0B6E99]/10",
    textClass: "text-[#0B6E99]",
    icon: FileText,
    chipColor: "accent",
    tag: "doc",
  },
  spreadsheet: {
    label: "表格",
    color: "#1D6F42",
    bgClass: "bg-[#1D6F42]/10",
    textClass: "text-[#1D6F42]",
    icon: Table2,
    chipColor: "accent",
    tag: "sheet",
  },
  text: {
    label: "文本",
    color: "#9B9DA4",
    bgClass: "bg-foreground/5",
    textClass: "text-foreground/50",
    icon: File,
    chipColor: "default",
    tag: "txt",
  },
  worksheetProject: {
    label: "组卷稿",
    color: "#37352F",
    bgClass: "bg-[#37352F]/8",
    textClass: "text-[#37352F]",
    icon: WorksheetProjectIcon,
    chipColor: "default",
    tag: "ws",
  },
  flashcard: {
    label: "闪卡",
    color: "#0F7B6C",
    bgClass: "bg-[#0F7B6C]/10",
    textClass: "text-[#0F7B6C]",
    icon: Sparkles,
    chipColor: "accent",
    tag: "card",
  },
  file: {
    label: "文件",
    color: "#9B9DA4",
    bgClass: "bg-foreground/5",
    textClass: "text-foreground/50",
    icon: File,
    chipColor: "default",
    tag: "file",
  },
};

export function isWorksheetProjectAssetLike(opts: {
  rendererType?: ContentLibraryRenderer | null;
  originEntityType?: ContentLibraryOriginEntity | null;
}) {
  return (
    opts.rendererType === "worksheet_project" ||
    opts.originEntityType === "worksheet_project"
  );
}

export function getFileTypeVisual(opts: {
  mimeType?: string | null;
  fileType?: string | null;
  assetSource?: string | null;
  refEntityType?: string | null;
  previewKind?: string | null;
  rendererType?: ContentLibraryRenderer | null;
  originEntityType?: ContentLibraryOriginEntity | null;
  isZh?: boolean;
}): FileTypeVisual {
  const isZh = opts.isZh ?? true;

  if (
    isWorksheetProjectAssetLike({
      rendererType: opts.rendererType,
      originEntityType: opts.originEntityType,
    })
  ) {
    return isZh
      ? VISUALS.worksheetProject
      : { ...VISUALS.worksheetProject, label: "Worksheet Project" };
  }

  if (opts.assetSource === "reference") {
    return {
      ...VISUALS.reference,
      label: opts.refEntityType ?? (isZh ? "AI 生成" : "AI Generated"),
    };
  }

  if (opts.previewKind === "flashcard") {
    return isZh
      ? VISUALS.flashcard
      : { ...VISUALS.flashcard, label: "Flashcards" };
  }

  if (opts.previewKind === "spreadsheet") {
    return isZh
      ? VISUALS.spreadsheet
      : { ...VISUALS.spreadsheet, label: "Spreadsheet" };
  }

  const ft = opts.fileType ?? opts.mimeType ?? "";
  if (ft.includes("pdf")) return VISUALS.pdf;
  if (
    ft.includes("excel") ||
    ft.includes("spreadsheet") ||
    ft.includes("sheet") ||
    ft.includes("csv")
  ) {
    return isZh
      ? VISUALS.spreadsheet
      : { ...VISUALS.spreadsheet, label: "Spreadsheet" };
  }
  if (ft.startsWith("image") || ft.includes("image")) {
    return isZh ? VISUALS.image : { ...VISUALS.image, label: "Image" };
  }
  if (ft.includes("doc") || ft.includes("word")) {
    return isZh ? VISUALS.doc : { ...VISUALS.doc, label: "Document" };
  }
  if (ft.includes("text") || ft.includes("markdown")) {
    return isZh ? VISUALS.text : { ...VISUALS.text, label: "Text" };
  }

  return isZh ? VISUALS.file : { ...VISUALS.file, label: "File" };
}

export function getFileTypeVisualByPreviewKind(previewKind: string): FileTypeVisual {
  return VISUALS[previewKind] ?? VISUALS.file;
}
