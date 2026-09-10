"use client";

import { Button } from "@heroui/react";
import { Menu } from "lucide-react";

type AgentWorkspaceTopBarProps = {
  isZh: boolean;
  streaming: boolean;
  onStop: () => void;
  onToggleConversations?: () => void;
};

export default function AgentWorkspaceTopBar({
  isZh,
  onToggleConversations,
}: AgentWorkspaceTopBarProps) {
  if (!onToggleConversations) return null;

  return (
    <div className="flex h-12 items-center px-4 md:hidden">
      <Button
        isIconOnly
        variant="ghost"
        onPress={onToggleConversations}
        aria-label={isZh ? "对话列表" : "Conversations"}
      >
        <Menu className="size-5" />
      </Button>
    </div>
  );
}
