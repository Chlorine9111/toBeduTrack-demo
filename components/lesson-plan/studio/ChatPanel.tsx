"use client";

import { useEffect, useRef, useCallback } from "react";
import { Button, Spinner, TextArea } from "@heroui/react";
import {
  Bot,
  User,
  Sparkles,
  ListTree,
  Wand2,
} from "lucide-react";

type ChatMessage = {
  role: "assistant" | "teacher";
  text: string;
};

type ChatPanelProps = {
  chat: ChatMessage[];
  prompt: string;
  onPromptChange: (value: string) => void;
  isLoading: boolean;
  isGenerating: boolean;
  hasConfirmedIntent: boolean;
  hasOutline: boolean;
  onSubmitIntent: () => void;
  onGenerateOutline: () => void;
  onGenerateContent: () => void;
};

function MessageBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={`flex gap-2.5 ${isAssistant ? "justify-start" : "flex-row-reverse"}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isAssistant
            ? "bg-slate-200 text-default-500 dark:bg-slate-700 dark:text-slate-300"
            : "bg-slate-900 text-white dark:bg-blue-600"
        }`}
      >
        {isAssistant ? (
          <Bot className="h-3.5 w-3.5" />
        ) : (
          <User className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isAssistant
            ? "bg-default-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
            : "bg-slate-900 text-white dark:bg-blue-600 dark:text-white"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}

export default function ChatPanel({
  chat,
  prompt,
  onPromptChange,
  isLoading,
  isGenerating,
  hasConfirmedIntent,
  hasOutline,
  onSubmitIntent,
  onGenerateOutline,
  onGenerateContent,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.length]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 4 * 24; // ~4 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [prompt, resizeTextarea]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim() && !isLoading && !isGenerating) {
        onSubmitIntent();
      }
    }
  };

  const busy = isLoading || isGenerating;

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {chat.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-default-200 dark:bg-slate-800">
              <Sparkles className="h-5 w-5 text-default-400 dark:text-default-500" />
            </div>
            <p className="text-sm font-medium text-default-500 dark:text-default-400">
              描述你的教学需求
            </p>
            <p className="mt-1 text-xs text-default-400 dark:text-default-500">
              AI 将帮你匹配 CED 标准并生成教案
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {chat.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
          </div>
        )}

        {/* Generating indicator */}
        {isGenerating && (
          <div className="mt-4 flex items-center gap-2 text-sm text-default-500 dark:text-default-400">
            <Spinner size="sm" />
            <span className="animate-pulse">正在生成中...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-divider px-4 py-3 dark:border-slate-800">
        <TextArea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你的教学需求，例如：明天讲 AP Calculus AB 的 FTC"
          rows={1}
          disabled={busy}
          className="block w-full resize-none rounded-xl border border-divider bg-white px-3.5 py-2.5 text-sm text-foreground placeholder-slate-400 outline-hidden transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
        />

        {/* Action buttons */}
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            size="sm"
            onPress={onSubmitIntent}
            isDisabled={!prompt.trim() || busy}
            className="gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-foreground dark:hover:bg-default-200"
          >
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            解析 CED
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onPress={onGenerateOutline}
            isDisabled={!hasConfirmedIntent || busy}
            className="gap-1.5 rounded-lg border border-divider px-3.5 text-xs font-medium text-slate-700 hover:bg-default-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isLoading && hasConfirmedIntent && !hasOutline ? (
              <Spinner size="sm" />
            ) : (
              <ListTree className="h-3.5 w-3.5" />
            )}
            生成大纲
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onPress={onGenerateContent}
            isDisabled={!hasOutline || busy}
            className="gap-1.5 rounded-lg border border-divider px-3.5 text-xs font-medium text-slate-700 hover:bg-default-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isGenerating ? (
              <Spinner size="sm" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            生成教案
          </Button>
        </div>
      </div>
    </div>
  );
}
