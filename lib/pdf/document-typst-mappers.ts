import type {
  DocumentModel,
  QuestionBlock,
} from "@/lib/doc-engine/block-types";
import type {
  ExamData,
} from "@/lib/pdf/types";
import { buildRubricPdfDataFromDocument } from "@/lib/pdf/rubric-document-mapper";
import { createExamDataFromExercises, type PdfExercise } from "@/lib/pdf/templates/exam-template";
import type { WorksheetExercise, WorksheetRenderInput } from "@/lib/pdf/templates/worksheet-template";
import { fromExerciseDifficulty, toExerciseDifficulty, type ExerciseDifficulty } from "@/types/exercise";

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeDifficultyToNumber(value: string | number | null | undefined): 1 | 2 | 3 | 4 {
  return fromExerciseDifficulty(toExerciseDifficulty(value)) as 1 | 2 | 3 | 4;
}

function normalizeDifficultyToString(value: string | number | null | undefined): ExerciseDifficulty {
  return toExerciseDifficulty(value);
}

function joinLines(lines: Array<string | null | undefined>) {
  return lines.map(cleanText).filter(Boolean).join("\n");
}

function buildFillCorrectAnswer(block: QuestionBlock) {
  if (block.data.questionType !== "fill") {
    return "";
  }

  const answers = (block.data.blanks ?? [])
    .map((blank, index) => {
      const answer = cleanText(blank.answer);
      return answer ? `空 ${index + 1}：${answer}` : "";
    })
    .filter(Boolean);

  return answers.join("；");
}

function buildTfCorrectAnswer(block: QuestionBlock) {
  if (block.data.questionType !== "tf") {
    return "";
  }

  if (block.data.correctAnswer === true) {
    return "True";
  }
  if (block.data.correctAnswer === false) {
    return "False";
  }
  return "";
}

function questionBlockToWorksheetExercise(block: QuestionBlock): WorksheetExercise {
  if (block.data.questionType === "mc") {
    const data = block.data;
    return {
      type: "MC",
      difficulty: normalizeDifficultyToString(data.difficulty),
      questionText: cleanText(data.stem),
      options: data.options.map((option) => ({
        label: option.label,
        text: cleanText(option.text),
        isCorrect: cleanText(data.correctAnswer).toUpperCase() === cleanText(option.label).toUpperCase(),
      })),
      correctAnswer: cleanText(data.correctAnswer) || undefined,
      solutionSteps: cleanText(data.explanation) || undefined,
      totalPoints: typeof data.points === "number" ? data.points : null,
    };
  }

  if (block.data.questionType === "tf") {
    const data = block.data;
    return {
      type: "MC",
      difficulty: normalizeDifficultyToString(data.difficulty),
      questionText: cleanText(data.stem),
      options: [
        {
          label: "A",
          text: "True",
          isCorrect: data.correctAnswer === true,
        },
        {
          label: "B",
          text: "False",
          isCorrect: data.correctAnswer === false,
        },
      ],
      correctAnswer: buildTfCorrectAnswer(block) || undefined,
      solutionSteps: cleanText(data.explanation) || undefined,
      totalPoints: typeof data.points === "number" ? data.points : null,
    };
  }

  if (block.data.questionType === "fill") {
    const data = block.data;
    return {
      type: "fill_in",
      difficulty: normalizeDifficultyToString(data.difficulty),
      questionText: cleanText(data.stem),
      correctAnswer: buildFillCorrectAnswer(block) || undefined,
      solutionSteps: cleanText(data.explanation) || undefined,
      totalPoints: typeof data.points === "number" ? data.points : null,
    };
  }

  const data = block.data;
  return {
    type: "FR",
    difficulty: normalizeDifficultyToString(data.difficulty),
    questionText: cleanText(data.stem),
    correctAnswer: cleanText(data.sampleAnswer) || undefined,
    solutionSteps:
      joinLines([data.sampleAnswer, data.explanation]) || undefined,
    totalPoints: typeof data.points === "number" ? data.points : null,
  };
}

