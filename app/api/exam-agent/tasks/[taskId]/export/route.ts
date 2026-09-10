import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { getTask } from "@/lib/exam-agent/store";
import type { ExamSection as AgentExamSection, ExamResult } from "@/lib/exam-agent/types";
import { renderExamTypstPdf } from "@/lib/typst/render-exam";
import type { ExamData, ExamSection, MCQuestion, FRQQuestion } from "@/lib/pdf/types";

type Params = { params: Promise<{ taskId: string }> };

const exportOptionsSchema = z.object({
  includeAnswerKey: z.boolean().optional().default(true),
  includeRubric: z.boolean().optional().default(true),
});

function mapDifficulty(
  difficulty: "easy" | "medium" | "hard",
): "Easy" | "Medium" | "Hard" {
  const map = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;
  return map[difficulty];
}

function buildPdfSection(
  agentSection: AgentExamSection,
  questionNumberOffset: number,
): ExamSection {
  const isMC = agentSection.questionType === "MC";
  const questions = agentSection.questions.map((q, idx): MCQuestion | FRQQuestion => {
    const number = questionNumberOffset + idx + 1;
    const exercise = q.exercise;
    const difficultyLabel = mapDifficulty(exercise.difficulty);

    if (isMC) {
      const options = (exercise.options ?? []).map((opt) => ({
        label: opt.label,
        text: opt.text,
      }));
      const mcQuestion: MCQuestion = {
        type: "MC",
        number,
        stem: exercise.questionText,
        options,
        answer: exercise.correctAnswer,
        difficulty: difficultyLabel,
        difficultyLabel,
        meta: q.topicName,
      };
      return mcQuestion;
    }

    const frqQuestion: FRQQuestion = {
      type: "FRQ",
      number,
      stem: exercise.questionText,
      parts: [
        {
          label: "a",
          prompt: exercise.questionText,
          points: agentSection.pointsPerQuestion,
          solution: exercise.solutionSteps,
          rubricCriteria: exercise.commonMistakes.length > 0
            ? exercise.commonMistakes.map((m) => `避免：${m}`)
            : undefined,
        },
      ],
      difficulty: difficultyLabel,
      difficultyLabel,
      solution: exercise.solutionSteps,
      meta: q.topicName,
    };
    return frqQuestion;
  });

  return {
    type: isMC ? "MC" : "FRQ",
    title: agentSection.title,
    directions: isMC
      ? `本节共 ${agentSection.questions.length} 题，每题 ${agentSection.pointsPerQuestion} 分。`
      : `本节共 ${agentSection.questions.length} 题，每题 ${agentSection.pointsPerQuestion} 分，请展示完整解题过程。`,
    questions,
  };
}

function buildExamData(
  result: ExamResult,
  includeAnswerKey: boolean,
  includeRubric: boolean,
): ExamData {
  let questionNumberOffset = 0;
  const pdfSections: ExamSection[] = result.sections.map((section) => {
    const built = buildPdfSection(section, questionNumberOffset);
    questionNumberOffset += section.questions.length;
    return built;
  });

  return {
    title: result.examName,
    course: result.pipelineOutput.curriculumContext?.courseName ?? "",
    subtitle: result.pipelineOutput.curriculumContext?.unitName ?? undefined,
    sections: pdfSections,
    includeAnswerKey,
    includeRubric,
  };
}

export async function POST(request: Request, { params }: Params) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json(
      { error: errorMessage },
      { status: errorStatus ?? 401 },
    );
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "completed" || !task.result) {
    return NextResponse.json(
      { error: "Task not completed yet" },
      { status: 409 },
    );
  }

  let options: z.infer<typeof exportOptionsSchema>;
  try {
    const rawBody = await request.text();
    const parsed = rawBody.trim() ? JSON.parse(rawBody) : {};
    options = exportOptionsSchema.parse(parsed);
  } catch {
    options = { includeAnswerKey: true, includeRubric: true };
  }

  const examData = buildExamData(
    task.result,
    options.includeAnswerKey,
    options.includeRubric,
  );

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderExamTypstPdf(examData, {
      pageSize: "Letter",
      templateVariant: "classic",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const safeName = examData.title.replace(/[^\w\u4e00-\u9fa5]/g, "_").slice(0, 60);
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
