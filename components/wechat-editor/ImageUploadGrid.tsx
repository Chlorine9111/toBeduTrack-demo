"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { X } from "lucide-react";

interface ImageUploadGridProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function ImageUploadGrid({ files, onRemove }: ImageUploadGridProps) {
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-2">
      {files.map((file, index) => {
        const src = previewUrls[index];
        return (
          <div key={`${file.name}-${index}`} className="relative h-20 overflow-hidden rounded border border-neutral-200 bg-neutral-50">
            <Image
              src={src}
              alt={file.name}
              fill
              unoptimized
              sizes="80px"
              className="object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
              aria-label="删除图片"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
