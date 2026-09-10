"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const ACCEPTED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp",
]);

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

type Props = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

function validateFile(file: File, isZh: boolean): string | null {
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!ACCEPTED_TYPES.has(file.type) && !ACCEPTED_EXTENSIONS.has(ext)) {
    return isZh
      ? `不支持的文件类型：${file.name}`
      : `Unsupported file type: ${file.name}`;
  }
  if (file.size > MAX_SIZE) {
    return isZh
      ? `文件过大（最大 50MB）：${file.name}`
      : `File is too large (max 50MB): ${file.name}`;
  }
  return null;
}

export default function AssetUploadZone({ onFiles, disabled }: Props) {
  const { isZh } = useAppI18n();
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files: File[] = [];
      const errors: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const error = validateFile(fileList[i], isZh);
        if (error) {
          errors.push(error);
        } else {
          files.push(fileList[i]);
        }
      }

      if (errors.length > 0) {
        alert(errors.join("\n"));
      }
      if (files.length > 0) {
        onFiles(files);
      }
    },
    [isZh, onFiles],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFiles],
  );

  return (
    <div
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg transition-all duration-150",
        isDragOver
          ? "h-[120px] border-[1.5px] border-accent bg-accent/4"
          : "h-[100px] border border-dashed border-foreground/10 bg-surface hover:border-foreground/20 hover:bg-white hover:shadow-sm",
        disabled && "pointer-events-none opacity-50",
      )}
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Upload
        className={cn(
          "h-5 w-5 transition-colors duration-150",
          isDragOver
            ? "text-accent"
            : "text-foreground/25 group-hover:text-foreground/40",
        )}
      />

      {isDragOver ? (
        <span className="text-[13px] font-medium text-accent">
          {isZh ? "松开以上传文件" : "Drop files to upload"}
        </span>
      ) : (
        <>
          <span className="text-[13px] font-medium text-foreground/55">
            {isZh ? "拖拽文件到此处或点击上传" : "Drag files here or click to upload"}
          </span>
          <span className="text-[11px] text-foreground/30">
            {isZh
              ? "PDF、Word、图片、文本 — 最大 50 MB"
              : "PDF, Word, images, and text up to 50 MB"}
          </span>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />
    </div>
  );
}
