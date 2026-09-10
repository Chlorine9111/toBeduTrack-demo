"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, User, X } from "lucide-react";
import type { ChatMessage } from "@/lib/wechat-editor/types";

function renderSimpleMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-neutral-800 text-neutral-100 rounded p-2 my-1 text-[11px] overflow-x-auto"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-neutral-200 px-1 rounded text-[11px]">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-xs mt-2 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-xs mt-2 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-sm mt-2 mb-1">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-3 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  html = html.replace(/((?:<li class="ml-3 list-disc">.*?<\/li><br\/?>)+)/g, '<ul class="my-1">$1</ul>');
  html = html.replace(/((?:<li class="ml-3 list-decimal">.*?<\/li><br\/?>)+)/g, '<ol class="my-1">$1</ol>');

  return html;
}

interface AIChatPanelProps {
  onInsert: (markdown: string) => void;
  onClose: () => void;
}

function createInitialMessages(): ChatMessage[] {
  return [
    {
      role: "assistant",
      content:
        "告诉我你想写的公众号主题，我会直接生成结构完整、适合移动端阅读的 Markdown 草稿。",
    },
  ];
}

export function AIChatPanel({ onInsert, onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(createInitialMessages());
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);

  const appendAssistantChunk = (chunk: string) => {
    setMessages((current) => {
      if (current.length === 0) {
        return [{ role: "assistant", content: chunk }];
      }
      const next = [...current];
      const last = next[next.length - 1];
      if (last?.role !== "assistant") {
        next.push({ role: "assistant", content: chunk });
        return next;
      }
      next[next.length - 1] = {
        ...last,
        content: last.content + chunk,
      };
      return next;
    });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setError(null);
    setInput("");
    setIsStreaming(true);

    const outgoing: ChatMessage = { role: "user", content: text };
    setMessages((current) => [...current, outgoing, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/wechat-editor/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages.filter((item) => item.role === "user" || item.role === "assistant"), outgoing],
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `请求失败（${response.status}）`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          appendAssistantChunk(chunk);
        }
      }

      const tail = decoder.decode();
      if (tail) {
        appendAssistantChunk(tail);
      }

      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content.trim()) {
          next[next.length - 1] = {
            role: "assistant",
            content: "（本次模型未返回正文，可重试或补充更具体的要求）",
          };
        }
        return next;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成失败，请稍后重试");
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content.trim()) {
          next.pop();
        }
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-neutral-200 bg-white">
      <header className="flex h-11 items-center justify-between border-b border-neutral-200 px-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <Bot className="h-4 w-4" />
          AI 助手
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="关闭 AI 助手"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((message, index) => {
          const isAssistant = message.role === "assistant";
          return (
            <div key={`${message.role}-${index}`} className="space-y-1.5">
              <div className={`flex items-start gap-2 ${isAssistant ? "" : "flex-row-reverse"}`}>
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    isAssistant ? "bg-[#F7F7F7] text-[#1D1D1F]" : "bg-neutral-200 text-neutral-700"
                  }`}
                >
                  {isAssistant ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={`max-w-[210px] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    isAssistant
                      ? "bg-neutral-100 text-neutral-700"
                      : "bg-neutral-900 text-white"
                  }`}
                >
                  {isAssistant ? (
                    <div
                      className="prose-chat text-xs leading-relaxed [&_h2]:text-sm [&_h3]:text-xs [&_h4]:text-xs [&_strong]:font-semibold [&_code]:text-[10px] [&_pre]:my-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5"
                      dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(message.content) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
              {isAssistant && message.content.trim() && index !== 0 ? (
                <button
                  type="button"
                  onClick={() => onInsert(message.content)}
                  className="ml-8 rounded-md border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
                >
                  插入编辑器
                </button>
              ) : null}
            </div>
          );
        })}
        {isStreaming ? (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在生成中...
          </div>
        ) : null}
      </div>

      <footer className="border-t border-neutral-200 p-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="输入主题，例如：如何备考 AP Calculus FRQ"
          className="h-20 w-full resize-none rounded-lg border border-neutral-200 p-2.5 text-sm outline-hidden focus:border-[rgba(94,106,210,0.3)]"
          disabled={isStreaming}
        />

        <div className="mt-2 flex items-center justify-between">
          {error ? <p className="max-w-[170px] text-[11px] text-red-500">{error}</p> : <span />}
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canSend}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1D1D1F] px-3 text-xs font-medium text-white disabled:opacity-45"
          >
            <Send className="h-3.5 w-3.5" />
            发送
          </button>
        </div>
      </footer>
    </aside>
  );
}
