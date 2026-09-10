import { randomUUID } from "crypto";
import type { AgentTaskContext } from "@/lib/agent/chat-shared";
import type { PblPlan, PblSimpleInput } from "@/lib/pbl/types";
import { generatePblProject } from "@/lib/pbl/generator";

export type PblWorkflowOutput = {
  ok: true;
  plan: PblPlan;
  inputSummary: string;
  overviewCount: number;
  selectedOption: string;
  webResources: PblPlan["searchResults"];
  timings: Record<string, number>;
} | {
  ok: false;
  reason: string;
};

function inferPblInput(teacherRequest: string): PblSimpleInput {
  const curriculumMatch = teacherRequest.match(/\b(AP|IB|CN)\b/i);
  const subjectMatch =
    teacherRequest.match(/(AP\s+[A-Za-z :&-]+|IB\s+[A-Za-z :&-]+|高中(?:数学|英语|语文|物理|化学|生物|历史|地理|思想政治|信息技术))/i) ??
    teacherRequest.match(/(化学|物理|生物|数学|历史|英语|地理|经济|计算机)/i);
  const gradeMatch =
    teacherRequest.match(/(高[一二三]|初[一二三]|[一二三四五六七八九十]年级)/i) ??
    teacherRequest.match(/grade\s*(\d{1,2})/i);
  const periodsMatch = teacherRequest.match(/(\d{1,2})\s*(?:课时|节|periods?)/i);

  return {
    prompt: teacherRequest,
    curriculumSystem: curriculumMatch?.[1]?.toUpperCase() as PblSimpleInput["curriculumSystem"],
    subject: subjectMatch?.[1]?.trim(),
    grade: gradeMatch?.[0]?.trim(),
    totalPeriods: periodsMatch ? Number(periodsMatch[1]) : undefined,
  };
}

function resolveCurriculumFromText(value: string) {
  if (/\bIB\b/i.test(value)) return "IB";
  if (/\bAP\b/i.test(value)) return "AP";
  if (/\bCN\b/i.test(value) || /新课标|高中|初中|小学/.test(value)) return "CN";
  return undefined;
}

function mergeTaskContextIntoPblInput(
  teacherRequest: string,
  taskContext?: AgentTaskContext | null,
): PblSimpleInput {
  const base = inferPblInput(teacherRequest);
  const curriculumHint = taskContext?.curriculum?.trim() ?? "";
  const topicHint = taskContext?.topic?.trim() ?? "";

  const enrichedPrompt = [
    teacherRequest.trim(),
    curriculumHint ? `课程体系/学科提示：${curriculumHint}` : "",
    topicHint ? `项目主题提示：${topicHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...base,
    prompt: enrichedPrompt,
    curriculumSystem:
      resolveCurriculumFromText(curriculumHint) ??
      base.curriculumSystem,
    subject: curriculumHint || base.subject,
  };
}

function summarizePlan(plan: PblPlan) {
  return `${plan.primarySubject} / ${plan.grade} / ${plan.curriculumSystem} / ${plan.totalPeriods}课时`;
}

export async function runPblWorkflow(params: {
  teacherRequest: string;
  taskContext?: AgentTaskContext | null;
}): Promise<PblWorkflowOutput> {
  try {
    const input = mergeTaskContextIntoPblInput(
      params.teacherRequest,
      params.taskContext,
    );
    const result = await generatePblProject(input);
    const now = new Date().toISOString();
    const plan: PblPlan = {
      ...result.plan,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    return {
      ok: true,
      plan,
      inputSummary: summarizePlan(plan),
      overviewCount: 1,
      selectedOption: "FULL",
      webResources: result.searchResults,
      timings: result.timings,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "PBL 生成失败",
    };
  }
}
