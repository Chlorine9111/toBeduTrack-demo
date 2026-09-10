import { tool } from "ai";
import { z } from "zod";
import { createApQuestionBankClient } from "@/lib/question-bank/ap-question-bank";
import type { ApQuestionBankListItem } from "@/lib/question-bank/ap-types";
import { assembleExamFromContext } from "./assembler";
import * as store from "./store";
import type { ExamAgentContext } from "./agent-context";

async function queryTikuQuestions(params: {
  course: string;
  unit?: number;
  difficulty?: string;
  limit: number;
}): Promise<{ items: ApQuestionBankListItem[]; total: number }> {
  const supabase = createApQuestionBankClient();
  let query = supabase
    .from("questions")
    .select("id, course, unit, stem, choices, correct_answer, explanation, difficulty, cognitive_task, topic_code, key_concepts, source_type, source_assessment, question_number, stimulus_id, stimulus_dependent, standalone_usable, requires_calculation, negative_stem, created_at", { count: "exact" })
    .eq("course", params.course)
    .limit(params.limit);

  if (params.unit != null) query = query.eq("unit", params.unit);
  if (params.difficulty) query = query.eq("difficulty", params.difficulty);

  query = query.order("unit").order("question_number");

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { items: (data ?? []) as ApQuestionBankListItem[], total: count ?? 0 };
}

function isMcQuestion(q: ApQuestionBankListItem): boolean {
  if (!q.choices) return false;
  const keys = Object.keys(q.choices);
  // _frq_parts means it's FRQ, not MC
  return keys.length >= 4 && !keys.includes("_frq_parts");
}

function questionSummary(q: ApQuestionBankListItem) {
  return {
    id: q.id,
    course: q.course,
    unit: q.unit,
    difficulty: q.difficulty,
    cognitiveTask: q.cognitive_task,
    topicCode: q.topic_code,
    stem: q.stem.slice(0, 120),
    type: isMcQuestion(q) ? "MC" : "FR",
    answer: q.correct_answer,
  };
}

