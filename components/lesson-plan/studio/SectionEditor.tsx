"use client";

import { useState } from "react";
import type { LessonPlanBlock, LessonPlanSection } from "@/lib/lesson-plan/types";
import { BLOCK_TYPE_OPTIONS } from "@/lib/lesson-plan/defaults";
import { BlockPreview, BlockEditForm, BlockWrapper } from "../blocks";
import { Button, Chip, Input } from "@heroui/react";
import { Plus, Clock } from "lucide-react";

type SectionEditorProps = {
  section: LessonPlanSection;
  onUpdateSection: (updater: (s: LessonPlanSection) => LessonPlanSection) => void;
  onRewriteBlock: (blockId: string) => void;
  rewriteInstruction: string;
  onRewriteInstructionChange: (value: string) => void;
};

export default function SectionEditor({
  section,
  onUpdateSection,
  onRewriteBlock,
  rewriteInstruction,
  onRewriteInstructionChange,
}: SectionEditorProps) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const sortedBlocks = [...section.blocks].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  const addBlock = (type: LessonPlanBlock["type"]) => {
    const newBlock: LessonPlanBlock = {
      id: crypto.randomUUID(),
      type,
      sortOrder: section.blocks.length,
      content: getDefaultContent(type),
      cedCodes: [],
      ...(type === "callout" ? { subtype: "think" as const } : {}),
    };

    onUpdateSection((s) => ({
      ...s,
      blocks: [...s.blocks, newBlock],
    }));
    setShowAddMenu(false);
  };

  const updateBlock = (blockId: string, updatedBlock: LessonPlanBlock) => {
    onUpdateSection((s) => ({
      ...s,
      blocks: s.blocks.map((b) => (b.id === blockId ? updatedBlock : b)),
    }));
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    onUpdateSection((s) => {
      const blocks = [...s.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = blocks.findIndex((b) => b.id === blockId);
      if (index < 0) return s;
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return s;

      const temp = blocks[index];
      blocks[index] = blocks[target];
      blocks[target] = temp;

      return {
        ...s,
        blocks: blocks.map((b, i) => ({ ...b, sortOrder: i })),
      };
    });
  };

  const deleteBlock = (blockId: string) => {
    onUpdateSection((s) => ({
      ...s,
      blocks: s.blocks
        .filter((b) => b.id !== blockId)
        .map((b, i) => ({ ...b, sortOrder: i })),
    }));
    if (editingBlockId === blockId) {
      setEditingBlockId(null);
    }
  };

  const duplicateBlock = (blockId: string) => {
    onUpdateSection((s) => {
      const original = s.blocks.find((b) => b.id === blockId);
      if (!original) return s;

      const duplicate: LessonPlanBlock = {
        ...original,
        id: crypto.randomUUID(),
        sortOrder: s.blocks.length,
        content: { ...original.content },
        cedCodes: [...original.cedCodes],
      };

      return {
        ...s,
        blocks: [...s.blocks, duplicate],
      };
    });
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground dark:text-white">
            {section.title}
          </h3>
          <Chip size="sm">
            <Clock className="h-3 w-3" />
            <Chip.Label>{section.durationMinutes} 分钟</Chip.Label>
          </Chip>
        </div>
      </div>

      {section.summary && (
        <p className="text-sm text-default-500 dark:text-default-400">
          {section.summary}
        </p>
      )}

      {/* AI Rewrite instruction */}
      <div className="flex items-center gap-2">
        <Input
          className="flex-1 rounded-lg border border-divider bg-white px-3 py-2 text-sm placeholder:text-default-400 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          placeholder="输入 AI 重写指令，如：更通俗一些、增加难度..."
          value={rewriteInstruction}
          onChange={(e) => onRewriteInstructionChange(e.target.value)}
        />
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        {sortedBlocks.map((block) => {
          const isEditing = editingBlockId === block.id;
          return (
            <BlockWrapper
              key={block.id}
              block={block}
              isEditing={isEditing}
              onToggleEdit={() =>
                setEditingBlockId(isEditing ? null : block.id)
              }
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)}
              onDelete={() => deleteBlock(block.id)}
              onRewrite={() => onRewriteBlock(block.id)}
              onDuplicate={() => duplicateBlock(block.id)}
            >
              {isEditing ? (
                <BlockEditForm
                  block={block}
                  onChange={(updated) => updateBlock(block.id, updated)}
                />
              ) : (
                <BlockPreview block={block} />
              )}
            </BlockWrapper>
          );
        })}
      </div>

      {/* Add block */}
      <div className="relative">
        <Button
          variant="ghost"
          onPress={() => setShowAddMenu(!showAddMenu)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider py-3 text-sm text-default-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-default-400 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
        >
          <Plus className="h-4 w-4" />
          添加内容块
        </Button>

        {showAddMenu && (
          <div className="absolute left-0 right-0 top-full z-10 mt-2 grid grid-cols-3 gap-1.5 rounded-xl border border-divider bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-4">
            {BLOCK_TYPE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant="ghost"
                onPress={() => addBlock(option.value)}
                className="rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-default-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getDefaultContent(type: LessonPlanBlock["type"]): Record<string, unknown> {
  switch (type) {
    case "heading":
      return { level: "h2", text: "新标题" };
    case "paragraph":
      return { text: "请输入正文内容。" };
    case "math":
      return { latex: "f(x) = x^2", displayMode: true };
    case "image":
      return { url: "", alt: "" };
    case "callout":
      return { title: "想一想", text: "这里写引导问题。" };
    case "divider":
      return {};
    case "definition":
      return { term: "术语", explanation: "术语解释" };
    case "example":
      return { prompt: "例题题干", steps: ["步骤 1", "步骤 2"] };
    case "steps":
      return { title: "步骤流程", items: ["第一步", "第二步"] };
    case "quiz":
      return {
        question: "这里是检测题目",
        options: [
          { id: "A", text: "选项 A" },
          { id: "B", text: "选项 B" },
          { id: "C", text: "选项 C" },
          { id: "D", text: "选项 D" },
        ],
        correctOptionId: "A",
        explanation: "解析说明",
      };
    case "poll":
      return {
        question: "你更倾向哪个答案？",
        options: [
          { id: "A", text: "A" },
          { id: "B", text: "B" },
        ],
        presetDistribution: [
          { optionId: "A", percent: 50 },
          { optionId: "B", percent: 50 },
        ],
      };
    default:
      return {};
  }
}
