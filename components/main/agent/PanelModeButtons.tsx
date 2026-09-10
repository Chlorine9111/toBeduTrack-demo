"use client";

import { ToggleButton, ToggleButtonGroup, Tooltip } from "@heroui/react";
import { PanelLeftClose, Columns2, PanelRightClose } from "lucide-react";
import type { PresetMode } from "@/components/main/agent/useResizablePanel";

const MODES: { mode: PresetMode; icon: typeof Columns2; label: string; tooltip: string }[] = [
  { mode: "focus", icon: PanelRightClose, label: "对话", tooltip: "Focus: 对话优先" },
  { mode: "split", icon: Columns2, label: "均分", tooltip: "Split: 均分面板" },
  { mode: "canvas", icon: PanelLeftClose, label: "画布", tooltip: "Canvas: 画布优先" },
];

type PanelModeButtonsProps = {
  currentMode: PresetMode | null;
  onModeChange: (mode: PresetMode) => void;
};

export default function PanelModeButtons({
  currentMode,
  onModeChange,
}: PanelModeButtonsProps) {
  return (
    <ToggleButtonGroup
      aria-label="Panel layout mode"
      selectionMode="single"
      selectedKeys={currentMode ? new Set([currentMode]) : new Set()}
      onSelectionChange={(keys) => {
        const selected = [...keys][0] as PresetMode | undefined;
        if (selected) onModeChange(selected);
      }}
    >
      {MODES.map(({ mode, icon: Icon, tooltip }) => (
        <Tooltip key={mode}>
          <ToggleButton
            isIconOnly
            id={mode}
            aria-label={tooltip}
            className="h-6 w-6 min-w-0"
          >
            <Icon className="h-3 w-3" />
          </ToggleButton>
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
