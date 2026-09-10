"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bot, SkipForward } from "lucide-react";
import { Button } from "@heroui/react";
import type { ChatStep, ChatMessage, TabId } from "@/lib/landing/mock-data";
import { useLanguage } from "@/lib/landing/i18n";

// ---------------------------------------------------------------------------
// Timing constants (ms)
// ---------------------------------------------------------------------------
const TYPEWRITER_SPEED = 12;
const MSG_DELAY = 180;
const TYPEWRITER_DONE_DELAY = 120;
const OPTIONS_DELAY = 120;
const AUTO_ADVANCE_DELAY = 250;
const AUTO_SELECT_DELAY = 3500;
const THINKING_DELAY = 1800;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChatPanelProps {
  flow: ChatStep[];
  tabId: TabId;
  onPanelTrigger: () => void;
  onOptionSelected?: () => void;
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------
export default function ChatPanel({
  flow,
  tabId,
  onPanelTrigger,
  onOptionSelected,
}: ChatPanelProps) {
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [typingMessage, setTypingMessage] = useState<ChatMessage | null>(null);
  const [typedText, setTypedText] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);
  const [isFlowComplete, setIsFlowComplete] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  const onPanelTriggerRef = useRef(onPanelTrigger);
  onPanelTriggerRef.current = onPanelTrigger;
  const onOptionSelectedRef = useRef(onOptionSelected);
  onOptionSelectedRef.current = onOptionSelected;

  const genRef = useRef(0);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const autoSelectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTyping = useCallback(() => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }, []);

  const clearAutoSelect = useCallback(() => {
    if (autoSelectTimerRef.current) {
      clearTimeout(autoSelectTimerRef.current);
      autoSelectTimerRef.current = null;
    }
  }, []);

  const clearThinking = useCallback(() => {
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [visibleMessages, typedText, showOptions, isThinking, scrollToBottom]);

  useEffect(() => {
    clearTyping();
    clearAutoSelect();
    clearThinking();
    genRef.current += 1;
    setCurrentStep(0);
    setVisibleMessages([]);
    setTypingMessage(null);
    setTypedText("");
    setShowOptions(false);
    setIsSkipped(false);
    setIsFlowComplete(false);
    setIsThinking(false);
    setThinkingText("");

    return () => {
      clearTyping();
      clearAutoSelect();
      clearThinking();
      genRef.current += 1;
    };
  }, [tabId, clearTyping, clearAutoSelect, clearThinking]);

  useEffect(() => {
    if (isSkipped || isFlowComplete) return;
    if (currentStep >= flow.length) {
      setIsFlowComplete(true);
      return;
    }

    genRef.current += 1;
    const myGen = genRef.current;
    clearTyping();
    clearAutoSelect();
    clearThinking();

    const step = flow[currentStep];

    // Show thinking bubble before AI messages (skip for first step)
    if (step.thinkingText && currentStep > 0) {
      setIsThinking(true);
      setThinkingText(step.thinkingText);
      thinkingTimerRef.current = setTimeout(() => {
        if (myGen !== genRef.current) return;
        setIsThinking(false);
        setThinkingText("");
        processMessages(step, 0, myGen);
      }, THINKING_DELAY);
    } else {
      processMessages(step, 0, myGen);
    }

    return () => {
      clearTyping();
      clearAutoSelect();
      clearThinking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isSkipped, isFlowComplete, tabId]);

  useEffect(() => {
    if (!showOptions) return;

    const step = currentStep < flow.length ? flow[currentStep] : null;
    if (!step?.options?.length) return;

    const mainOption = step.options.find((o) => o.isMain) ?? step.options[0];

    autoSelectTimerRef.current = setTimeout(() => {
      setShowOptions(false);
      onOptionSelectedRef.current?.();

      const syntheticMsg: ChatMessage = {
        id: `auto-${mainOption.id}`,
        role: "user",
        content: mainOption.text,
      };
      setVisibleMessages((prev) => [...prev, syntheticMsg]);

      setTimeout(() => {
        setCurrentStep((s) => s + 1);
      }, MSG_DELAY);
    }, AUTO_SELECT_DELAY);

    return () => {
      clearAutoSelect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOptions]);

  function processMessages(step: ChatStep, idx: number, gen: number) {
    if (gen !== genRef.current) return;
    if (idx >= step.messages.length) {
      if (step.triggerPanel) onPanelTriggerRef.current();
      if (step.options && step.options.length > 0) {
        setTimeout(() => {
          if (gen !== genRef.current) return;
          setShowOptions(true);
        }, OPTIONS_DELAY);
      } else if (currentStep < flow.length - 1) {
        setTimeout(() => {
          if (gen !== genRef.current) return;
          setCurrentStep((s) => s + 1);
        }, AUTO_ADVANCE_DELAY);
      } else {
        setIsFlowComplete(true);
      }
      return;
    }

    const msg = step.messages[idx];

    if (msg.typewriter) {
      setTypingMessage(msg);
      setTypedText("");
      let charIdx = 0;

      clearTyping();
      typingIntervalRef.current = setInterval(() => {
        if (gen !== genRef.current) {
          clearTyping();
          return;
        }
        if (charIdx < msg.content.length) {
          setTypedText(msg.content.slice(0, charIdx + 1));
          charIdx++;
        } else {
          clearTyping();
          setTypingMessage(null);
          setTypedText("");
          setVisibleMessages((prev) => [...prev, msg]);
          setTimeout(
            () => processMessages(step, idx + 1, gen),
            TYPEWRITER_DONE_DELAY
          );
        }
      }, TYPEWRITER_SPEED);
    } else {
      setVisibleMessages((prev) => [...prev, msg]);
      setTimeout(() => processMessages(step, idx + 1, gen), MSG_DELAY);
    }
  }

  const handleOptionClick = useCallback((text: string) => {
    clearAutoSelect();
    void text;
    setShowOptions(false);
    onOptionSelectedRef.current?.();
    setCurrentStep((s) => s + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkip = useCallback(() => {
    clearTyping();
    clearAutoSelect();
    clearThinking();
    genRef.current += 1;
    setIsSkipped(true);
    setIsThinking(false);
    setThinkingText("");
    setTypingMessage(null);
    setTypedText("");
    setShowOptions(false);

    const allMessages: ChatMessage[] = [];
    for (const step of flow) {
      allMessages.push(...step.messages);
      if (step.triggerPanel) onPanelTriggerRef.current();
    }
    setVisibleMessages(allMessages);
    setIsFlowComplete(true);
  }, [flow, clearTyping, clearAutoSelect, clearThinking]);

  const currentStepData = currentStep < flow.length ? flow[currentStep] : null;

  return (
    <div className="flex h-full flex-col bg-slate-50/40">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">
            {t.chat.headerTitle}
          </span>
        </div>
        {!isFlowComplete && (
          <Button
            variant="ghost"
            size="sm"
            onPress={handleSkip}
            className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500"
          >
            {t.chat.skipButton}
            <SkipForward className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="landing-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        <AnimatePresence mode="popLayout">
          {visibleMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>

        {/* Typewriter in-progress */}
        {typingMessage && (
          <motion.div
            key="typing"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2"
          >
            <div className="mt-0.5 shrink-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 shadow-xs">
              <span>{typedText}</span>
              <span className="typewriter-cursor" />
            </div>
          </motion.div>
        )}

        {/* Thinking bubble */}
        <AnimatePresence>
          {isThinking && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex gap-2"
            >
              <div className="mt-0.5 shrink-0">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-3.5 py-2.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                    <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                    <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[12px] text-slate-400 italic">{thinkingText}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Options */}
        <AnimatePresence>
          {showOptions && currentStepData?.options && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-end gap-1.5 pt-1"
            >
              {currentStepData.options.map((opt, i) => (
                <motion.button
                  key={opt.id}
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.06, duration: 0.15 }}
                  onClick={() => handleOptionClick(opt.text)}
                  className={`rounded-2xl border px-3.5 py-2 text-left text-[13px] leading-snug transition-all duration-200 cursor-pointer ${
                    opt.isMain
                      ? "animate-pulse-subtle border-slate-300 bg-slate-50 font-medium text-slate-800 shadow-xs hover:bg-slate-100"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {opt.text}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------
function MessageBubble({ message }: { message: ChatMessage }) {
  const isAI = message.role === "ai";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex gap-2 ${isAI ? "" : "flex-row-reverse"}`}
    >
      {isAI && (
        <div className="mt-0.5 shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isAI
            ? "rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-xs"
            : "rounded-tr-sm bg-slate-800 text-white"
        }`}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
