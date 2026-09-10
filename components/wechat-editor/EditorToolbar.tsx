"use client";

import type { Editor } from "@tiptap/core";
import {
  Download,
  Eye,
  Loader2,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Copy,
  WandSparkles,
  LayoutTemplate,
} from "lucide-react";
import { ThemeSelector } from "@/components/wechat-editor/ThemeSelector";
import type { EditorConfig } from "@/lib/wechat-editor/types";

interface EditorToolbarProps {
  config: EditorConfig;
  editor: Editor | null;
  onConfigChange: (config: EditorConfig) => void;
  onCopy: () => void;
  onExportMarkdown: () => void;
  onOpenLayoutPanel: () => void;
  isAIPanelVisible: boolean;
  onToggleAIPanel: () => void;
  onCreatePreview?: () => void;
  isPreviewLoading?: boolean;
  onBackToTemplate?: () => void;
  onApplyTemplate?: () => void;
  templateName?: string;
}

function updateConfig(
  config: EditorConfig,
  onConfigChange: (config: EditorConfig) => void,
  patch: Partial<EditorConfig>,
) {
  onConfigChange({
    ...config,
    ...patch,
  });
}

export function EditorToolbar({
  config,
  editor,
  onConfigChange,
  onCopy,
  onExportMarkdown,
  onOpenLayoutPanel,
  isAIPanelVisible,
  onToggleAIPanel,
  onCreatePreview,
  isPreviewLoading,
  onBackToTemplate,
  onApplyTemplate,
  templateName,
}: EditorToolbarProps) {
  return (
    <header className="flex min-h-12 flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={onToggleAIPanel}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 text-xs text-neutral-600 hover:bg-neutral-50"
      >
        {isAIPanelVisible ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
        AI 助手
      </button>

      <button
        type="button"
        onClick={onOpenLayoutPanel}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 text-xs text-neutral-700 hover:bg-neutral-50"
      >
        <WandSparkles className="h-3.5 w-3.5" />
        AI 排版
      </button>

      {onBackToTemplate ? (
        <button
          type="button"
          onClick={onBackToTemplate}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          模板库
        </button>
      ) : null}

      {onApplyTemplate ? (
        <button
          type="button"
          onClick={onApplyTemplate}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] px-2.5 text-xs text-[#1D1D1F] hover:bg-[#EFEFEF]"
        >
          应用模板
          {templateName ? <span className="max-w-20 truncate text-[11px] text-[#787774]">{templateName}</span> : null}
        </button>
      ) : null}

      <div className="mx-1 h-6 w-px bg-neutral-200" />

      <div className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
        <Palette className="h-3.5 w-3.5" />
        主题
      </div>
      <ThemeSelector
        value={config.theme}
        onChange={(theme) => updateConfig(config, onConfigChange, { theme })}
      />

      <select
        value={config.fontFamily}
        onChange={(event) =>
          updateConfig(config, onConfigChange, { fontFamily: event.target.value })
        }
        className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm"
        aria-label="字体选择"
      >
        <option value="'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif">思源黑体</option>
        <option value="'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif">苹方</option>
        <option value="'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif">微软雅黑</option>
        <option value="Georgia, 'Times New Roman', serif">Georgia</option>
      </select>

      <select
        value={config.fontSize}
        onChange={(event) => updateConfig(config, onConfigChange, { fontSize: event.target.value })}
        className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm"
        aria-label="字号选择"
      >
        {[
          "14px",
          "15px",
          "16px",
          "17px",
          "18px",
          "19px",
          "20px",
        ].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 text-xs text-neutral-600">
        主色
        <input
          type="color"
          value={config.primaryColor}
          onChange={(event) => updateConfig(config, onConfigChange, { primaryColor: event.target.value })}
          className="h-5 w-5 cursor-pointer rounded"
        />
      </label>

      <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={config.isUseIndent}
          onChange={(event) => updateConfig(config, onConfigChange, { isUseIndent: event.target.checked })}
        />
        首行缩进
      </label>

      <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={config.isUseJustify}
          onChange={(event) => updateConfig(config, onConfigChange, { isUseJustify: event.target.checked })}
        />
        两端对齐
      </label>

      <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={config.isCiteStatus}
          onChange={(event) => updateConfig(config, onConfigChange, { isCiteStatus: event.target.checked })}
        />
        外链脚注
      </label>

      <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={config.isShowLineNumber}
          onChange={(event) => updateConfig(config, onConfigChange, { isShowLineNumber: event.target.checked })}
        />
        代码行号
      </label>

      <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={config.isMacCodeBlock}
          onChange={(event) => updateConfig(config, onConfigChange, { isMacCodeBlock: event.target.checked })}
        />
        Mac 代码样式
      </label>

      <div className="ml-auto flex items-center gap-2">
        {onCreatePreview ? (
          <button
            type="button"
            onClick={onCreatePreview}
            disabled={!editor || isPreviewLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {isPreviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            预览链接
          </button>
        ) : null}

        <button
          type="button"
          onClick={onExportMarkdown}
          disabled={!editor}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          导出 MD
        </button>

        <button
          type="button"
          onClick={onCopy}
          disabled={!editor}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1D1D1F] px-3 text-xs font-medium text-white hover:bg-[#3a3a3c] disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" />
          复制微信格式
        </button>
      </div>
    </header>
  );
}
