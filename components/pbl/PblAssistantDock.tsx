"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, ChevronDown, ChevronUp, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import type {
  PblAssistantTurnResponse,
} from "@/lib/pbl/assistant-shared";
import type { PblGenerationInput, PblOverview, PblPlan } from "@/lib/pbl/types";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  metadata?: {
    actionLabel?: string;
    recognizedFields?: Array<{ label: string; value: string }>;
    executionNote?: string;
  };
};

type PblAssistantDockProps = {
  currentInput: PblGenerationInput;
  availableOverviews: PblOverview[];
  currentPlan: PblPlan | null;
  busy?: boolean;
  onExecuteAction: (turn: PblAssistantTurnResponse) => Promise<string | null>;
};

let messageCounter = 0;

function createMessage(role: Message["role"], content: string): Message {
  messageCounter += 1;
  return {
    id: `pbl-assistant-${messageCounter}`,
    role,
    content,
  };
}

function formatDifficultyLabel(value: string | undefined): string {
  if (value === "basic") return "基础";
  if (value === "challenge") return "挑战";
  if (value === "advanced") return "进阶";
  return value ?? "";
}

function formatActionLabel(turn: PblAssistantTurnResponse) {
  if (turn.action === "reply_only") return "仅回答";
  if (turn.action === "update_input") return "更新参数";
  if (turn.action === "generate_overviews") return "生成概览";
  if (turn.action === "expand_overview") return `展开 ${turn.optionLabel ?? "A"} 方案`;
  if (turn.action === "patch_plan") return "修改方案";
  return `生成并展开 ${turn.optionLabel ?? "A"} 方案`;
}

function buildRecognizedFields(turn: PblAssistantTurnResponse) {
  const fields: Array<{ label: string; value: string }> = [];
  const patch = turn.inputPatch;

  if (patch.curriculumSystem) {
    fields.push({ label: "课程体系", value: patch.curriculumSystem });
  }
  if (patch.primarySubject) {
    fields.push({ label: "学科", value: patch.primarySubject });
  }
  if (patch.grade) {
    fields.push({ label: "年级", value: patch.grade });
  }
  if (patch.totalPeriods) {
    fields.push({ label: "总课时数", value: String(patch.totalPeriods) });
  }
  if (patch.topic) {
    fields.push({ label: "具体题目", value: patch.topic });
  }
  if (patch.difficulty) {
    fields.push({ label: "难度", value: formatDifficultyLabel(patch.difficulty) });
  }
  if (patch.specialRequirements) {
    fields.push({ label: "额外要求", value: patch.specialRequirements });
  }

  return fields;
}

function createAssistantTurnMessage(
  turn: PblAssistantTurnResponse,
  executionNote: string | null,
): Message {
  const message = createMessage("assistant", turn.reply);
  return {
    ...message,
    metadata: {
      actionLabel: formatActionLabel(turn),
      recognizedFields: buildRecognizedFields(turn),
      executionNote: executionNote?.trim() || undefined,
    },
  };
}

function createInitialMessages() {
  return [
    createMessage(
      "assistant",
      "直接说你的需求，例如：\n1. 做一个 AP Chemistry 围绕化学电池的基础项目\n2. 把当前方案降到基础难度并加强脚手架\n3. 展开 B 方案",
    ),
  ];
}

