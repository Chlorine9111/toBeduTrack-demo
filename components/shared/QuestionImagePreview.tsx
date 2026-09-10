"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

type QuestionImagePreviewProps = {
  src: string;
  alt?: string;
  className?: string;
  buttonClassName?: string;
  dialogImageClassName?: string;
};

export default function QuestionImagePreview({
  src,
  alt,
  className,
  buttonClassName,
  dialogImageClassName,
}: QuestionImagePreviewProps) {
  const { isZh } = useAppI18n();
  const [isOpen, setIsOpen] = useState(false);

  const resolvedAlt = alt?.trim() || (isZh ? "题目图片" : "Question image");

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(true);
        }}
        aria-label={isZh ? `查看大图：${resolvedAlt}` : `Open image preview: ${resolvedAlt}`}
        className={cn(
          "group inline-block max-w-full cursor-zoom-in rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
          buttonClassName,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={resolvedAlt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn(
            "max-w-full bg-white object-contain transition duration-150 group-hover:opacity-95",
            className,
          )}
        />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={isZh ? "题目图片预览" : "Question image preview"}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label={isZh ? "关闭图片预览" : "Close image preview"}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          <div
            className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={resolvedAlt}
              referrerPolicy="no-referrer"
              className={cn(
                "max-h-[84vh] max-w-[86vw] object-contain",
                dialogImageClassName,
              )}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
