"use client";

import { useMemo, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { ImageUploadGrid } from "@/components/wechat-editor/ImageUploadGrid";
import { LayoutProgressBar } from "@/components/wechat-editor/LayoutProgressBar";

type LayoutStyle = "interleave" | "grouped" | "hero";
type LayoutStatus = "idle" | "parsing" | "ocr" | "layout" | "done" | "error";

interface AILayoutPanelProps {
  open: boolean;
  onClose: () => void;
  onLayoutComplete: (html: string) => void;
  templateId?: string | null;
  paletteId?: string | null;
}

interface SsePayload {
  step?: LayoutStatus;
  message?: string;
  progress?: number;
  html?: string;
  error?: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function AILayoutPanel({
  open,
  onClose,
  onLayoutComplete,
  templateId,
  paletteId,
}: AILayoutPanelProps) {
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [style, setStyle] = useState<LayoutStyle>("interleave");
  const [status, setStatus] = useState<LayoutStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("等待开始");

  const canSubmit = useMemo(() => Boolean(docxFile) && status !== "parsing" && status !== "ocr" && status !== "layout", [docxFile, status]);

  if (!open) return null;

  const handleDocxChange = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) return;
    setDocxFile(file);
  };

  const handleImagesChange = (fileList: FileList | null) => {
    if (!fileList) return;
    const next = Array.from(fileList)
      .filter((file) => IMAGE_TYPES.has(file.type) && file.size <= 5 * 1024 * 1024)
      .slice(0, 20 - images.length);
    setImages((current) => [...current, ...next].slice(0, 20));
  };

  const handleStart = async () => {
    if (!docxFile) return;

    const form = new FormData();
    form.append("docx", docxFile);
    images.forEach((image) => {
      form.append("images", image);
    });
    form.append("style", style);
    if (templateId) {
      form.append("templateId", templateId);
    }
    if (paletteId) {
      form.append("paletteId", paletteId);
    }

    setStatus("parsing");
    setProgress(10);
    setProgressMessage("正在解析文稿...");

    try {
      const response = await fetch("/api/wechat-editor/layout", {
        method: "POST",
        body: form,
      });

      if (!response.ok || !response.body) {
        throw new Error(`请求失败（${response.status}）`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return;
          const payloadText = trimmed.replace(/^data:\s*/, "");
          if (!payloadText) return;

          try {
            const payload = JSON.parse(payloadText) as SsePayload;
            if (payload.step) setStatus(payload.step);
            if (typeof payload.progress === "number") setProgress(payload.progress);
            if (payload.message) setProgressMessage(payload.message);
            if (payload.step === "done" && payload.html) {
              setProgress(100);
              setProgressMessage("排版完成");
              onLayoutComplete(payload.html);
              onClose();
            }
            if (payload.step === "error") {
              setStatus("error");
              setProgressMessage(payload.error || "排版失败");
            }
          } catch {
            // 忽略解析失败行
          }
        });
      }
    } catch (error) {
      setStatus("error");
      setProgressMessage(error instanceof Error ? error.message : "排版失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-800">AI 一键排版</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral-500 hover:bg-neutral-100" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <p className="text-xs text-neutral-600">上传文稿（必选，.docx，10MB 内）</p>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-600 hover:bg-neutral-50">
              <Upload className="h-4 w-4" />
              <span>{docxFile ? docxFile.name : "点击上传 Word 文档"}</span>
              <input
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(event) => handleDocxChange(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-neutral-600">上传图片（可选，最多 20 张，每张 5MB）</p>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-600 hover:bg-neutral-50">
              <Upload className="h-4 w-4" />
              <span>点击上传图片/GIF</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(event) => handleImagesChange(event.target.files)}
              />
            </label>
            <ImageUploadGrid files={images} onRemove={(index) => setImages((current) => current.filter((_, i) => i !== index))} />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-neutral-600">排版风格</p>
            <div className="flex flex-wrap gap-3 text-sm text-neutral-700">
              <label className="inline-flex items-center gap-1.5"><input type="radio" checked={style === "interleave"} onChange={() => setStyle("interleave")} />图文穿插</label>
              <label className="inline-flex items-center gap-1.5"><input type="radio" checked={style === "grouped"} onChange={() => setStyle("grouped")} />图片集中</label>
              <label className="inline-flex items-center gap-1.5"><input type="radio" checked={style === "hero"} onChange={() => setStyle("hero")} />头图突出</label>
            </div>
          </div>

          {status !== "idle" ? <LayoutProgressBar progress={progress} message={progressMessage} /> : null}
        </div>

        <footer className="flex justify-end border-t border-neutral-200 px-4 py-3">
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D1D1F] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {status === "parsing" || status === "ocr" || status === "layout" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            开始 AI 排版
          </button>
        </footer>
      </div>
    </div>
  );
}