function questionBlockToPdfExercise(block: QuestionBlock): PdfExercise {
  if (block.data.questionType === "mc") {
    const data = block.data;
    return {
      type: "MC",
      difficulty: normalizeDifficultyToString(data.difficulty),
      questionText: cleanText(data.stem),
      options: data.options.map((option) => ({
        label: option.label,
        text: cleanText(option.text),
        isCorrect: cleanText(data.correctAnswer).toUpperCase() === cleanText(option.label).toUpperCase(),
      })),
      correctAnswer: cleanText(data.correctAnswer) || undefined,
      solutionSteps: cleanText(data.explanation) || undefined,
      totalPoints: typeof data.points === "number" ? data.points : null,
    };
  }

  if (block.data.questionType === "tf") {
    const data = block.data;
    return {
      type: "MC",
      difficulty: normalizeDifficultyToString(data.difficulty),
      questionText: cleanText(data.stem),
      options: [
        {
          label: "A",
          text: "True",
          isCorrect: data.correctAnswer === true,
        },
        {
          label: "B",
          text: "False",
          isCorrect: data.correctAnswer === false,
        },
      ],
      correctAnswer: buildTfCorrectAnswer(block) || undefined,
      solutionSteps: cleanText(data.explanation) || undefined,
      totalPoints: typeof data.points === "number" ? data.points : null,
    };
  }

  if (block.data.questionType === "fill") {
    const data = block.data;
    return {
      type: "FR",
      difficulty: normalizeDifficultyToString(data.difficulty),
      questionText: cleanText(data.stem),
      correctAnswer: buildFillCorrectAnswer(block) || undefined,
      solutionSteps: joinLines([buildFillCorrectAnswer(block), data.explanation]) || undefined,
      totalPoints: typeof data.points === "number" ? data.points : null,
    };
  }

  const data = block.data;
  return {
    type: "FR",
    difficulty: normalizeDifficultyToString(data.difficulty),
    questionText: cleanText(data.stem),
    correctAnswer: cleanText(data.sampleAnswer) || undefined,
    solutionSteps: joinLines([data.sampleAnswer, data.explanation]) || undefined,
    totalPoints: typeof data.points === "number" ? data.points : null,
  };
}

function collectQuestionBlocks(document: DocumentModel) {
  return document.blocks.filter(
    (block): block is QuestionBlock => block.type === "question",
  );
}

export function buildWorksheetPdfDataFromDocument(document: DocumentModel): WorksheetRenderInput {
  if (document.type !== "worksheet" && document.type !== "exercises") {
    throw new Error("当前文档不是 Worksheet/习题文档，无法导出 Worksheet PDF。");
  }

  const exercises = collectQuestionBlocks(document).map(questionBlockToWorksheetExercise);
  if (exercises.length === 0) {
    throw new Error("当前文档缺少题目块，无法导出 Worksheet PDF。");
  }

  return {
    title: document.title,
    courseName: document.meta.courseName ?? null,
    teacherName: document.meta.teacherName ?? null,
    date: document.meta.date ?? null,
    exercises,
    includeAnswerKey: true,
    includeExplanations: true,
    rubrics: [],
  };
}

export function buildExamPdfDataFromDocument(document: DocumentModel): ExamData {
  if (document.type !== "exam" && document.type !== "quiz") {
    throw new Error("当前文档不是 Exam/Quiz 文档，无法导出试卷 PDF。");
  }

  const exercises = collectQuestionBlocks(document).map(questionBlockToPdfExercise);
  if (exercises.length === 0) {
    throw new Error("当前文档缺少题目块，无法导出试卷 PDF。");
  }

  return createExamDataFromExercises({
    title: document.title,
    exercises,
    includeAnswerKey: true,
    includeRubric: false,
    pageSize: document.layoutConfig.pageSize,
  });
}
