"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Alert, Button, Chip, ScrollShadow, TextArea } from "@heroui/react";
import { ArrowDown, ArrowUp, BookOpenText, FileText, Paperclip, Square } from "lucide-react";
import DotPulseLoader from "@/components/main/agent/DotPulseLoader";
import { cn } from "@/lib/utils";
import AgentClarificationCard from "@/components/main/agent/AgentClarificationCard";
import ArtifactReferenceCard from "@/components/main/agent/ArtifactReferenceCard";
import type { AgentArtifact } from "@/components/main/agent/artifact-utils";
import { ENABLE_AGENT_CLARIFICATION_UI } from "@/components/main/agent/workspace-flags";
import StreamingSkeleton from "@/components/main/agent/StreamingSkeleton";
import { useIsScrolledToBottom } from "@/components/main/agent/animation-constants";
import type { TimelineItem } from "@/components/main/agent/stream-runner";
import type {
  ProcessSummary,
  WorkingNote,
} from "@/components/main/agent/stream-runner";
import type { AgentReferenceSelection } from "@/components/main/content-assets/AssetReferencePicker";
import { AssetReadyNotification } from "./AssetReadyNotification";
import { stripEmbeddedArtifactPayload } from "@/lib/agent/artifact-payload";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import RichMarkdown from "@/components/shared/RichMarkdown";
import ScanStructuredResult from "@/components/main/scan/ScanStructuredResult";
import StreamingMarkdownPreview from "@/components/main/agent/StreamingMarkdownPreview";
import type {
  AgentMessage,
  PendingClarification,
} from "@/components/main/agent/workspace-types";
import type { StreamingAssistantDraft } from "@/components/main/agent/stream-runner";

const MemoRichMarkdown = memo(function MemoRichMarkdown(props: {
  content: string;
  className?: string;
}) {
  return <RichMarkdown content={props.content} className={props.className} />;
});

const MESSAGE_RENDER_WINDOW = 50;
const LOAD_MORE_INCREMENT = 20;

type MessagePosition = "first" | "middle" | "last" | "single";

type MessageGroup = {
  messages: AgentMessage[];
  role: "user" | "assistant";
  positions: MessagePosition[];
};

function isSpecialMessage(message: AgentMessage): boolean {
  return Boolean(message.scanResult || message.clarificationQuestion);
}

function groupMessages(messages: AgentMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: AgentMessage[] = [];
  let currentRole: "user" | "assistant" | null = null;

  const flushGroup = () => {
    if (currentGroup.length === 0 || currentRole === null) return;
    const positions: MessagePosition[] = currentGroup.map((_, i) => {
      if (currentGroup.length === 1) return "single";
      if (i === 0) return "first";
      if (i === currentGroup.length - 1) return "last";
      return "middle";
    });
    groups.push({ messages: [...currentGroup], role: currentRole, positions });
    currentGroup = [];
    currentRole = null;
  };

  for (const message of messages) {
    if (isSpecialMessage(message)) {
      flushGroup();
      groups.push({
        messages: [message],
        role: message.role,
        positions: ["single"],
      });
      continue;
    }

    if (message.role !== currentRole) {
      flushGroup();
      currentRole = message.role;
    }
    currentGroup.push(message);
  }
  flushGroup();

  return groups;
}

function getBubbleRadius(isUser: boolean, position: MessagePosition): string {
  if (isUser) {
    switch (position) {
      case "single": return "rounded-2xl rounded-br-md";
      case "first":  return "rounded-2xl rounded-br-[4px]";
      case "middle": return "rounded-2xl rounded-r-[4px]";
      case "last":   return "rounded-2xl rounded-tr-[4px] rounded-br-md";
    }
  }
  switch (position) {
    case "single": return "rounded-2xl rounded-bl-md";
    case "first":  return "rounded-2xl rounded-bl-[4px]";
    case "middle": return "rounded-2xl rounded-l-[4px]";
    case "last":   return "rounded-2xl rounded-tl-[4px] rounded-bl-md";
  }
}

