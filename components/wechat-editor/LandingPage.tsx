"use client";

import { Sparkles } from "lucide-react";
import type { ImportMode, LandingState } from "@/lib/wechat-editor/types";

interface LandingPageProps {
  value: LandingState;
  onModeChange: (mode: ImportMode) => void;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  error?: string | null;
}

const MODE_OPTIONS: Array<{ id: ImportMode; label: string; description: string }> = [
  {
    id: "smart",
    label: "智能导入",
    description: "适合你已经有讲义、通知或活动草稿，我来帮你提炼结构并生成可编辑大纲。",
  },
  {
    id: "ai",
    label: "AI 导入",
    description: "适合你手里只有零散要点，我先帮你整理成公众号文章框架。",
  },
  {
    id: "generate",
    label: "直接生成",
    description: "适合你只有一个主题或目标，直接从一句话开始起草。",
  },
];

export function LandingPage({
  value,
  onModeChange,
  onTextChange,
  onSubmit,
  loading,
  error,
}: LandingPageProps) {
  const activeMode = MODE_OPTIONS.find((option) => option.id === value.mode) ?? MODE_OPTIONS[0];
  const ctaLabel = loading
    ? "处理中..."
    : value.mode === "generate"
      ? "直接生成大纲"
      : "继续配置导入";
  const helperText =
    value.mode === "generate"
      ? "将直接用默认语气和篇幅起草文章大纲，后续仍可继续修改。"
      : "下一步可以补充文档上传、语气或素材设置，然后再生成大纲。";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="inline-flex rounded-xl border border-[rgba(0,0,0,0.06)] bg-white p-1 shadow-xs">
        {MODE_OPTIONS.map((option) => {
          const active = value.mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onModeChange(option.id)}
              className={`rounded-lg px-4 py-2 text-sm transition ${
                active
                  ? "bg-[#1D1D1F] text-white"
                  : "text-[#6B6F76] hover:bg-[#F7F7F7]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="w-full rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAFA] px-5 py-4 text-sm leading-6 text-[#1D1D1F]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#1D1D1F]">
          <Sparkles className="h-4 w-4" />
          {activeMode.label}
        </div>
        <p className="mt-2">{activeMode.description}</p>
      </div>

      <div className="w-full rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4 shadow-xs">
        <textarea
          suppressHydrationWarning
          value={value.textInput}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={
            value.mode === "generate"
              ? "一句话描述你要发布的内容，例如：家长会后给家长的教学反馈"
              : value.mode === "ai"
                ? "输入你已有的主题、对象、语气和关键要点，我会先帮你整理成大纲"
                : "粘贴现有讲义、通知或活动文案；如果还没整理好，也可以下一步上传文档"
          }
          className="h-52 w-full resize-none rounded-xl border border-[rgba(0,0,0,0.06)] p-4 text-sm outline-hidden focus:border-[rgba(94,106,210,0.3)]"
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs text-[#6B6F76]">{value.textInput.length}/15000</p>
            <p className="text-xs text-[#6B6F76]">{helperText}</p>
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D1D1F] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a3a3c] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
