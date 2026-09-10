"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Alert, Button, Chip } from "@heroui/react";
import {
  ClipboardList,
  FileText,
  FileCheck,
  BookOpen,
  BookOpenText,
  Lightbulb,
  Paperclip,
  ArrowUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentReferenceSelection } from "@/components/main/content-assets/AssetReferencePicker";
import { AssetReadyNotification } from "./AssetReadyNotification";
import { isPblUiEnabled } from "@/lib/pbl/feature";
import { useReducedMotion } from "./animation-constants";
import AnnouncementPopover from "./AnnouncementPopover";

type AgentWorkspaceIdleStateProps = {
  isZh: boolean;
  workspaceLoadErrorText: string;
  conversationWarningText: string;
  input: string;
  canSend: boolean;
  referenceUploadHint: string;
  streaming: boolean;
  selectedReferences: AgentReferenceSelection[];
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onOpenMaterialUpload: () => void;
  onOpenReferencePicker: () => void;
  onRemoveReference: (id: string) => void;
  assetReadyNotification?: { title: string; summary: string } | null;
  onDismissAssetNotification?: () => void;
};

const QUICK_ACTIONS = [
  {
    id: "rubric",
    icon: ClipboardList,
    label: "Rubric",
    sublabel: { zh: "评分标准", en: "Criteria & levels" },
    bgColor: "rgba(221,237,234,0.8)",
    iconColor: "text-success",
    prompt: { zh: "帮我生成一份评分标准 Rubric", en: "Create a rubric" },
  },
  {
    id: "worksheet",
    icon: FileText,
    label: "Worksheet",
    sublabel: { zh: "练习材料", en: "Practice materials" },
    bgColor: "rgba(221,235,241,0.8)",
    iconColor: "text-primary",
    prompt: { zh: "帮我生成一份练习题 Worksheet", en: "Create a worksheet" },
  },
  {
    id: "exam",
    icon: FileCheck,
    label: "Exam",
    sublabel: { zh: "测评试卷", en: "Tests & assessments" },
    bgColor: "rgba(250,235,221,0.8)",
    iconColor: "text-[#D9730D]",
    prompt: { zh: "帮我生成一份测评试卷", en: "Create an exam" },
  },
  {
    id: "lesson-plan",
    icon: BookOpen,
    label: "Lesson Plan",
    sublabel: { zh: "教案结构", en: "Guided structure" },
    bgColor: "rgba(234,228,242,0.8)",
    iconColor: "text-[#6940A5]",
    prompt: { zh: "帮我生成一份教案", en: "Create a lesson plan" },
  },
  {
    id: "pbl",
    icon: Lightbulb,
    label: "PBL",
    sublabel: { zh: "项目式学习", en: "Project-based flows" },
    bgColor: "rgba(245,224,233,0.8)",
    iconColor: "text-[#AD1A72]",
    prompt: { zh: "帮我设计一个 PBL 项目", en: "Design a PBL project" },
  },
] as const;

const TIPS_POOL = [
  { zh: "试试把 PDF 作为资料上传到右侧上下文，后续回答会直接引用它", en: "Try uploading a PDF as reference material from the context sidebar" },
  { zh: "可以指定 AP 课程和单元生成针对性练习", en: "Specify an AP course and unit for targeted exercises" },
  { zh: "生成的 Rubric 可以直接导出为 PDF", en: "Generated rubrics can be exported as PDF" },
  { zh: "试试 \"帮我设计一个 AP Biology 的项目式学习方案\"", en: "Try \"Design a PBL project for AP Biology\"" },
  { zh: "可以一次生成多道题目，指定题型和难度", en: "Generate multiple questions at once with custom types and difficulty" },
  { zh: "生成的教案包含学习目标、活动设计和评估方式", en: "Lesson plans include objectives, activities, and assessments" },
  { zh: "试试拖拽调整右侧面板宽度，找到最舒适的布局", en: "Drag to resize the right panel for a comfortable layout" },
  { zh: "支持中英文输入，可以用中文描述需求", en: "Supports both Chinese and English input" },
  { zh: "可以基于 College Board 出题模式生成高仿真习题", en: "Generate high-fidelity exercises based on College Board exam patterns" },
  { zh: "试试 \"帮我设计一份科学展览的评分标准\"", en: "Try \"Create a rubric for a science fair project\"" },
  { zh: "生成的 Worksheet 可以自定义题目数量和类型", en: "Customize the number and types of questions in worksheets" },
  { zh: "上传学生作业 PDF 可以自动评分和反馈", en: "Upload student work PDFs for auto-grading and feedback" },
] as const;

