"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import type { PblCurriculumSystem } from "@/lib/pbl/types";

function buildWorkspacePrompt(params: {
  prompt: string;
  curriculumSystem?: PblCurriculumSystem | "";
  grade?: string;
  subject?: string;
}) {
  const normalizedPrompt = params.prompt.trim();
  const details = [
    params.curriculumSystem ? `课程体系：${params.curriculumSystem}` : "",
    params.grade?.trim() ? `年级：${params.grade.trim()}` : "",
    params.subject?.trim() ? `学科：${params.subject.trim()}` : "",
  ].filter(Boolean);

  if (details.length === 0) {
    return normalizedPrompt;
  }

  return [
    "请帮我设计一个 PBL 项目，并按 PBL 文档格式输出完整方案。",
    ...details,
    `需求：${normalizedPrompt}`,
  ].join("\n");
}

export function PblCreateInput() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [curriculumSystem, setCurriculumSystem] = useState<PblCurriculumSystem | "">("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [routing, setRouting] = useState(false);
  const handoffTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) {
        window.clearTimeout(handoffTimerRef.current);
      }
    };
  }, []);

  const canSubmit = prompt.trim().length >= 5 && !routing;

  async function handleSubmit() {
    if (!canSubmit) return;
    setRouting(true);
    const nextPrompt = buildWorkspacePrompt({
      prompt,
      curriculumSystem,
      grade,
      subject,
    });
    handoffTimerRef.current = window.setTimeout(() => {
      router.push(`/main/agent?prompt=${encodeURIComponent(nextPrompt)}`);
    }, 120);
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white shadow-xs">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={"描述你想要的 PBL 项目...\n\n例如：我想以过山车安全问题为主题，给高二学生设计一个有关物理知识的 PBL 项目，大约 6 周。"}
          className="min-h-[200px] w-full resize-none border-0 px-5 py-5 text-sm leading-7 outline-hidden placeholder:text-[#9B9DA4]"
          disabled={routing}
        />
        <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.04)] px-5 py-3">
          <button
            type="button"
            onClick={() => setShowOptions((value) => !value)}
            className="inline-flex items-center gap-1 text-xs text-[#6B6F76] transition hover:text-slate-800"
          >
            {showOptions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            可选参数
          </button>
          <span className="text-xs text-[#9B9DA4]">{prompt.length}/2000</span>
        </div>
      </div>

      {showOptions ? (
        <div className="grid gap-3 rounded-3xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] p-4 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-xs text-[#6B6F76]">课程体系</span>
            <select
              value={curriculumSystem}
              onChange={(event) => setCurriculumSystem(event.target.value as PblCurriculumSystem | "")}
              className="h-10 w-full rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-3 text-sm outline-hidden"
            >
              <option value="">自动识别</option>
              <option value="CN">中国新课标</option>
              <option value="AP">AP</option>
              <option value="IB">IB</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-[#6B6F76]">年级</span>
            <input
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              placeholder="如：高二"
              className="h-10 w-full rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-3 text-sm outline-hidden"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-[#6B6F76]">学科</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="如：物理 / AP Chemistry"
              className="h-10 w-full rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-3 text-sm outline-hidden"
            />
          </label>
        </div>
      ) : null}

      {routing ? (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-[rgba(35,131,226,0.2)] bg-[rgba(94,106,210,0.08)] px-4 py-4 text-sm text-[#0B6E99]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            正在转到主工作台，并开始生成 PBL 项目...
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-3xl bg-[#1D1D1F] px-8 py-4 text-sm font-semibold text-white shadow-xs transition hover:bg-[#3a3a3c] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          前往主工作台生成
        </button>
      )}

      <div className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] p-4">
        <p className="text-xs font-medium text-[#6B6F76]">示例输入</p>
        <div className="mt-2 space-y-1.5">
          {[
            "以全球气候变化为主题，给初三学生设计一个跨学科（地理+生物）PBL项目",
            "围绕食品安全设计高一化学 PBL 项目，希望学生能做实验检测",
            "AP Physics 1, design a PBL around bridge engineering for 10th graders",
          ].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="block w-full rounded-2xl px-3 py-2 text-left text-xs text-[#6B6F76] transition hover:bg-white hover:text-[#1D1D1F]"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
