const DOC_ARTIFACT_TOOL_NAMES = new Set([
  "adapt_difficulty",
  "generate_answer_key",
  "generate_exit_ticket",
  "generate_worksheet",
  "generate_rubric",
  "generate_ap_exercises_pipeline",
  "generate_lesson_plan_workflow",
  "assemble_worksheet",
]);

type DocumentSkillType =
  | "worksheet"
  | "rubric"
  | "lesson-plan"
  | "exercises"
  | "exam";

function readNumberFromUsage(
  usage: Record<string, unknown> | undefined,
  keys: string[],
) {
  if (!usage) return null;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export function buildAgentSystemPrompt(params: {
  hasUploadedMaterials: boolean;
  hasReferencedMaterials?: boolean;
  requestMode?:
    | "chat_answer"
    | "document_artifact"
    | "retrieval_only"
    | "retrieval_then_document";
  runtimeContextText?: string;
  taskStateSummary?: string;
}) {
  return [
    "你是 AP 教师的 AI 教学助手。你能生成教学材料、检索教师资料并协助完成教学任务。根据用户需求自行判断最合适的工具。",
    "",
    "核心原则：",
    "- 教学材料：默认用 AI 生成，不主动搜题库",
    "- 每个生成工具产出右侧 Canvas artifact，左侧只给 1-3 句简短摘要",
    "- 默认一轮只允许一个主文档工具",
    "",
    "有引用资料时的规则：",
    "- 当用户已引用了资料（📎 标记），生成任务直接执行，不追问课程/单元/学科",
    "- 从资料内容自动推断学科和主题",
    "",
    "输出规则：",
    "- 每次调用工具后，必须输出 1-3 句简短总结",
    "- 文档型工具的正文自动进入右侧 Canvas，不要把完整正文贴到左侧聊天区",
    "",
    "约束：",
    "- 使用外部来源时末尾附参考 URL（最多 5 条）",
    "- 不泄露密钥、推理链或教师 ID",
    "- 禁止自我介绍、开场白或客套话，直接回答问题或执行任务",
    params.hasReferencedMaterials
      ? [
          "",
          "【资料引用模式——教师已选定参考资料】",
          "本次对话附带了教师从内容库显式选定的参考资料（以 📎 标记）。",
          "你的行为必须根据用户意图分层处理：",
          "",
          "意图A 总结/提取/翻译/解释：",
          "  → 直接基于所附资料回答，不调用任何生成工具",
          "  → 答案必须可以追溯到资料原文",
          "",
          "意图B 基于资料生成（出题/教案/Rubric/Worksheet）：",
          "  → 按正常工具路由调用对应生成工具",
          "  → 但生成内容必须紧扣所附资料，知识点、术语、难度均以资料为准",
          "  → 不要编造资料中不存在的内容",
          "",
          "意图C 普通对话（与资料无关）：",
          "  → 正常回答，忽略所附资料",
          "",
          "引用规范：",
          "  → 每段回答标注来源：根据《资料标题》第N段...",
          "  → 资料中找到的 [来源:XXX] 标识即为引用格式",
          "  → 资料不足以支撑结论时，明确说明「所附资料未覆盖此内容」",
        ].join("\n")
      : params.hasUploadedMaterials
        ? "- 当前有上传材料或已引用内容，生成任务优先整合这些材料"
        : "",
    params.requestMode === "chat_answer"
      ? "- 当前模式：左侧 Chatbox 直接回答模式。优先直接回答，不调用文档型工具，也不要创建右侧 Canvas 产物。"
      : params.requestMode === "document_artifact"
        ? "- 当前模式：文档型产物模式。左侧只给简短摘要，完整正文自动进入右侧 Canvas。"
        : params.requestMode === "retrieval_then_document"
          ? "- 当前模式：先检索再生成文档。允许先调用联网/检索工具，再调用唯一合适的文档工具；最终正文必须进入右侧 Canvas。除非用户明确要求多份交付物，否则只生成一个主 Canvas。"
          : params.requestMode === "retrieval_only"
            ? "- 当前模式：检索/调题模式。优先检索与整合结果，不要误用文档生成工具。"
            : "",
    params.taskStateSummary ? `- 任务状态：${params.taskStateSummary}` : "",
    params.runtimeContextText ? `\n${params.runtimeContextText}` : "",
  ].filter(Boolean).join("\n");
}

export function resolveDocumentSkillType(params: {
  actions: string[];
  taskKind?: string | null;
  toolNames?: string[];
}): DocumentSkillType {
  if (
    params.toolNames?.includes("generate_rubric") ||
    params.actions.includes("generate_rubric") ||
    params.actions.includes("export_rubric_pdf") ||
    params.taskKind === "rubric"
  ) {
    return "rubric";
  }

  if (
    params.toolNames?.includes("generate_lesson_plan_workflow") ||
    params.actions.includes("generate_lesson_plan") ||
    params.taskKind === "lesson_plan"
  ) {
    return "lesson-plan";
  }

  if (
    params.toolNames?.includes("generate_exit_ticket") ||
    params.toolNames?.includes("assemble_worksheet") ||
    params.actions.includes("create_worksheet") ||
    params.actions.includes("export_worksheet_pdf") ||
    params.taskKind === "worksheet"
  ) {
    return "worksheet";
  }

  if (params.actions.includes("export_exam_pdf") || params.taskKind === "exam") {
    return "exam";
  }

  return "exercises";
}

export function summarizeUsage(usage: Record<string, unknown> | undefined) {
  if (!usage) return null;
  return {
    inputTokens: readNumberFromUsage(usage, [
      "inputTokens",
      "promptTokens",
      "input_tokens",
    ]),
    outputTokens: readNumberFromUsage(usage, [
      "outputTokens",
      "completionTokens",
      "output_tokens",
    ]),
    cacheHit:
      (readNumberFromUsage(usage, [
        "cacheReadInputTokens",
        "cache_read_input_tokens",
      ]) ?? 0) > 0,
  };
}

export { DOC_ARTIFACT_TOOL_NAMES };