const TYPEWRITER_PROMPTS = {
  zh: [
    "帮我生成一份 AP Chemistry 的评分标准...",
    "做一个 AP Calculus AB 关于 limits 的 Worksheet...",
    "帮我设计一份科学展览的 Rubric...",
    "生成 5 道 AP Physics 选择题...",
    "帮我做一份 AP English 的 Lesson Plan...",
    "上传 PDF 后帮我自动评分...",
  ],
  en: [
    "Create a rubric for AP Chemistry...",
    "Generate a worksheet on AP Calculus limits...",
    "Design a rubric for a science fair project...",
    "Create 5 AP Physics multiple choice questions...",
    "Make a lesson plan for AP English...",
    "Upload a PDF and auto-grade student work...",
  ],
};

function useTypewriter(prompts: string[], typingSpeed = 45, pauseMs = 2200, deleteSpeed = 25) {
  const [display, setDisplay] = useState("");
  const indexRef = useRef(0);
  const phaseRef = useRef<"typing" | "pausing" | "deleting">("typing");
  const charRef = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      const current = prompts[indexRef.current];
      const phase = phaseRef.current;

      if (phase === "typing") {
        charRef.current += 1;
        setDisplay(current.slice(0, charRef.current));
        if (charRef.current >= current.length) {
          phaseRef.current = "pausing";
          timer = setTimeout(tick, pauseMs);
        } else {
          timer = setTimeout(tick, typingSpeed + Math.random() * 30);
        }
      } else if (phase === "pausing") {
        phaseRef.current = "deleting";
        timer = setTimeout(tick, deleteSpeed);
      } else {
        charRef.current -= 1;
        setDisplay(current.slice(0, charRef.current));
        if (charRef.current <= 0) {
          indexRef.current = (indexRef.current + 1) % prompts.length;
          phaseRef.current = "typing";
          timer = setTimeout(tick, 400);
        } else {
          timer = setTimeout(tick, deleteSpeed);
        }
      }
    }

    timer = setTimeout(tick, 800);
    return () => clearTimeout(timer);
  }, [prompts, typingSpeed, pauseMs, deleteSpeed]);

  return display;
}

const VISIBLE_QUICK_ACTIONS = QUICK_ACTIONS.filter((action) =>
  action.id === "pbl" ? isPblUiEnabled() : true,
);

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: "beforeChildren" as const,
      delayChildren: 0.16,
      staggerChildren: 0.06,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: EASE_OUT },
  },
};

const noMotionImmediate = { opacity: 1, y: 0, scale: 1 };

