"use client";

import { useEffect, useState } from "react";
import { Upload, Link2 } from "lucide-react";

export interface AIImportSubmitPayload {
  text: string;
  file: File | null;
  tone: string;
  paragraphCount: number;
}

interface AIImportDialogProps {
  open: boolean;
  initialText: string;
  onClose: () => void;
  onConfirm: (payload: AIImportSubmitPayload) => void;
}

const TONE_OPTIONS = ["常规", "正式", "活泼", "学术"];

export function AIImportDialog({
  open,
  initialText,
  onClose,
  onConfirm,
}: AIImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [tone, setTone] = useState("常规");
  const [paragraphCount, setParagraphCount] = useState(6);

  useEffect(() => {
    if (open) {
      setText(initialText);
    }
  }, [open, initialText]);

  if (!open) return null;

  const canConfirm = text.trim().length > 0 || file !== null;

  return (
    <div
      data-testid="ai-import-dialog"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div className="my-4 grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl grid-cols-1 gap-4 overflow-y-auto rounded-xl bg-white p-4 shadow-xl md:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <h3 className="text-sm font-semibold text-neutral-800">方式一：文本输入</h3>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="请输入你要导入的内容，AI 会提取要点并重新撰写文章。"
              className="h-48 w-full resize-none rounded-lg border border-neutral-200 p-3 text-sm outline-hidden focus:border-[rgba(94,106,210,0.3)] md:h-72"
            />
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <label className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1">
                <Link2 className="h-3 w-3" />
                链接导入（预留）
              </label>
              <span>{text.length}/15000</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <label className="space-y-1 text-xs text-neutral-600">
                语气
                <select
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                  className="h-8 w-full rounded border border-neutral-200 px-2 text-sm"
                >
                  {TONE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-neutral-600">
                生成段落（6±）
                <input
                  type="number"
                  min={4}
                  max={12}
                  value={paragraphCount}
                  onChange={(event) => setParagraphCount(Number(event.target.value) || 6)}
                  className="h-8 w-full rounded border border-neutral-200 px-2 text-sm"
                />
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-neutral-200 p-3">
            <h3 className="text-sm font-semibold text-neutral-800">方式二：文档导入</h3>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-600 hover:bg-neutral-50">
              <Upload className="h-4 w-4" />
              <span>{file ? file.name : "上传 Word/PDF/TXT（9MB 内）"}</span>
              <input
                type="file"
                accept=".docx,.pdf,.txt"
                className="hidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  if (!nextFile) return;
                  setFile(nextFile);

                  const name = nextFile.name.toLowerCase();
                  if (name.endsWith(".txt")) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const loaded = typeof reader.result === "string" ? reader.result : "";
                      if (loaded) {
                        setText((current) => (current ? `${current}\n\n${loaded}` : loaded));
                      }
                    };
                    reader.readAsText(nextFile);
                  } else if (name.endsWith(".docx")) {
                    void (async () => {
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
                    })();
                  }
                }}
              />
            </label>
            <p className="text-xs text-neutral-500">
              AI 会根据文档内容自动提取重点并扩写为完整公众号文章。
            </p>
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
              onClick={() => onConfirm({ text, file, tone, paragraphCount })}
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
