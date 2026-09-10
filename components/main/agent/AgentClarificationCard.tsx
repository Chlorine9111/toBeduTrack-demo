"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button, Card, Input, Kbd } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type {
  AgentClarificationChoice,
  AgentClarificationQuestion,
} from "@/components/main/agent/workspace-types";

type AgentClarificationCardProps = {
  questions: AgentClarificationQuestion[];
  disabled?: boolean;
  onComplete: (answers: Record<string, string>) => void;
};

function getPlaceholder(question: AgentClarificationQuestion, isZh: boolean) {
  if (question.placeholder?.trim()) return question.placeholder.trim();
  if (question.field === "scope") return isZh ? "例如：第 2、7、11 题" : "For example: Questions 2, 7, and 11";
  if (question.field === "duration") return isZh ? "例如：45 分钟" : "For example: 45 minutes";
  if (question.field === "count") return isZh ? "例如：8 道" : "For example: 8 questions";
  if (question.field === "action") {
    return isZh
      ? "例如：先按知识点归类，再标出带图题"
      : "For example: group by knowledge point first, then flag figure-based questions";
  }
  return isZh ? "请输入补充说明" : "Enter the missing detail";
}

export default function AgentClarificationCard({
  questions,
  disabled = false,
  onComplete,
}: AgentClarificationCardProps) {
  const { isZh } = useAppI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expandedOtherKey, setExpandedOtherKey] = useState<string | null>(null);
  const [otherValue, setOtherValue] = useState("");
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isWizard = questions.length > 1;
  const currentQuestion = questions[currentStep];
  const isLastStep = currentStep === questions.length - 1;

  const otherPlaceholder = useMemo(
    () => (currentQuestion ? getPlaceholder(currentQuestion, isZh) : ""),
    [isZh, currentQuestion],
  );

  const advanceOrComplete = useCallback(
    (nextAnswers: Record<string, string>) => {
      if (isLastStep) {
        onComplete(nextAnswers);
        return;
      }
      setSlideDirection("left");
      requestAnimationFrame(() => {
        setTimeout(() => {
          setCurrentStep((s) => s + 1);
          setExpandedOtherKey(null);
          setOtherValue("");
          setSlideDirection(null);
        }, 200);
      });
    },
    [isLastStep, onComplete],
  );

  const handleSelect = useCallback(
    (choice: AgentClarificationChoice) => {
      if (!currentQuestion) return;
      if (choice.isOther) {
        const optionKey = `${currentQuestion.id}-${choice.key}-${choice.value}`;
        setExpandedOtherKey((prev) => (prev === optionKey ? null : optionKey));
        setOtherValue("");
        return;
      }
      const nextAnswers = { ...answers, [currentQuestion.field]: choice.value };
      setAnswers(nextAnswers);
      advanceOrComplete(nextAnswers);
    },
    [currentQuestion, answers, advanceOrComplete],
  );

  const submitOther = useCallback(() => {
    const trimmed = otherValue.trim();
    if (!trimmed || disabled || !currentQuestion) return;
    const nextAnswers = { ...answers, [currentQuestion.field]: trimmed };
    setAnswers(nextAnswers);
    setOtherValue("");
    setExpandedOtherKey(null);
    advanceOrComplete(nextAnswers);
  }, [otherValue, disabled, currentQuestion, answers, advanceOrComplete]);

  const goBack = useCallback(() => {
    if (currentStep === 0) return;
    setSlideDirection("right");
    requestAnimationFrame(() => {
      setTimeout(() => {
        setCurrentStep((s) => s - 1);
        setExpandedOtherKey(null);
        setOtherValue("");
        setSlideDirection(null);
      }, 200);
    });
  }, [currentStep]);

  if (!currentQuestion) return null;

  return (
    <Card
      data-testid="agent-clarification-card"
      className="mt-3 border border-amber-200 bg-amber-50/70"
    >
    <Card.Content className="space-y-2 p-3">
      {/* Step indicator for wizard mode */}
      {isWizard ? (
        <div className="flex items-center justify-center gap-1.5 pb-1">
          {questions.map((_, idx) => (
            <span
              key={questions[idx].id}
              className={cn(
                "inline-block h-2 w-2 rounded-full transition-all duration-300",
                idx < currentStep
                  ? "bg-amber-500"
                  : idx === currentStep
                    ? "scale-125 bg-amber-400"
                    : "bg-amber-200",
              )}
            />
          ))}
        </div>
      ) : null}

      {/* Question area with slide animation */}
      <div ref={containerRef} className="overflow-hidden">
        <div
          className={cn(
            "transition-transform duration-200 ease-in-out",
            slideDirection === "left" && "-translate-x-4 opacity-0",
            slideDirection === "right" && "translate-x-4 opacity-0",
            !slideDirection && "translate-x-0 opacity-100",
          )}
          style={{ transition: "transform 200ms ease-in-out, opacity 200ms ease-in-out" }}
        >
          <p data-testid="agent-clarification-question" className="text-sm font-medium text-amber-950">
            {currentQuestion.question}
          </p>
          <div className="mt-2 space-y-2">
            {currentQuestion.options.map((option) => {
              const optionKey = `${currentQuestion.id}-${option.key}-${option.value}`;
              const isOtherExpanded = option.isOther && expandedOtherKey === optionKey;
              return (
                <div key={optionKey} className="space-y-2">
                  <Button
                    data-testid={`agent-clarification-option-${option.key}`}
                    isDisabled={disabled}
                    onPress={() => handleSelect(option)}
                    className={cn(
                      "flex h-auto w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left",
                      option.isOther
                        ? "border-dashed border-amber-300 bg-white hover:bg-amber-50"
                        : "border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50",
                    )}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900">
                      {option.key}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-foreground">{option.label}</span>
                      {option.description ? (
                        <span className="mt-1 block text-xs leading-5 text-muted">{option.description}</span>
                      ) : null}
                    </span>
                  </Button>

                  {isOtherExpanded ? (
                    <div className="rounded-xl border border-amber-200 bg-white p-2">
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          type="text"
                          value={otherValue}
                          onChange={(event) => setOtherValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.nativeEvent.isComposing) return;
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submitOther();
                            }
                          }}
                          placeholder={otherPlaceholder}
                          className="flex-1 text-sm"
                        />
                        <Button
                          onPress={submitOther}
                          isDisabled={disabled || otherValue.trim().length === 0}
                          variant="primary"
                          size="sm"
                        >
                          {isZh ? "发送" : "Send"}
                        </Button>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                        {isZh ? "按" : "Press"}{" "}
                        <Kbd><Kbd.Abbr keyValue="enter" /></Kbd>
                        {" "}{isZh ? "可直接提交当前补充信息" : "to submit this detail"}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Back button for wizard mode */}
      {isWizard && currentStep > 0 ? (
        <div className="pt-1">
          <Button
            variant="ghost"
            onPress={goBack}
            isDisabled={disabled}
            size="sm"
            className="text-xs font-medium text-amber-700 hover:text-amber-900"
          >
            {isZh ? "← 上一步" : "← Back"}
          </Button>
        </div>
      ) : null}
    </Card.Content>
    </Card>
  );
}
