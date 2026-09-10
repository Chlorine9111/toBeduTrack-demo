"use client";

import type { ThemeName } from "@/lib/wechat-editor/types";

interface ThemeSelectorProps {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
}

export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as ThemeName)}
      className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm"
      aria-label="主题选择"
    >
      <option value="default">默认</option>
      <option value="grace">优雅</option>
      <option value="simple">简洁</option>
    </select>
  );
}