function extractQuestionLead(content: string) {
  const normalized = content.replace(/\r/g, "").trim();
  if (!normalized) return "";

  const beforeQuestions = normalized.split(/\n{2,}###\s*第\s*\d+\s*题/i)[0]?.trim();
  if (beforeQuestions) {
    return beforeQuestions;
  }

  return normalized.split(/\n{2,}/)[0]?.trim() ?? "";
}

type AgentWorkspaceActiveStateProps = {
  isZh: boolean;
  workspaceLoadErrorText: string;
  conversationWarningText: string;
  restoringConversation: boolean;
  streaming: boolean;
  processingHeadline: string;
  visibleTimelineItems: TimelineItem[];
  activeTimelineItem: TimelineItem | null;
  timelineTotalMs: number | null;
  workingNotes: WorkingNote[];
  processSummary: ProcessSummary | null;
  messages: AgentMessage[];
  artifactByMessageId: Map<string, AgentArtifact[]>;
  streamingAssistantDraft: StreamingAssistantDraft | null;
  activeArtifactId: string | null;
  errorText: string;
  pendingClarification: PendingClarification | null;
  pendingMaterials: File[];
  selectedReferences: AgentReferenceSelection[];
  referenceUploadHint: string;
  input: string;
  canSend: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onOpenArtifact: (artifactId: string) => void;
  onClarificationComplete: (answers: Record<string, string>) => void;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onStop: () => void;
  onOpenMaterialUpload: () => void;
  onOpenReferencePicker: () => void;
  onRemovePendingMaterial: (index: number) => void;
  onRemoveReference: (id: string) => void;
  assetReadyNotification?: { title: string; summary: string } | null;
  onDismissAssetNotification?: () => void;
  compactChat?: boolean;
};

export default function AgentWorkspaceActiveState({
  isZh,
  workspaceLoadErrorText,
  conversationWarningText,
  restoringConversation,
  streaming,
  messages,
  artifactByMessageId,
  streamingAssistantDraft,
  activeArtifactId,
  errorText,
  pendingClarification,
  pendingMaterials,
  selectedReferences,
  referenceUploadHint,
  input,
  canSend,
  scrollRef,
  composerRef,
  onOpenArtifact,
  onClarificationComplete,
  onInputChange,
  onSend,
  onStop,
  onOpenMaterialUpload,
  onOpenReferencePicker,
  onRemovePendingMaterial,
  onRemoveReference,
  assetReadyNotification = null,
  onDismissAssetNotification,
  compactChat = false,
}: AgentWorkspaceActiveStateProps) {
  const [displayCount, setDisplayCount] = useState(MESSAGE_RENDER_WINDOW);
  const latestStreamingAssistantId = useMemo(() => {
    if (!streaming) return null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message.role === "assistant" &&
        !message.scanResult &&
        !message.clarificationQuestion
      ) {
        return message.id;
      }
    }
    return null;
  }, [messages, streaming]);
  const visibleMessages =
    messages.length > displayCount
      ? messages.slice(Math.max(0, messages.length - displayCount))
      : messages;
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);

  const showSkeleton = useMemo(() => {
    if (!streaming) return false;
    const lastMsg = messages[messages.length - 1];
    return lastMsg?.role === "assistant" && !lastMsg.content;
  }, [messages, streaming]);

  const messageGroups = useMemo(
    () => groupMessages(visibleMessages),
    [visibleMessages],
  );

  const atBottom = useIsScrolledToBottom(scrollRef);
  const prevMessageCountRef = useRef(messages.length);
  const [showNewMessageButton, setShowNewMessageButton] = useState(false);

  const knownMessageIdsRef = useRef<Set<string>>(new Set(messages.map((m) => m.id)));
  const newMessageIdsRef = useRef<Set<string>>(new Set<string>());

  useEffect(() => {
    const known = knownMessageIdsRef.current;
    const fresh = new Set<string>();
    for (const m of messages) {
      if (!known.has(m.id)) {
        fresh.add(m.id);
      }
      known.add(m.id);
    }
    newMessageIdsRef.current = fresh;
  }, [messages]);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      if (atBottom) {
        const el = scrollRef.current;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
        setShowNewMessageButton(false);
      } else {
        setShowNewMessageButton(true);
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, atBottom, scrollRef]);

  useEffect(() => {
    if (atBottom) {
      setShowNewMessageButton(false);
    }
  }, [atBottom]);

  return (
    <>
      <ScrollShadow
        ref={scrollRef}
        data-testid="agent-message-scroll"
        className="relative flex-1 min-h-0 overscroll-none px-8 py-6"
        style={{ overflowAnchor: "auto" }}
      >
        <div className="flex flex-col">
          <div data-testid="agent-message-stack" className="flex flex-col gap-3">
            {hiddenMessageCount > 0 ? (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  data-testid="agent-history-toggle"
                  onPress={() => setDisplayCount((prev) => prev + LOAD_MORE_INCREMENT)}
                  size="sm"
                  className="rounded-full"
                >
                  {isZh
                    ? `显示更早的 ${hiddenMessageCount} 条消息`
                    : `Show ${hiddenMessageCount} earlier messages`}
                </Button>
              </div>
            ) : null}
            {workspaceLoadErrorText ? (
              <Alert color="warning">
                {workspaceLoadErrorText}
              </Alert>
            ) : null}
            {restoringConversation ? (
              <div className="flex items-center gap-2 pl-1 text-xs text-default-500">
                <DotPulseLoader className="text-default-400" />
                {isZh
                  ? "正在恢复上次对话..."
                  : "Restoring your last conversation..."}
              </div>
            ) : null}
            {conversationWarningText ? (
              <Alert color="warning">
                {conversationWarningText}
              </Alert>
            ) : null}
            {messageGroups.map((group) => {
              const isStreamingGroup =
                streaming &&
                group.messages.some((m) => m.id === latestStreamingAssistantId);

              return (
                <div
                  key={group.messages[0].id}
                  className={cn(
                    "flex flex-col",
                    group.role === "user" ? "items-end" : "items-start",
                    group.messages.length > 1 ? "gap-1" : "",
                  )}
                >
                  {group.messages.map((message, msgIndex) => {
                    const position = isStreamingGroup && msgIndex === group.messages.length - 1
                      ? "single" as MessagePosition
                      : group.positions[msgIndex];
                    const isUser = message.role === "user";
                    const hasClarificationCard =
                      ENABLE_AGENT_CLARIFICATION_UI &&
                      Boolean(message.clarificationQuestion);
                    const artifactsForMessage = hasClarificationCard
                      ? []
                      : artifactByMessageId.get(message.id) ?? [];
                    const primaryArtifact =
                      artifactsForMessage[artifactsForMessage.length - 1] ?? null;
                    const shouldShowArtifactReference = artifactsForMessage.length > 0;
                    const shouldUseStreamingPlainPreview =
                      !isUser &&
                      streaming &&
                      message.id === latestStreamingAssistantId &&
                      !message.scanResult &&
                      !hasClarificationCard &&
                      !shouldShowArtifactReference;
                    const questionLead =
                      !isUser && message.questionBlocks && message.questionBlocks.length > 0
                        ? extractQuestionLead(stripEmbeddedArtifactPayload(message.content || ""))
                        : "";
                    const visibleMessageContent = isUser
                      ? message.content
                      : stripEmbeddedArtifactPayload(message.content || "");
                    const draftContent =
                      !isUser &&
                      streamingAssistantDraft?.messageId === message.id
                        ? streamingAssistantDraft.content
                        : "";
                    const isThinkingPlaceholder =
                      streaming &&
                      !isUser &&
                      !visibleMessageContent &&
                      !draftContent &&
                      !questionLead &&
                      !shouldShowArtifactReference;
                    const displayText =
                      shouldShowArtifactReference && primaryArtifact
                        ? primaryArtifact.previewText
                        : questionLead || draftContent || visibleMessageContent || "";

                    const isLastStreamingMessage =
                      streaming && message.id === latestStreamingAssistantId;

                    const bubbleRadius = getBubbleRadius(isUser, position);

                    const isNewMessage = newMessageIdsRef.current.has(message.id);
                    const isStreamingFadeIn =
                      !isUser && streaming && message.id === latestStreamingAssistantId;

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex w-full",
                          isUser ? "justify-end" : "justify-start",
                          isNewMessage && !isStreamingFadeIn && "ws-msg-enter",
                          isStreamingFadeIn && "ws-animate-fade-in",
                        )}
                        style={isLastStreamingMessage ? { overflowAnchor: "none" } : undefined}
                      >
                        <div
                          data-testid={
                            isUser
                              ? "agent-user-message"
                              : hasClarificationCard
                                ? "agent-clarification-message"
                                : message.scanResult
                                  ? "agent-scan-message"
                                  : "agent-assistant-message"
                          }
                          className={cn(
                            "px-4 py-3 text-[14px] leading-relaxed",
                            compactChat ? "max-w-[100%]" : "max-w-[85%]",
                            isUser
                              ? "bg-accent/10 text-foreground"
                              : "bg-surface-secondary text-foreground",
                            bubbleRadius,
                          )}
                        >
                          {isUser ? (
                            <div className="whitespace-pre-wrap">{message.content}</div>
                          ) : shouldShowArtifactReference ? (
                            <div
                              data-testid={message.scanResult ? "scan-result-message-text" : undefined}
                              className="whitespace-pre-wrap"
                            >
                              {displayText}
                            </div>
                          ) : (
                            <div data-testid={!isUser && message.scanResult ? "scan-result-message-text" : undefined}>
                              {isThinkingPlaceholder ? (
                                <DotPulseLoader />
                              ) : message.scanResult ? (
                                <div className="whitespace-pre-wrap">
                                  {visibleMessageContent}
                                </div>
                              ) : shouldUseStreamingPlainPreview ? (
                                <StreamingMarkdownPreview
                                  content={displayText}
                                  className="prose-p:my-1 prose-ul:my-2 prose-ol:my-2 prose-li:my-0"
                                />
                              ) : (
                                <MemoRichMarkdown
                                  content={displayText}
                                  className="prose-p:my-1 prose-ul:my-2 prose-ol:my-2 prose-li:my-0"
                                />
                              )}
                            </div>
                          )}

                          {!isUser && hasClarificationCard ? (
                            <AgentClarificationCard
                              questions={
                                (
                                  message.clarificationQuestions ??
                                  [message.clarificationQuestion]
                                ).filter(
                                  (question): question is NonNullable<typeof message.clarificationQuestion> =>
                                    Boolean(question),
                                )
                              }
                              disabled={
                                streaming ||
                                !pendingClarification ||
                                pendingClarification.messageId !== message.id
                              }
                              onComplete={onClarificationComplete}
                            />
                          ) : null}

                          {!isUser && message.scanResult && !shouldShowArtifactReference ? (
                            <div className="mt-4">
                              <ScanStructuredResult result={message.scanResult} />
                            </div>
                          ) : null}

                          {!isUser && message.questionBlocks && message.questionBlocks.length > 0 ? (
                            <div className="mt-4 space-y-3">
                              {message.questionBlocks.map((question) => (
                                <div
                                  key={question.id}
                                  data-testid="agent-question-block"
                                  className="rounded-2xl border border-divider bg-white px-4 py-3 shadow-xs"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-foreground">
                                      {question.title || `第 ${question.questionNumber ?? "?"} 题`}
                                    </span>
                                    {question.questionType ? (
                                      <Chip size="sm">
                                        {question.questionType}
                                      </Chip>
                                    ) : null}
                                    {question.sourceLabel ? (
                                      <span className="text-[11px] text-default-400">{question.sourceLabel}</span>
                                    ) : null}
                                  </div>
                                  <QuestionContentWithImages
                                    content={question.stem}
                                    className="mt-2"
                                    textClassName="text-sm leading-6 text-default-500"
                                    galleryClassName="mt-2 grid gap-2 sm:grid-cols-2"
                                    figureClassName="bg-white"
                                    imageClassName="max-h-[180px] w-full object-scale-down"
                                  />
                                  {question.options && question.options.length > 0 ? (
                                    <div className="mt-2 space-y-2 text-xs text-default-500">
                                      {question.options.map((option) => (
                                        <div key={`${question.id}-${option.key}`} className="rounded-lg bg-default-100 px-2.5 py-2">
                                          <div className="font-medium text-default-500">{option.key}.</div>
                                          <QuestionContentWithImages
                                            content={option.content}
                                            className="mt-1"
                                            textClassName="text-xs leading-5 text-default-500"
                                            galleryClassName="mt-2 grid gap-2 sm:grid-cols-2"
                                            figureClassName="bg-white"
                                            imageClassName="max-h-[140px] w-full object-scale-down"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {question.answer ? (
                                    <p className="mt-2 text-xs font-medium text-default-500">
                                      {isZh ? "答案：" : "Answer: "}
                                      {question.answer}
                                    </p>
                                  ) : null}
                                  {question.solution ? (
                                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-default-500">
                                      {isZh ? "解析：" : "Solution: "}
                                      {question.solution}
                                    </p>
                                  ) : null}
                                  {question.knowledgePoint ? (
                                    <p className="mt-2 text-xs text-default-500">
                                      {isZh ? "知识点：" : "Knowledge: "}
                                      {question.knowledgePoint}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {!isUser && shouldShowArtifactReference && artifactsForMessage.length > 0 ? (
                            <div className="mt-4 space-y-2">
                              {artifactsForMessage.map((artifact) => (
                                <ArtifactReferenceCard
                                  key={artifact.id}
                                  artifact={artifact}
                                  active={artifact.id === activeArtifactId}
                                  onOpen={onOpenArtifact}
                                  isZh={isZh}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* 骨架只在完全无消息内容时显示，避免和气泡内 DotPulseLoader 重叠 */}
            <StreamingSkeleton visible={showSkeleton && visibleMessages.length === 0} />

          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          className={cn(
            "absolute bottom-4 right-8 z-10 rounded-full shadow-lg",
            showNewMessageButton
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0",
          )}
          onPress={() => {
            const el = scrollRef.current;
            if (el) {
              el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }
            setShowNewMessageButton(false);
          }}
        >
          <ArrowDown className="h-3 w-3" />
          {isZh ? "新消息" : "New messages"}
        </Button>
      </ScrollShadow>

      <div className="mx-6 mb-5 mt-0">
        {errorText ? (
          <Alert color="danger" className="mb-2 text-xs">
            {errorText}
          </Alert>
        ) : null}
        {referenceUploadHint ? (
          <Alert
            data-testid="agent-reference-processing-hint"
            color="warning"
            className="mb-2 text-xs"
          >
            {referenceUploadHint}
          </Alert>
        ) : null}
        {ENABLE_AGENT_CLARIFICATION_UI && pendingClarification ? (
          <Alert color="warning" className="mb-3 text-xs">
            {isZh ? "正在补充关键信息：" : "Need one more detail: "}
            {pendingClarification.question.question}
          </Alert>
        ) : null}
        {pendingMaterials.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingMaterials.map((file, index) => (
              <Chip
                key={`mat-${file.name}-${file.size}-${index}`}
                color="accent"
                className="cursor-pointer"
                onClick={() => onRemovePendingMaterial(index)}
              >
                <FileText className="mr-1 inline size-3.5" />
                <span className="max-w-[180px] truncate">{file.name}</span>
              </Chip>
            ))}
          </div>
        ) : null}
        {onDismissAssetNotification ? (
          <AssetReadyNotification
            notification={assetReadyNotification}
            onDismiss={onDismissAssetNotification}
          />
        ) : null}
        {selectedReferences.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedReferences.map((item) => (
              <Chip
                key={`asset-ref-${item.id}`}
                color={item.assetSource === "reference" ? "accent" : "warning"}
                className="cursor-pointer"
                onClick={() => onRemoveReference(item.id)}
              >
                {item.assetSource === "reference" ? (
                  <BookOpenText className="mr-1 inline size-3.5" />
                ) : (
                  <FileText className="mr-1 inline size-3.5" />
                )}
                <span className="max-w-[220px] truncate">{item.title}</span>
              </Chip>
            ))}
          </div>
        ) : null}

        {/* Composer */}
        <div className="flex items-end gap-2 rounded-2xl border border-divider bg-surface px-4 py-2 shadow-sm transition-shadow focus-within:border-muted focus-within:shadow-md">
          <TextArea
            ref={composerRef}
            id="agent-active-composer"
            name="agentActiveComposer"
            autoComplete="off"
            value={input}
            data-testid="agent-composer"
            onChange={(event) => onInputChange(event.target.value)}
            suppressHydrationWarning
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) void onSend();
              }
            }}
            placeholder={isZh ? "输入消息..." : "Type a message..."}
            rows={1}
            variant="secondary"
            className="max-h-[120px] min-h-[24px] flex-1 resize-none border-none bg-transparent p-0 text-[14px] leading-relaxed text-foreground shadow-none placeholder:text-muted focus:ring-0"
          />
          <div className="flex shrink-0 items-center gap-1">
            {!compactChat && (
              <Button
                isIconOnly
                variant="ghost"
                data-testid="agent-open-reference-picker"
                onPress={onOpenReferencePicker}
                isDisabled={streaming || (ENABLE_AGENT_CLARIFICATION_UI && Boolean(pendingClarification))}
                className="size-8 min-w-0"
                aria-label={isZh ? "打开内容引用面板" : "Open reference picker"}
              >
                <BookOpenText className="size-4" />
              </Button>
            )}
            {!compactChat && (
              <Button
                isIconOnly
                variant="ghost"
                data-testid="agent-open-material-upload"
                onPress={onOpenMaterialUpload}
                isDisabled={streaming || (ENABLE_AGENT_CLARIFICATION_UI && Boolean(pendingClarification))}
                className="size-8 min-w-0"
                aria-label={isZh ? "上传资料到上下文" : "Upload material"}
              >
                <Paperclip className="size-4" />
              </Button>
            )}
            {streaming ? (
              <Button
                isIconOnly
                variant="danger"
                onPress={onStop}
                className="size-8 min-w-0 rounded-full"
                aria-label={isZh ? "停止生成" : "Stop"}
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                isIconOnly
                data-testid="agent-send-button"
                onPress={() => void onSend()}
                isDisabled={!canSend}
                className={cn(
                  "size-8 min-w-0 rounded-full transition-colors",
                  canSend
                    ? "bg-accent text-white hover:opacity-90"
                    : "bg-default text-muted",
                )}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
