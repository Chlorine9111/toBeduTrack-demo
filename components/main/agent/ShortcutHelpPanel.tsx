"use client";

import { Card, Kbd, Separator } from "@heroui/react";

type ShortcutHelpPanelProps = {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
};

type ShortcutEntry = {
  keys: string[];
  labelZh: string;
  labelEn: string;
};

type ShortcutGroup = {
  titleZh: string;
  titleEn: string;
  items: ShortcutEntry[];
};

const KEY_MAP: Record<string, "command" | "shift" | "escape" | "enter"> = {
  "⌘": "command",
  "⇧": "shift",
  Shift: "shift",
  Esc: "escape",
  Enter: "enter",
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleZh: "导航",
    titleEn: "Navigation",
    items: [
      { keys: ["⌘", "B"], labelZh: "打开/关闭对话列表", labelEn: "Toggle conversation list" },
      { keys: ["Esc"], labelZh: "关闭面板", labelEn: "Close panel" },
    ],
  },
  {
    titleZh: "面板布局",
    titleEn: "Panel Layout",
    items: [
      { keys: ["⌘", "⇧", "1"], labelZh: "Focus 模式 (对话优先)", labelEn: "Focus mode (chat first)" },
      { keys: ["⌘", "⇧", "2"], labelZh: "Split 模式 (均分)", labelEn: "Split mode (even)" },
      { keys: ["⌘", "⇧", "3"], labelZh: "Canvas 模式 (结果优先)", labelEn: "Canvas mode (result first)" },
    ],
  },
  {
    titleZh: "输入",
    titleEn: "Input",
    items: [
      { keys: ["Enter"], labelZh: "发送消息", labelEn: "Send message" },
      { keys: ["Shift", "Enter"], labelZh: "换行", labelEn: "New line" },
      { keys: ["⌘", "⇧", "/"], labelZh: "显示此帮助", labelEn: "Show this help" },
    ],
  },
];

function ShortcutKey({ keyStr }: { keyStr: string }) {
  const abbrKey = KEY_MAP[keyStr];
  if (abbrKey) {
    return (
      <Kbd>
        <Kbd.Abbr keyValue={abbrKey} />
      </Kbd>
    );
  }
  return (
    <Kbd>
      <Kbd.Content>{keyStr}</Kbd.Content>
    </Kbd>
  );
}

export default function ShortcutHelpPanel({ open, onClose, isZh }: ShortcutHelpPanelProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/20" />

      {/* 白色卡片 */}
      <Card
        className="ws-animate-scale-fade-in relative z-10 mx-4 w-full max-w-md shadow-xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Card.Header>
          <h2 className="text-base font-medium text-foreground">
            {isZh ? "键盘快捷键" : "Keyboard Shortcuts"}
          </h2>
        </Card.Header>
        <Card.Content className="space-y-4">
          {SHORTCUT_GROUPS.map((group, groupIndex) => (
            <div key={group.titleEn}>
              {groupIndex > 0 && <Separator className="mb-3" />}
              <h3 className="mb-2 text-xs font-medium text-default-300">
                {isZh ? group.titleZh : group.titleEn}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.labelEn}
                    className="flex items-center justify-between py-0.5"
                  >
                    <span className="text-sm text-foreground">
                      {isZh ? item.labelZh : item.labelEn}
                    </span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, i) => (
                        <ShortcutKey key={i} keyStr={key} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
