"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SubjectComboboxProps = {
  value: string;
  options: readonly string[];
  popularOptions: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SubjectCombobox({
  value,
  options,
  popularOptions,
  onChange,
  placeholder = "搜索学科",
}: SubjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filtered = options.filter((item) =>
    normalizedQuery
      ? normalizedQuery
          .split(/\s+/)
          .every((keyword) => item.toLowerCase().includes(keyword))
      : true,
  );

  const popularMatches = filtered.filter((item) => popularOptions.includes(item));
  const otherMatches = filtered.filter((item) => !popularOptions.includes(item));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border px-3 text-left text-sm"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition", open ? "rotate-180" : "")} />
      </button>

      {open ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-3">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                className="w-full bg-transparent text-sm outline-hidden"
              />
            </label>
          </div>

          <div className="max-h-80 overflow-y-auto p-3">
            {popularMatches.length > 0 ? (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  热门学科
                </p>
                <div className="space-y-1">
                  {popularMatches.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                        subject === value ? "bg-slate-950 text-white" : "hover:bg-slate-50 text-slate-700",
                      )}
                      onClick={() => {
                        onChange(subject);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="truncate">{subject}</span>
                      <span
                        className={cn(
                          "ml-3 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          subject === value ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500",
                        )}
                      >
                        推荐
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {otherMatches.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  全部学科
                </p>
                <div className="space-y-1">
                  {otherMatches.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      className={cn(
                        "block w-full rounded-xl px-3 py-2 text-left text-sm transition",
                        subject === value ? "bg-slate-950 text-white" : "hover:bg-slate-50 text-slate-700",
                      )}
                      onClick={() => {
                        onChange(subject);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="block truncate">{subject}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                没找到匹配学科。你也可以直接在底部 AI 助手里输入完整学科名称。
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
