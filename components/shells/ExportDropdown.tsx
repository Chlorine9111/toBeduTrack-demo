"use client";

import { useState } from "react";
import { FileText, FileDown, Printer, Copy, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// -- Export types --
export type ExportFormat = "pdf" | "docx" | "print" | "clipboard";
export type PaperSize = "a4" | "letter";
export type ExportLayout = "standard" | "compact";
export type ExportVersion = "teacher" | "student" | "classroom";

export type ExportOptions = {
  paper: PaperSize;
  layout: ExportLayout;
  version: ExportVersion;
};

type ExportDropdownProps = {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, options: ExportOptions) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
};

const FORMAT_OPTIONS = [
  { value: "pdf" as const, label: "PDF", icon: FileText },
  { value: "docx" as const, label: "DOCX", icon: FileDown },
  { value: "print" as const, label: "Print", icon: Printer },
  { value: "clipboard" as const, label: "Copy to Clipboard", icon: Copy },
];

const VERSION_OPTIONS = [
  { value: "teacher" as const, label: "Teacher" },
  { value: "student" as const, label: "Student" },
  { value: "classroom" as const, label: "Classroom" },
];

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-2 px-2">
      <div className="mb-1.5 text-[11px] text-default-400">{label}</div>
      <div className="flex rounded-lg bg-default-100 p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-md py-1 text-[11px] font-medium transition-all",
              value === opt.value
                ? "bg-white text-foreground shadow-xs"
                : "text-default-400 hover:text-default-500",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ExportDropdown({
  open,
  onClose,
  onExport,
}: ExportDropdownProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [version, setVersion] = useState<ExportVersion>("teacher");
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [layout, setLayout] = useState<ExportLayout>("standard");

  if (!open) return null;

  return (
    <div
      className="flex w-[240px] flex-col rounded-lg border border-divider bg-white p-1 shadow-md"
    >
      {/* Format */}
      <div className="px-2 py-2">
        <span className="mb-1 block px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-default-400">
          Format
        </span>
        <div className="flex flex-col gap-0.5">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedFormat(opt.value)}
              className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-default-50"
            >
              <opt.icon className="h-4 w-4 text-default-400" />
              <span className="flex-1 text-left">{opt.label}</span>
              {selectedFormat === opt.value && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-2 h-px bg-default-100" />

      {/* Version */}
      <div className="px-2 py-2">
        <span className="mb-1 block px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-default-400">
          Version
        </span>
        <div className="flex flex-col gap-0.5">
          {VERSION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVersion(opt.value)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-default-50"
            >
              <span>{opt.label}</span>
              {version === opt.value && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-2 h-px bg-default-100" />

      {/* Settings */}
      <div className="px-2 py-2">
        <span className="mb-2 block px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-default-400">
          Settings
        </span>
        <SegmentedControl
          label="Paper Size"
          options={[
            { value: "a4", label: "A4" },
            { value: "letter", label: "Letter" },
          ]}
          value={paper}
          onChange={setPaper}
        />
        <SegmentedControl
          label="Layout"
          options={[
            { value: "standard", label: "Standard" },
            { value: "compact", label: "Compact" },
          ]}
          value={layout}
          onChange={setLayout}
        />
      </div>

      {/* Export CTA */}
      <div className="p-2 pt-0">
        <button
          type="button"
          onClick={() => {
            onExport(selectedFormat, { paper, layout, version });
            onClose();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-2 text-sm font-semibold text-white transition-colors hover:bg-foreground/90 active:scale-[0.98]"
        >
          <Download className="h-[18px] w-[18px]" />
          Export
        </button>
      </div>
    </div>
  );
}