export function createExamAgentTools(ctx: ExamAgentContext) {
  return {
    search_questions: tool({
      description: "从 AP 题库搜索候选题目（12000+ 题）",
      inputSchema: z.object({
        reasoning: z.string(),
        course: z.string().describe("课程代码如 AP_STATS, AP_MICRO, APES"),
        unit: z.number().int().min(1).max(10).optional().describe("单元号"),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        limit: z.number().int().min(5).max(50).default(30),
      }),
      execute: async ({ reasoning, course, unit, difficulty, limit }) => {
        ctx.stepManager.enter("analyze-curriculum");
        ctx.stepManager.log(reasoning, "decision");

        const { items, total } = await queryTikuQuestions({
          course,
          unit,
          difficulty,
          limit,
        });

        // Filter by question type config + dedupe
        const wantsMC = ctx.config.questionTypes.includes("MC");
        const wantsFR = ctx.config.questionTypes.includes("FR");
        const existing = new Set(ctx.candidates.map((c) => c.id));
        const fresh = items.filter((q) => {
          if (existing.has(q.id)) return false;
          const mc = isMcQuestion(q);
          if (wantsMC && !wantsFR && !mc) return false;
          if (wantsFR && !wantsMC && mc) return false;
          return true;
        });
        ctx.candidates.push(...fresh);

        ctx.stepManager.log(`找到 ${items.length} 题（总题库 ${total}），新增 ${fresh.length}（候选池 ${ctx.candidates.length}）`);

        return {
          ok: true,
          found: items.length,
          dbTotal: total,
          pool: ctx.candidates.length,
          top: items.slice(0, 15).map(questionSummary),
        };
      },
    }),

    select_questions: tool({
      description: "从候选池选定题目 ID，组成试卷",
      inputSchema: z.object({
        reasoning: z.string(),
        candidateIds: z.array(z.string()).min(1).max(60),
      }),
      execute: async ({ reasoning, candidateIds }) => {
        ctx.stepManager.enter("plan-blueprint");
        ctx.stepManager.log(reasoning, "decision");

        const pool = new Map(ctx.candidates.map((q) => [q.id, q]));
        const valid = candidateIds.filter((id) => pool.has(id));
        ctx.selectedQuestionIds = [...new Set(valid)];

        const sel = ctx.selectedQuestionIds.map((id) => pool.get(id)!);
        const byType: Record<string, number> = {};
        const byDiff: Record<string, number> = {};
        const byUnit: Record<string, number> = {};
        for (const q of sel) {
          const t = isMcQuestion(q) ? "MC" : "FR";
          byType[t] = (byType[t] ?? 0) + 1;
          byDiff[q.difficulty] = (byDiff[q.difficulty] ?? 0) + 1;
          byUnit[`U${q.unit}`] = (byUnit[`U${q.unit}`] ?? 0) + 1;
        }

        ctx.stepManager.log(`选中 ${valid.length}/${ctx.config.questionCount} 题 | ${JSON.stringify(byType)} | ${JSON.stringify(byDiff)} | ${JSON.stringify(byUnit)}`);
        store.updateProgress(ctx.taskId, valid.length, ctx.config.questionCount);

        return { ok: true, selected: valid.length, target: ctx.config.questionCount, byType, byDiff, byUnit };
      },
    }),

    check_coverage: tool({
      description: "检查已选题的覆盖率（单元/难度/题型）",
      inputSchema: z.object({ reasoning: z.string() }),
      execute: async ({ reasoning }) => {
        ctx.stepManager.enter("verify-review");
        ctx.stepManager.log(reasoning, "decision");

        const pool = new Map(ctx.candidates.map((q) => [q.id, q]));
        const sel = ctx.selectedQuestionIds.map((id) => pool.get(id)).filter(Boolean) as ApQuestionBankListItem[];

        const byUnit: Record<string, number> = {};
        const byDiff: Record<string, number> = {};
        const byType: Record<string, number> = {};
        for (const q of sel) {
          byUnit[`U${q.unit}`] = (byUnit[`U${q.unit}`] ?? 0) + 1;
          byDiff[q.difficulty] = (byDiff[q.difficulty] ?? 0) + 1;
          const t = isMcQuestion(q) ? "MC" : "FR";
          byType[t] = (byType[t] ?? 0) + 1;
        }

        const gaps: string[] = [];
        if (sel.length < ctx.config.questionCount) gaps.push(`差 ${ctx.config.questionCount - sel.length} 题`);
        for (const t of ctx.config.questionTypes) { if (!byType[t]) gaps.push(`缺 ${t}`); }

        const ok = gaps.length === 0;
        ctx.stepManager.log(ok ? "覆盖率合格" : `缺口: ${gaps.join(", ")}`, ok ? "info" : "warn");

        return { ok, selected: sel.length, target: ctx.config.questionCount, byUnit, byDiff, byType, gaps };
      },
    }),

    search_fill_gaps: tool({
      description: "针对缺口补搜题目",
      inputSchema: z.object({
        reasoning: z.string(),
        course: z.string(),
        unit: z.number().int().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        limit: z.number().int().min(3).max(30).default(15),
      }),
      execute: async ({ reasoning, course, unit, difficulty, limit }) => {
        ctx.stepManager.log(reasoning, "decision");

        const { items } = await queryTikuQuestions({ course, unit, difficulty, limit });

        const existing = new Set(ctx.candidates.map((c) => c.id));
        const fresh = items.filter((q) => !existing.has(q.id));
        ctx.candidates.push(...fresh);

        ctx.stepManager.log(`补搜 ${fresh.length} 新题（池 ${ctx.candidates.length}）`);
        return { ok: true, fresh: fresh.length, pool: ctx.candidates.length, top: fresh.slice(0, 10).map(questionSummary) };
      },
    }),

    assemble_exam: tool({
      description: "组装最终试卷（必须最后调用）",
      inputSchema: z.object({ reasoning: z.string() }),
      execute: async ({ reasoning }) => {
        ctx.stepManager.enter("assemble-exam");
        ctx.stepManager.log(reasoning, "decision");

        const result = assembleExamFromContext(ctx);
        ctx.examResult = result;

        const total = result.sections.reduce((s, sec) => s + sec.questions.length, 0);
        ctx.stepManager.log(`${result.examName}: ${total} 题`, "decision");
        for (const sec of result.sections) {
          ctx.stepManager.log(`${sec.title}: ${sec.questions.length} 题, ${sec.totalPoints} 分`);
        }

        ctx.stepManager.completeAll();
        store.completeTask(ctx.taskId, result);

        return { ok: true, examName: result.examName, total, stats: result.stats };
      },
    }),
  };
}