export function PblAssistantDock({
  currentInput,
  availableOverviews,
  currentPlan,
  busy = false,
  onExecuteAction,
}: PblAssistantDockProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>(createInitialMessages);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, isPending]);

  const disabled = busy || isPending;

  const sendMessage = () => {
    const teacherMessage = draft.trim();
    if (!teacherMessage || disabled) return;

    setError(null);
    setDraft("");
    setMessages((current) => [...current, createMessage("user", teacherMessage)]);

    startTransition(async () => {
      try {
        const response = await fetch("/api/pbl/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teacherMessage,
            currentInput,
            hasOverviews: availableOverviews.length > 0,
            availableOverviews: availableOverviews.map((item) => ({
              optionLabel: item.optionLabel,
              title: item.title,
              drivingQuestion: item.drivingQuestion,
              overview: item.overview,
            })),
            currentPlan: currentPlan
              ? {
                  id: currentPlan.id,
                  title: currentPlan.title,
                  overviewOption: currentPlan.overviewOption,
                  drivingQuestion: currentPlan.drivingQuestion,
                  overviewText: currentPlan.overviewText,
                  difficulty: currentPlan.difficulty,
                  finalOutcomeForm: currentPlan.finalOutcomeForm,
                }
              : null,
          }),
        });

        const data = (await response.json().catch(() => ({}))) as
          | PblAssistantTurnResponse
          | { error?: { message?: string } };

        if (!response.ok) {
          throw new Error(data && "error" in data ? data.error?.message || "PBL assistant 请求失败" : "PBL assistant 请求失败");
        }

        const turn = data as PblAssistantTurnResponse;
        const executionNote = await onExecuteAction(turn);
        setMessages((current) => [...current, createAssistantTurnMessage(turn, executionNote)]);
        setIsCollapsed(false);
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : "PBL assistant 请求失败";
        setError(message);
        setMessages((current) => [
          ...current,
          createMessage("assistant", `这次没有执行成功：${message}`),
        ]);
        setIsCollapsed(false);
      }
    });
  };

  const latestAssistantMessage =
    [...messages].reverse().find((message) => message.role === "assistant")?.content ??
    "点开后可以直接让 AI 改参数或重做方案。";

  if (isCollapsed) {
    return (
      <section className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))]">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-left shadow-xl backdrop-blur-sm transition hover:border-slate-300 hover:shadow-2xl"
          onClick={() => setIsCollapsed(false)}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            {disabled ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">PBL AI 助手</p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {disabled ? "正在处理中..." : latestAssistantMessage.replace(/\s+/g, " ")}
            </p>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Sparkles className="h-4 w-4" />
            <ChevronUp className="h-4 w-4" />
          </div>
        </button>
      </section>
    );
  }

  return (
    <section className="fixed bottom-4 right-4 z-50 w-[min(460px,calc(100vw-2rem))]">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_55%,#fff7ed_100%)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">PBL AI 助手</p>
              <p className="text-xs text-slate-500">自然语言改参数、生成概览、重做完整方案</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 sm:flex">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Cmd/Ctrl + Enter 发送</span>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              onClick={() => setIsCollapsed(true)}
              aria-label="收起 PBL AI 助手"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={listRef} className="max-h-72 space-y-3 overflow-y-auto px-5 py-4">
          {messages.slice(-6).map((message) => (
            <div
              key={message.id}
              className={message.role === "assistant" ? "mr-8" : "ml-8"}
            >
              <div
                className={
                  message.role === "assistant"
                    ? "rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"
                    : "rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm leading-6 text-white"
                }
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.role === "assistant" && message.metadata ? (
                  <div className="mt-3 space-y-2">
                    {message.metadata.actionLabel ? (
                      <div className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        下一步：{message.metadata.actionLabel}
                      </div>
                    ) : null}
                    {message.metadata.recognizedFields && message.metadata.recognizedFields.length > 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                          AI 识别结果
                        </p>
                        <div className="mt-2 space-y-2">
                          {message.metadata.recognizedFields.map((field) => (
                            <div key={`${message.id}-${field.label}`}>
                              <p className="text-[11px] text-slate-500">{field.label}</p>
                              <p className="whitespace-pre-wrap text-sm leading-5 text-slate-800">{field.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {message.metadata.executionNote ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-5 text-emerald-900">
                        {message.metadata.executionNote}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {isPending ? (
            <div className="mr-8">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在理解需求并执行动作...</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1">
              <span className="sr-only">输入 PBL 需求</span>
              <textarea
                className="min-h-[84px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-hidden transition focus:border-slate-950 focus:bg-white"
                placeholder="例如：把当前方案改成基础难度，减少变量复杂度，并直接重新生成完整方案。"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={disabled}
              />
            </label>

            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={sendMessage}
              disabled={disabled || draft.trim().length === 0}
            >
              {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              <span>{disabled ? "处理中..." : "发送给 AI"}</span>
            </button>
          </div>

          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