export default function AgentWorkspaceIdleState({
  isZh,
  workspaceLoadErrorText,
  conversationWarningText,
  input,
  canSend,
  referenceUploadHint,
  streaming,
  selectedReferences,
  composerRef,
  onInputChange,
  onSend,
  onOpenMaterialUpload,
  onOpenReferencePicker,
  onRemoveReference,
  assetReadyNotification = null,
  onDismissAssetNotification,
}: AgentWorkspaceIdleStateProps) {
  const prefersReducedMotion = useReducedMotion();
  const typewriterText = useTypewriter(isZh ? TYPEWRITER_PROMPTS.zh : TYPEWRITER_PROMPTS.en, 30, 2000, 18);

  const handleQuickAction = (action: (typeof QUICK_ACTIONS)[number]) => {
    const prompt = isZh ? action.prompt.zh : action.prompt.en;
    onInputChange(prompt);
  };

  return (
    <div className="relative flex flex-1 flex-col items-center justify-start overflow-hidden pt-[15vh]">
      {/* 右上角公告按钮 */}
      <div className="absolute right-5 top-4 z-30">
        <AnnouncementPopover />
      </div>

      {/* Background blur decorations */}
      <div className="pointer-events-none fixed bottom-0 right-0 -z-10 p-12 opacity-20">
        <div className="h-64 w-64 rounded-full bg-default-100 blur-[80px]" />
      </div>
      <div className="pointer-events-none fixed left-64 top-20 -z-10 p-12 opacity-20">
        <div className="h-48 w-48 rounded-full bg-primary/10 blur-[60px]" />
      </div>

      <div className="flex w-full max-w-5xl flex-col items-center px-8 py-6">
        {/* Error banners */}
        {workspaceLoadErrorText ? (
          <Alert color="warning" className="mb-4 w-full max-w-[640px]">
            {workspaceLoadErrorText}
          </Alert>
        ) : null}
        {conversationWarningText ? (
          <Alert color="warning" className="mb-4 w-full max-w-[640px]">
            {conversationWarningText}
          </Alert>
        ) : null}
        {referenceUploadHint ? (
          <Alert
            data-testid="agent-reference-processing-hint"
            color="warning"
           
            className="mb-4 w-full max-w-[640px]"
          >
            {referenceUploadHint}
          </Alert>
        ) : null}

        {/* Greeting */}
        <div className="mb-8 text-center">
          <motion.h1
            data-testid="agent-welcome-heading"
            className="mb-2 text-[28px] font-semibold tracking-tight text-foreground"
            initial={prefersReducedMotion ? noMotionImmediate : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_OUT }}
          >
            {isZh ? "想创建什么？" : "What would you like to create?"}
          </motion.h1>
          <motion.p
            className="text-sm text-default-400"
            initial={prefersReducedMotion ? noMotionImmediate : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.08, duration: 0.4, ease: EASE_OUT }}
          >
            {isZh
              ? "选择一个起点，或使用下方的助手描述你的需求。"
              : "Select a starting point or use the assistant below."}
          </motion.p>
        </div>

        {/* Quick Action Cards */}
        <motion.div
          className="mb-10 flex w-full flex-wrap justify-center gap-4"
          variants={prefersReducedMotion ? undefined : containerVariants}
          initial={prefersReducedMotion ? undefined : "hidden"}
          animate={prefersReducedMotion ? undefined : "visible"}
        >
          {VISIBLE_QUICK_ACTIONS.map((action) => (
            <motion.button
              key={action.id}
              type="button"
              onClick={() => handleQuickAction(action)}
              disabled={streaming}
              className="flex h-[120px] w-[140px] flex-col items-start rounded-2xl border border-divider bg-white p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
              variants={prefersReducedMotion ? undefined : cardVariants}
            >
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
                style={{ backgroundColor: action.bgColor }}
              >
                <action.icon className={cn("h-5 w-5", action.iconColor)} />
              </div>
              <span className="mb-1 block text-sm font-semibold text-foreground">
                {action.label}
              </span>
              <span className="text-xs leading-tight text-default-400">
                {isZh ? action.sublabel.zh : action.sublabel.en}
              </span>
            </motion.button>
          ))}
        </motion.div>

        {/* Search / Input Area */}
        <motion.div
          className="flex w-full max-w-[640px] flex-col items-center"
          initial={prefersReducedMotion ? noMotionImmediate : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.3, duration: 0.35, ease: EASE_OUT }}
        >
          {onDismissAssetNotification ? (
            <AssetReadyNotification
              notification={assetReadyNotification}
              onDismiss={onDismissAssetNotification}
            />
          ) : null}
          {selectedReferences.length > 0 ? (
            <div className="mb-3 flex w-full flex-wrap gap-2">
              {selectedReferences.map((item) => (
                <Chip
                  key={item.id}
                  data-testid="agent-asset-reference-tag"
                 
                  color={item.assetSource === "reference" ? "accent" : "warning"}
                  className="cursor-pointer"
                  onClick={() => onRemoveReference(item.id)}
                >
                  {item.assetSource === "reference" ? (
                    <BookOpenText className="mr-1 inline h-3.5 w-3.5" />
                  ) : (
                    <FileText className="mr-1 inline h-3.5 w-3.5" />
                  )}
                  <span className="max-w-[220px] truncate">{item.title}</span>
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="group relative w-full">
            {/* Blur glow behind input */}
            <div className="absolute inset-0 rounded-full bg-default-50 blur-xl transition-all duration-500 group-focus-within:bg-default-100" />

            {/* Input container */}
            <div data-tour-id="agent-input" className="relative flex items-center rounded-full border border-divider bg-surface p-2 shadow-sm transition-all duration-300 focus-within:border-muted focus-within:shadow-md">
              {/* Typewriter placeholder overlay */}
              {input.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center px-8 text-[14px] text-muted">
                  <span>{typewriterText}</span>
                  <span className="ml-px inline-block h-[18px] w-[2px] animate-pulse bg-muted" />
                </div>
              )}
              <input
                ref={composerRef as unknown as React.RefObject<HTMLInputElement>}
                id="agent-idle-composer"
                name="agentIdleComposer"
                type="text"
                autoComplete="off"
                value={input}
                data-testid="agent-composer"
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (canSend) void onSend();
                  }
                }}
                placeholder=""
                className="flex-1 border-none bg-transparent px-6 py-3 text-[14px] text-foreground placeholder:text-transparent focus:outline-hidden focus:ring-0"
              />

              {/* File upload */}
              <Button
                isIconOnly
                variant="ghost"
                data-testid="agent-open-material-upload"
                onPress={onOpenMaterialUpload}
                aria-label={isZh ? "上传资料到上下文" : "Upload material to context"}
                className="mr-1 h-10 w-10 shrink-0 rounded-full"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Button
                isIconOnly
                variant="ghost"
                data-testid="agent-open-reference-picker"
                onPress={onOpenReferencePicker}
                aria-label={isZh ? "打开内容引用面板" : "Open reference picker"}
                className="mr-1 h-10 w-10 shrink-0 rounded-full"
              >
                <BookOpenText className="h-4 w-4" />
              </Button>

              {/* Send button */}
              <Button
                isIconOnly
                data-testid="agent-send-button"
                onPress={() => void onSend()}
                isDisabled={!canSend}
                className={cn(
                  "mr-1 size-10 shrink-0 rounded-full transition-colors",
                  canSend
                    ? "bg-accent text-white hover:opacity-90"
                    : "bg-default text-muted",
                )}
              >
                <ArrowUp className="size-5" />
              </Button>
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
