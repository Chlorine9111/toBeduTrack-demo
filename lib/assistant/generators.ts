import { z } from "zod";
import {
  generateGatewayText,
  generateToolInputWithGateway,
} from "@/lib/ai/gateway";
import { getModelForTask } from "@/lib/ai/model-router";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { buildAssistantContext } from "@/lib/assistant/context-builder";

type ExerciseItem = {
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
  rubric?: string[];
};

type RubricDimension = {
  dimension: string;
  levels: Array<{
    level: string;
    score: number;
    description: string;
  }>;
};

const assistantExerciseItemSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).optional(),
  answer: z.string(),
  explanation: z.string(),
  rubric: z.array(z.string()).optional(),
});

const assistantExercisePayloadSchema = z.object({
  exercises: z.array(assistantExerciseItemSchema),
});

const assistantRubricDimensionSchema = z.object({
  dimension: z.string(),
  levels: z.array(
    z.object({
      level: z.string(),
      score: z.number(),
      description: z.string(),
    }),
  ),
});

const assistantRubricPayloadSchema = z.object({
  dimensions: z.array(assistantRubricDimensionSchema),
});

export async function generateLessonPlanContent(params: {
  teacherId: string;
  prompt: string;
  classHours?: number;
}) {
  const context = await buildAssistantContext({
    teacherId: params.teacherId,
    query: params.prompt,
    useKnowledge: true,
    useWeb: true,
  });

  const model = getModelForTask("assistant_lesson_plan");
  const contentResult = await generateGatewayText({
    capability: "text",
    model,
    system: [
      "你是 AP 教案专家。",
      "输出结构：教学目标、课时安排（分课时）、课堂活动、作业与评估、参考资料。",
      "要求：内容可执行，适配高中 AP 教学场景。",
    ].join("\n"),
    prompt: [
      `需求：${params.prompt}`,
      params.classHours ? `课时：${params.classHours}` : "",
      context.memoryContext ? `【长期记忆】\n${context.memoryContext}` : "",
      context.knowledgeContext ? `【教师资料】\n${context.knowledgeContext}` : "",
      context.webContext ? `【联网信息】\n${context.webContext}` : "",
      "请输出 Markdown。",
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxOutputTokens: 6200,
    temperature: 0.4,
    maxRetries: 2,
  });

  return {
    content: contentResult.text ?? "",
    sources: context.sources,
  };
}

export async function generateExercisesContent(params: {
  teacherId: string;
  prompt: string;
  questionType?: "mcq" | "frq";
  count?: number;
  difficulty?: "easy" | "medium" | "hard";
}) {
  const context = await buildAssistantContext({
    teacherId: params.teacherId,
    query: params.prompt,
    useKnowledge: true,
    useWeb: true,
  });

  const model = getModelForTask("assistant_exercises");
  const systemPrompt = "你是 AP 习题命题专家。请按要求返回结构化习题。";
  const userPrompt = [
    `需求：${params.prompt}`,
    `题型：${params.questionType ?? "frq"}`,
    `数量：${params.count ?? 5}`,
    `难度：${params.difficulty ?? "medium"}`,
    context.memoryContext ? `【长期记忆】\n${context.memoryContext}` : "",
    context.knowledgeContext ? `【教师资料】\n${context.knowledgeContext}` : "",
    context.webContext ? `【联网信息】\n${context.webContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const payload = await generateStructuredObject({
    model,
    schema: assistantExercisePayloadSchema,
    systemPrompt,
    userPrompt,
    maxTokens: 5600,
    temperature: 0.2,
  }).catch(() =>
    generateToolInputWithGateway<{ exercises?: ExerciseItem[] }>({
      model,
      systemPrompt,
      userPrompt,
      tool: {
        name: "return_exercises",
        description: "返回习题列表",
        inputSchema: {
          type: "object",
          required: ["exercises"],
          properties: {
            exercises: {
              type: "array",
              items: {
                type: "object",
                required: ["question", "answer", "explanation"],
                properties: {
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                  },
                  answer: { type: "string" },
                  explanation: { type: "string" },
                  rubric: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      maxTokens: 5600,
    }).then((result) => result.input),
  );

  return {
    exercises: Array.isArray(payload.exercises) ? payload.exercises : [],
    sources: context.sources,
  };
}

export async function generateRubricContent(params: {
  teacherId: string;
  prompt: string;
  scoreScale?: number;
}) {
  const context = await buildAssistantContext({
    teacherId: params.teacherId,
    query: params.prompt,
    useKnowledge: true,
    useWeb: true,
  });

  const model = getModelForTask("assistant_rubric");
  const systemPrompt = "你是 AP 评分标准设计专家。";
  const userPrompt = [
    `需求：${params.prompt}`,
    `分值范围：1-${params.scoreScale ?? 5}`,
    context.memoryContext ? `【长期记忆】\n${context.memoryContext}` : "",
    context.knowledgeContext ? `【教师资料】\n${context.knowledgeContext}` : "",
    context.webContext ? `【联网信息】\n${context.webContext}` : "",
    "请输出结构化评分标准。",
  ]
    .filter(Boolean)
    .join("\n\n");
  const payload = await generateStructuredObject({
    model,
    schema: assistantRubricPayloadSchema,
    systemPrompt,
    userPrompt,
    maxTokens: 4600,
    temperature: 0.2,
  }).catch(() =>
    generateToolInputWithGateway<{ dimensions?: RubricDimension[] }>({
      model,
      systemPrompt,
      userPrompt,
      tool: {
        name: "return_rubric",
        description: "输出评分维度及分档描述",
        inputSchema: {
          type: "object",
          required: ["dimensions"],
          properties: {
            dimensions: {
              type: "array",
              items: {
                type: "object",
                required: ["dimension", "levels"],
                properties: {
                  dimension: { type: "string" },
                  levels: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["level", "score", "description"],
                      properties: {
                        level: { type: "string" },
                        score: { type: "number" },
                        description: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      maxTokens: 4600,
    }).then((result) => result.input),
  );

  return {
    dimensions: Array.isArray(payload.dimensions) ? payload.dimensions : [],
    sources: context.sources,
  };
}
