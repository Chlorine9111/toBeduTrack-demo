"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Upload, ImagePlus } from "lucide-react";

export interface SmartImportSubmitPayload {
  text: string;
  file: File | null;
  images: File[];
}

interface SmartImportDialogProps {
  open: boolean;
  initialText: string;
  onClose: () => void;
  onConfirm: (payload: SmartImportSubmitPayload) => void;
}

export function SmartImportDialog({
  open,
  initialText,
  onClose,
  onConfirm,
}: SmartImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);

  useEffect(() => {
    if (open) {
      setText(initialText);
    }
  }, [open, initialText]);

  const imagePreviewUrls = useMemo(
    () => images.map((image) => URL.createObjectURL(image)),
    [images],
  );

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  if (!open) return null;

  const canConfirm = text.trim().length > 0 || file !== null;

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files).filter((item) =>
      item.type.startsWith("image/"),
    );
    if (files.length > 0) {
      setImages((current) => [...current, ...files].slice(0, 20));
    }
  };

  const handleTextFileUpload = async (nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.name.match(/\.(docx|txt)$/i)) return;
    setFile(nextFile);

    if (nextFile.name.toLowerCase().endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => {
        const loaded = typeof reader.result === "string" ? reader.result : "";
        setText((current) => (current ? `${current}\n\n${loaded}` : loaded));
      };
      reader.readAsText(nextFile);
    } else if (nextFile.name.toLowerCase().endsWith(".docx")) {
      try {
        const mammothModule = await import("mammoth");
        const mammoth = mammothModule.default || mammothModule;
        const arrayBuffer = await nextFile.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const loaded = result.value || "";
        if (loaded) {
          setText((current) => (current ? `${current}\n\n${loaded}` : loaded));
        }
      } catch (error) {
        console.error("提取 docx 文本失败:", error);
      }
    }
  };

  return (
    <div
      data-testid="smart-import-dialog"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div className="my-4 grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl grid-cols-1 gap-4 overflow-y-auto rounded-xl bg-white p-4 shadow-xl md:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <h3 className="text-sm font-semibold text-neutral-800">方式一：文本输入</h3>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onPaste={handlePaste}
              placeholder="请输入想要排版的文案，可以粘贴图片"
              className="h-48 w-full resize-none rounded-lg border border-neutral-200 p-3 text-sm outline-hidden focus:border-[rgba(94,106,210,0.3)] md:h-72"
            />
            <p className="text-right text-xs text-neutral-500">{text.length}/10000</p>
          </section>

          <section className="space-y-3 rounded-lg border border-neutral-200 p-3">
            <h3 className="text-sm font-semibold text-neutral-800">方式二：文档上传</h3>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-600 hover:bg-neutral-50">
              <Upload className="h-4 w-4" />
              <span>{file ? file.name : "上传 Word/TXT 文档（9MB 内）"}</span>
              <input
                type="file"
                accept=".docx,.txt"
                className="hidden"
                onChange={(event) => void handleTextFileUpload(event.target.files?.[0] ?? null)}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-600 hover:bg-neutral-50">
              <ImagePlus className="h-4 w-4" />
              <span>附加图片素材（可选）</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const next = Array.from(event.target.files || []).filter((item) =>
                    item.type.startsWith("image/"),
                  );
                  setImages((current) => [...current, ...next].slice(0, 20));
                }}
              />
            </label>

            <div className="grid grid-cols-5 gap-2">
              {images.map((image, index) => {
                const url = imagePreviewUrls[index];
                return (
                  <button
                    type="button"
                    key={`${image.name}-${index}`}
                    onClick={() => {
                      setImages((current) => current.filter((_, i) => i !== index));
                    }}
                    className="relative h-14 overflow-hidden rounded border border-neutral-200"
                    title="点击移除"
                  >
                    {url ? (
                      <Image
                        src={url}
                        alt={image.name}
                        fill
                        unoptimized
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <footer className="sticky bottom-0 col-span-full flex justify-end gap-2 border-t border-neutral-200 bg-white pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ text, file, images })}
              disabled={!canConfirm}
              className="rounded-lg bg-[#1D1D1F] px-3 py-2 text-sm font-medium text-white hover:bg-[#3a3a3c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canConfirm ? "确定" : "请输入内容或上传文档"}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
