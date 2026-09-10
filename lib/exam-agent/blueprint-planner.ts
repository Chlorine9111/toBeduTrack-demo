import type { ExamTaskConfig, DifficultyPreference } from "./types";
import type { ExerciseBlueprint } from "@/lib/agent/exercise-pipeline-types";

type QuestionSlot = {
  type: "MC" | "FR";
  unit: string;
  unitName: string;
  difficultyBand: "基础巩固" | "中等应用" | "高阶分析";
  bloomLevel: "记忆" | "理解" | "应用" | "分析" | "评价" | "创造";
};

const DIFFICULTY_DISTRIBUTIONS: Record<DifficultyPreference, [number, number, number]> = {
  easy: [0.5, 0.35, 0.15],
  balanced: [0.3, 0.45, 0.25],
  hard: [0.15, 0.35, 0.5],
};

const BLOOM_BY_DIFFICULTY: Record<string, ("记忆" | "理解" | "应用" | "分析" | "评价" | "创造")[]> = {
  "基础巩固": ["记忆", "理解"],
  "中等应用": ["应用", "分析"],
  "高阶分析": ["评价", "创造"],
};

export function planQuestionSlots(config: ExamTaskConfig): QuestionSlot[] {
  const { units, unitNames, questionCount, questionTypes, difficultyPreference } = config;
  const [easyPct, medPct, hardPct] = DIFFICULTY_DISTRIBUTIONS[difficultyPreference];
  const slots: QuestionSlot[] = [];

  const perUnit = Math.floor(questionCount / units.length);
  const remainder = questionCount % units.length;

  for (let u = 0; u < units.length; u++) {
    const unitCount = perUnit + (u < remainder ? 1 : 0);
    const easyCount = Math.round(unitCount * easyPct);
    const hardCount = Math.round(unitCount * hardPct);
    const medCount = unitCount - easyCount - hardCount;

    const difficulties: Array<{ band: QuestionSlot["difficultyBand"]; count: number }> = [
      { band: "基础巩固", count: easyCount },
      { band: "中等应用", count: medCount },
      { band: "高阶分析", count: hardCount },
    ];

    for (const { band, count } of difficulties) {
      const bloomOptions = BLOOM_BY_DIFFICULTY[band];
      for (let i = 0; i < count; i++) {
        const type = questionTypes.length === 1
          ? questionTypes[0]
          : i % 4 === 0 ? "FR" : "MC";
        slots.push({
          type,
          unit: units[u],
          unitName: unitNames[u],
          difficultyBand: band,
          bloomLevel: bloomOptions[i % bloomOptions.length],
        });
      }
    }
  }

  return slots;
}

export function slotsToBlueprintBatches(
  config: ExamTaskConfig,
  slots: QuestionSlot[],
  batchSize: number = 5,
): ExerciseBlueprint[] {
  const blueprints: ExerciseBlueprint[] = [];

  for (let i = 0; i < slots.length; i += batchSize) {
    const batch = slots.slice(i, i + batchSize);
    const primary = batch[0];
    blueprints.push({
      subject: config.subjectName,
      unit: primary.unitName,
      learningObjective: null,
      exerciseType: primary.type,
      count: batch.length,
      bloomLevel: primary.bloomLevel,
      difficultyBand: primary.difficultyBand,
      needRealWorldContext: true,
      language: config.language === "英文" ? "英文" : "中文",
      teacherIntent: `Generate ${batch.length} ${primary.type} questions for ${config.subjectName} ${primary.unitName} at ${primary.difficultyBand} level`,
    });
  }

  return blueprints;
}
