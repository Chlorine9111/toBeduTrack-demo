"use client";

import { useCallback } from "react";
import type { LessonPlanBlock, CalloutSubtype } from "@/lib/lesson-plan/types";
import { Button, Input, TextArea, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import {
  AlertTriangle,
  Lightbulb,
  AlertOctagon,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";

type Props = {
  block: LessonPlanBlock;
  onChange: (next: LessonPlanBlock) => void;
};

const str = (val: unknown, fallback = ""): string =>
  typeof val === "string" ? val : fallback;

const strArr = (val: unknown): string[] =>
  Array.isArray(val) ? val.filter((v): v is string => typeof v === "string") : [];

const bool = (val: unknown, fallback = false): boolean =>
  typeof val === "boolean" ? val : fallback;

type OptionItem = { id: string; text: string };

const optionsArr = (val: unknown): OptionItem[] => {
  if (!Array.isArray(val)) return [];
  return val.filter(
    (v): v is OptionItem =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as Record<string, unknown>).id === "string" &&
      typeof (v as Record<string, unknown>).text === "string",
  );
};

const labelCls =
  "block text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5";
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 transition-all duration-200";
const textareaCls = `${inputCls} resize-y`;

const HEADING_LEVELS = [
  { value: "h1", label: "H1" },
  { value: "h2", label: "H2" },
  { value: "h3", label: "H3" },
] as const;

const CALLOUT_OPTIONS: {
  value: CalloutSubtype;
  label: string;
  icon: React.ReactNode;
  activeBg: string;
  activeBorder: string;
  activeText: string;
}[] = [
  {
    value: "warning",
    label: "警告",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    activeBg: "bg-amber-50 dark:bg-amber-950/30",
    activeBorder: "border-amber-400",
    activeText: "text-amber-700 dark:text-amber-300",
  },
  {
    value: "think",
    label: "思考",
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    activeBg: "bg-sky-50 dark:bg-sky-950/30",
    activeBorder: "border-sky-400",
    activeText: "text-sky-700 dark:text-sky-300",
  },
  {
    value: "misconception",
    label: "误区",
    icon: <AlertOctagon className="h-3.5 w-3.5" />,
    activeBg: "bg-rose-50 dark:bg-rose-950/30",
    activeBorder: "border-rose-400",
    activeText: "text-rose-700 dark:text-rose-300",
  },
  {
    value: "connection",
    label: "关联",
    icon: <Link2 className="h-3.5 w-3.5" />,
    activeBg: "bg-emerald-50 dark:bg-emerald-950/30",
    activeBorder: "border-emerald-400",
    activeText: "text-emerald-700 dark:text-emerald-300",
  },
];

function MetaFields({
  block,
  onChange,
}: {
  block: LessonPlanBlock;
  onChange: (next: LessonPlanBlock) => void;
}) {
  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-700">
      <div>
        <label className={labelCls}>CED 代码（逗号分隔）</label>
        <Input
          type="text"
          className={inputCls}
          value={block.cedCodes.join(", ")}
          placeholder="例如 LO 1.2.A, EK 1.2.A.1"
          onChange={(e) =>
            onChange({
              ...block,
              cedCodes: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className={labelCls}>教师备注（可选）</label>
        <TextArea
          className={`${textareaCls} h-16`}
          value={block.teacherNote ?? ""}
          placeholder="添加教师备注..."
          onChange={(e) =>
            onChange({
              ...block,
              teacherNote: e.target.value || null,
            })
          }
        />
      </div>
    </div>
  );
}

function HeadingForm({ block, onChange }: Props) {
  const level = str(block.content.level, "h2");
  const text = str(block.content.text);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>层级</label>
        <ToggleButtonGroup
          selectionMode="single"
          selectedKeys={[level]}
          onSelectionChange={(keys) => {
            const selected = [...keys][0] as string | undefined;
            if (selected) updateContent({ level: selected });
          }}
          className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-600"
        >
          {HEADING_LEVELS.map((h) => (
            <ToggleButton
              key={h.value}
              id={h.value}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                level === h.value
                  ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {h.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <div>
        <label className={labelCls}>文本</label>
        <Input
          type="text"
          className={inputCls}
          value={text}
          placeholder="输入标题文本..."
          onChange={(e) => updateContent({ text: e.target.value })}
        />
      </div>
    </div>
  );
}

function ParagraphForm({ block, onChange }: Props) {
  const text = str(block.content.text);

  return (
    <div>
      <label className={labelCls}>正文内容</label>
      <TextArea
        className={`${textareaCls} h-32`}
        value={text}
        placeholder="输入段落内容..."
        onChange={(e) =>
          onChange({ ...block, content: { ...block.content, text: e.target.value } })
        }
      />
    </div>
  );
}

function MathForm({ block, onChange }: Props) {
  const latex = str(block.content.latex);
  const displayMode = bool(block.content.displayMode);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>LaTeX 公式</label>
        <TextArea
          className={`${textareaCls} h-24 font-mono text-xs`}
          value={latex}
          placeholder="例如 \frac{a}{b}"
          onChange={(e) => updateContent({ latex: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={displayMode}
          onChange={(e) => updateContent({ displayMode: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
        />
        居中显示模式
      </label>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        预览时将使用 KaTeX 渲染公式
      </p>
    </div>
  );
}

function ImageForm({ block, onChange }: Props) {
  const url = str(block.content.url);
  const alt = str(block.content.alt);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>图片 URL</label>
        <Input
          type="text"
          className={inputCls}
          value={url}
          placeholder="https://..."
          onChange={(e) => updateContent({ url: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>替代文本</label>
        <Input
          type="text"
          className={inputCls}
          value={alt}
          placeholder="描述图片内容..."
          onChange={(e) => updateContent({ alt: e.target.value })}
        />
      </div>
    </div>
  );
}

function CalloutForm({ block, onChange }: Props) {
  const subtype = block.subtype ?? "think";
  const title = str(block.content.title);
  const text = str(block.content.text);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>类型</label>
        <div className="flex flex-wrap gap-2">
          {CALLOUT_OPTIONS.map((opt) => {
            const isActive = subtype === opt.value;
            return (
              <Button
                key={opt.value}
                size="sm"
                variant="ghost"
                onPress={() => onChange({ ...block, subtype: opt.value })}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? `${opt.activeBorder} ${opt.activeBg} ${opt.activeText}`
                    : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
                }`}
              >
                {opt.icon}
                {opt.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div>
        <label className={labelCls}>标题</label>
        <Input
          type="text"
          className={inputCls}
          value={title}
          placeholder="提示框标题..."
          onChange={(e) => updateContent({ title: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>内容</label>
        <TextArea
          className={`${textareaCls} h-24`}
          value={text}
          placeholder="提示框内容..."
          onChange={(e) => updateContent({ text: e.target.value })}
        />
      </div>
    </div>
  );
}

function DividerForm() {
  return (
    <p className="py-2 text-center text-sm italic text-slate-400 dark:text-slate-500">
      分隔线 — 无需编辑
    </p>
  );
}

function DefinitionForm({ block, onChange }: Props) {
  const term = str(block.content.term);
  const explanation = str(block.content.explanation);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>术语</label>
        <Input
          type="text"
          className={inputCls}
          value={term}
          placeholder="要定义的术语..."
          onChange={(e) => updateContent({ term: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>解释</label>
        <TextArea
          className={`${textareaCls} h-24`}
          value={explanation}
          placeholder="术语的详细解释..."
          onChange={(e) => updateContent({ explanation: e.target.value })}
        />
      </div>
    </div>
  );
}

function ExampleForm({ block, onChange }: Props) {
  const prompt = str(block.content.prompt);
  const steps = strArr(block.content.steps);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>题目 / 提示</label>
        <TextArea
          className={`${textareaCls} h-20`}
          value={prompt}
          placeholder="例题的题目或提示..."
          onChange={(e) => updateContent({ prompt: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>解题步骤（每行一步）</label>
        <TextArea
          className={`${textareaCls} h-28`}
          value={steps.join("\n")}
          placeholder={"步骤一: ...\n步骤二: ...\n步骤三: ..."}
          onChange={(e) =>
            updateContent({ steps: e.target.value.split("\n").filter(Boolean) })
          }
        />
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          每行将自动生成一个编号步骤
        </p>
      </div>
    </div>
  );
}

function StepsForm({ block, onChange }: Props) {
  const title = str(block.content.title);
  const items = strArr(block.content.items);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>标题</label>
        <Input
          type="text"
          className={inputCls}
          value={title}
          placeholder="步骤标题..."
          onChange={(e) => updateContent({ title: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>步骤项（每行一步）</label>
        <TextArea
          className={`${textareaCls} h-28`}
          value={items.join("\n")}
          placeholder={"第一步\n第二步\n第三步"}
          onChange={(e) =>
            updateContent({ items: e.target.value.split("\n").filter(Boolean) })
          }
        />
      </div>
    </div>
  );
}

function QuizForm({ block, onChange }: Props) {
  const question = str(block.content.question);
  const options = optionsArr(block.content.options);
  const correctId = str(block.content.correctOptionId);
  const explanation = str(block.content.explanation);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  const addOption = () => {
    const id = `opt_${Date.now()}`;
    updateContent({ options: [...options, { id, text: "" }] });
  };

  const removeOption = (optId: string) => {
    const next = options.filter((o) => o.id !== optId);
    const patch: Record<string, unknown> = { options: next };
    if (correctId === optId) {
      patch.correctOptionId = next[0]?.id ?? "";
    }
    updateContent(patch);
  };

  const updateOptionText = (optId: string, text: string) => {
    updateContent({
      options: options.map((o) => (o.id === optId ? { ...o, text } : o)),
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>问题</label>
        <TextArea
          className={`${textareaCls} h-20`}
          value={question}
          placeholder="输入测验题目..."
          onChange={(e) => updateContent({ question: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>选项</label>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={opt.id} className="flex items-center gap-2">
              <input
                type="radio"
                name={`quiz-correct-${block.id}`}
                checked={correctId === opt.id}
                onChange={() => updateContent({ correctOptionId: opt.id })}
                className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                title="标记为正确答案"
              />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {String.fromCharCode(65 + i)}
              </span>
              <Input
                type="text"
                className={`${inputCls} flex-1`}
                value={opt.text}
                placeholder={`选项 ${String.fromCharCode(65 + i)}...`}
                onChange={(e) => updateOptionText(opt.id, e.target.value)}
              />
              {options.length > 2 && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => removeOption(opt.id)}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  aria-label="删除选项"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {options.length < 8 && (
          <Button
            size="sm"
            variant="ghost"
            onPress={addOption}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <Plus className="h-3.5 w-3.5" />
            添加选项
          </Button>
        )}
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          点击单选按钮标记正确答案
        </p>
      </div>
      <div>
        <label className={labelCls}>解析</label>
        <TextArea
          className={`${textareaCls} h-20`}
          value={explanation}
          placeholder="解释为什么这是正确答案..."
          onChange={(e) => updateContent({ explanation: e.target.value })}
        />
      </div>
    </div>
  );
}

function PollForm({ block, onChange }: Props) {
  const question = str(block.content.question);
  const options = optionsArr(block.content.options);

  const updateContent = useCallback(
    (patch: Record<string, unknown>) =>
      onChange({ ...block, content: { ...block.content, ...patch } }),
    [block, onChange],
  );

  const addOption = () => {
    const id = `opt_${Date.now()}`;
    updateContent({ options: [...options, { id, text: "" }] });
  };

  const removeOption = (optId: string) => {
    updateContent({
      options: options.filter((o) => o.id !== optId),
    });
  };

  const updateOptionText = (optId: string, text: string) => {
    updateContent({
      options: options.map((o) => (o.id === optId ? { ...o, text } : o)),
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>问题</label>
        <TextArea
          className={`${textareaCls} h-20`}
          value={question}
          placeholder="输入投票问题..."
          onChange={(e) => updateContent({ question: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>选项</label>
        <div className="space-y-2">
          {options.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2">
              <Input
                type="text"
                className={`${inputCls} flex-1`}
                value={opt.text}
                placeholder="选项内容..."
                onChange={(e) => updateOptionText(opt.id, e.target.value)}
              />
              {options.length > 2 && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => removeOption(opt.id)}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  aria-label="删除选项"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {options.length < 8 && (
          <Button
            size="sm"
            variant="ghost"
            onPress={addOption}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <Plus className="h-3.5 w-3.5" />
            添加选项
          </Button>
        )}
      </div>
    </div>
  );
}

export default function BlockEditForm({ block, onChange }: Props) {
  switch (block.type) {
    case "heading":
      return (
        <div className="space-y-0">
          <HeadingForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "paragraph":
      return (
        <div className="space-y-0">
          <ParagraphForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "math":
      return (
        <div className="space-y-0">
          <MathForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "image":
      return (
        <div className="space-y-0">
          <ImageForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "callout":
      return (
        <div className="space-y-0">
          <CalloutForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "divider":
      return (
        <div className="space-y-0">
          <DividerForm />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "definition":
      return (
        <div className="space-y-0">
          <DefinitionForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "example":
      return (
        <div className="space-y-0">
          <ExampleForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "steps":
      return (
        <div className="space-y-0">
          <StepsForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "quiz":
      return (
        <div className="space-y-0">
          <QuizForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    case "poll":
      return (
        <div className="space-y-0">
          <PollForm block={block} onChange={onChange} />
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
    default:
      return (
        <div className="space-y-0">
          <p className="text-sm italic text-slate-400 dark:text-slate-500">
            未知区块类型
          </p>
          <MetaFields block={block} onChange={onChange} />
        </div>
      );
  }
}
