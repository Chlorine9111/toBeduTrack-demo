"use client";

import type { ArticleOutline, OutlineBlockType } from "@/lib/wechat-editor/types";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

interface OutlineEditorProps {
  outline: ArticleOutline;
  loading?: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  onChange: (outline: ArticleOutline) => void;
  onNext: () => void;
}

const LABEL_MAP: Record<string, string> = {
  "article-title": "文章标题",
  "hero-title": "头图标题",
  "hero-subtitle": "头图副标题",
  intro: "引言",
  "section-title": "正文标题",
  "section-content": "正文内容",
  "image-placeholder": "配图位",
  divider: "分割线",
  blockquote: "引用",
};

const SWITCHABLE_TYPES: OutlineBlockType[] = [
  "section-title",
  "section-content",
  "intro",
  "blockquote",
  "divider",
];

const FIXED_TYPES: OutlineBlockType[] = [
  "article-title",
  "hero-title",
  "hero-subtitle",
];

export function OutlineEditor({
  outline,
  loading,
  onBack,
  onRegenerate,
  onChange,
  onNext,
}: OutlineEditorProps) {
  const moveBlock = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= outline.blocks.length) return;
    const next = [...outline.blocks];
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    onChange({ ...outline, blocks: next });
  };

  const deleteBlock = (index: number) => {
    onChange({ ...outline, blocks: outline.blocks.filter((_, i) => i !== index) });
  };

  const addBlock = (afterIndex: number) => {
    const newBlock = {
      id: crypto.randomUUID(),
      type: "section-content" as OutlineBlockType,
      content: "",
      editable: true,
    };
    const next = [...outline.blocks];
    next.splice(afterIndex + 1, 0, newBlock);
    onChange({ ...outline, blocks: next });
  };

  const changeBlockType = (index: number, newType: OutlineBlockType) => {
    const next = [...outline.blocks];
    next[index] = { ...next[index], type: newType };
    onChange({ ...outline, blocks: next });
  };

  const isFixed = (type: string) => FIXED_TYPES.includes(type as OutlineBlockType);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          返回
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          className="rounded-lg border border-[rgba(0,0,0,0.2)] px-3 py-2 text-sm text-[#1D1D1F] hover:bg-[#F7F7F7] disabled:opacity-50"
        >
          换个大纲
        </button>
      </header>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <label className="mb-3 block text-sm font-semibold text-neutral-800">文章标题</label>
        <input
          value={outline.title}
          onChange={(event) =>
            onChange({
              ...outline,
              title: event.target.value,
            })
          }
          className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm"
        />
      </section>

      <div className="space-y-1">
        {outline.blocks.map((block, index) => (
          <div key={block.id} className="group">
            <article className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-1.5">
                {isFixed(block.type) ? (
                  <span className="inline-flex rounded-full bg-[#F7F7F7] px-2 py-0.5 text-xs text-[#1D1D1F]">
                    {LABEL_MAP[block.type] || block.type}
                  </span>
                ) : (
                  <select
                    value={block.type}
                    onChange={(event) => changeBlockType(index, event.target.value as OutlineBlockType)}
                    className="rounded-full border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] px-2 py-0.5 text-xs text-[#1D1D1F] outline-hidden"
                  >
                    {SWITCHABLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LABEL_MAP[t] || t}
                      </option>
                    ))}
                  </select>
                )}

                <div className="ml-auto flex items-center gap-0.5">
                  {!isFixed(block.type) && index > 0 && (
                    <button
                      type="button"
                      onClick={() => moveBlock(index, -1)}
                      className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                      aria-label="上移"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isFixed(block.type) && index < outline.blocks.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveBlock(index, 1)}
                      className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                      aria-label="下移"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isFixed(block.type) && (
                    <button
                      type="button"
                      onClick={() => deleteBlock(index)}
                      className="rounded p-0.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <textarea
                value={block.content}
                onChange={(event) => {
                  const nextBlocks = [...outline.blocks];
                  nextBlocks[index] = {
                    ...nextBlocks[index],
                    content: event.target.value,
                  };
                  onChange({
                    ...outline,
                    blocks: nextBlocks,
                  });
                }}
                disabled={!block.editable}
                className="min-h-20 w-full resize-y rounded-lg border border-neutral-200 p-2 text-sm disabled:bg-neutral-100"
              />
            </article>

            <div className="flex justify-center py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => addBlock(index)}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-400 hover:border-[rgba(0,0,0,0.2)] hover:text-[#1D1D1F]"
                aria-label="在此处插入新段落"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <footer className="flex items-center justify-end">
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-[#1D1D1F] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a3a3c]"
        >
          下一步
        </button>
      </footer>
    </div>
  );
}
