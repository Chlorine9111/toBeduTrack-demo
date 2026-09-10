import { resolveLanguageModel } from "@/lib/ai/provider-registry";

type ModelTier = "core" | "aux" | "tool";

type ModelTask =
  | "intent"
  | "question_taxonomy"
  | "question_figure_summary"
  | "pdf_document_subject"
  | "worksheet_curate"
  | "worksheet_blueprint"
  | "exercise_generate"
  | "exercise_verify"
  | "exercise_equivalence"
  | "rubric_generate"
  | "lesson_outline"
  | "lesson_section"
  | "lesson_rewrite"
  | "pdf_vision"
  | "pdf_llm_parse"
  | "pdf_parse"
  | "intent_classify"
  | "assistant_chat"
  | "assistant_memory_extract"
  | "assistant_lesson_plan"
  | "assistant_exercises"
  | "assistant_rubric"
  | "pbl_assistant"
  | "pbl_infer_params"
  | "pbl_generate_full"
  | "pbl_metadata_extract"
  | "pbl_chat_iterate"
  | "pbl_overview_generate"
  | "pbl_plan_expand"
  | "pbl_quality_check"
  | "pbl_material_annotate"
  | "pbl_curriculum_extract"
  | "wechat_article"
  | "wechat_vision"
  | "grading_extract_answer"
  | "grading_score"
  | "material_digest"
  | "asset_summarize";

const DEFAULT_QUESTION_TAXONOMY_GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const DEFAULT_QUESTION_FIGURE_SUMMARY_GEMINI_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_GEMINI_INTENT_MODEL = "gemini-3.1-flash-lite-preview";
const DEFAULT_GEMINI_EXERCISE_VERIFY_MODEL = "gemini-3.1-flash-lite-preview";
const DEFAULT_PDF_DOCUMENT_SUBJECT_MODEL = "claude-haiku-4-5-20251001";

function normalizeGeminiModelId(modelId: string | null | undefined) {
  const trimmed = modelId?.trim() || "";
  if (!trimmed) return null;
  if (trimmed.startsWith("google/gemini-")) return trimmed;
  if (trimmed.startsWith("gemini-")) return `google/${trimmed}`;
  return null;
}

function resolveQuestionTaxonomyModelOverride() {
  return normalizeGeminiModelId(
    process.env.OPENROUTER_QUESTION_TAXONOMY_MODEL?.trim() ||
      process.env.QUESTION_TAXONOMY_MODEL?.trim() ||
      "",
  );
}

// 默认主生成链走 Claude Anthropic 直连；Gemini 专项任务由 provider-registry 自动优先切到 Google 官方 API。
const DEFAULT_CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() ||
  "claude-sonnet-4-6";
const DEFAULT_ASSISTANT_PRIMARY_MODEL =
  process.env.ASSISTANT_PRIMARY_MODEL?.trim() ||
  process.env.OPENROUTER_ASSISTANT_MODEL?.trim() ||
  process.env.ANTHROPIC_ASSISTANT_MODEL?.trim() ||
  DEFAULT_CLAUDE_MODEL;
const DEFAULT_CORE_MODEL = process.env.ANTHROPIC_MODEL_CORE?.trim() || DEFAULT_CLAUDE_MODEL;
const DEFAULT_AUX_MODEL = process.env.ANTHROPIC_MODEL_AUX?.trim() || DEFAULT_CLAUDE_MODEL;
const DEFAULT_TOOL_MODEL = process.env.ANTHROPIC_MODEL_TOOL?.trim() || DEFAULT_CLAUDE_MODEL;
const DEFAULT_INTENT_MODEL =
  process.env.GEMINI_INTENT_MODEL?.trim() ||
  process.env.INTENT_MODEL?.trim() ||
  process.env.ANTHROPIC_INTENT_MODEL?.trim() ||
  DEFAULT_GEMINI_INTENT_MODEL;
const DEFAULT_QUESTION_TAXONOMY_MODEL =
  resolveQuestionTaxonomyModelOverride() || DEFAULT_QUESTION_TAXONOMY_GEMINI_MODEL;
const DEFAULT_GEMINI_PDF_VISION_MODEL =
  process.env.GEMINI_PDF_VISION_MODEL?.trim() ||
  "gemini-3.1-pro-preview";
const DEFAULT_GEMINI_PDF_LLM_PARSE_MODEL =
  process.env.GEMINI_PDF_LLM_PARSE_MODEL?.trim() ||
  process.env.GEMINI_PDF_VISION_MODEL?.trim() ||
  "gemini-3.1-pro-preview";
const DEFAULT_GEMINI_GRADING_MODEL =
  process.env.GEMINI_SCORING_MODEL?.trim() ||
  process.env.GRADING_OCR_GEMINI_MODEL?.trim() ||
  process.env.OPENROUTER_OCR_MODEL?.trim() ||
  "gemini-3.1-pro-preview";
const DEFAULT_GEMINI_GRADING_EXTRACT_MODEL =
  process.env.GEMINI_GRADING_EXTRACT_MODEL?.trim() ||
  process.env.GEMINI_GRADING_MODEL?.trim() ||
  process.env.GEMINI_SCORING_MODEL?.trim() ||
  process.env.GRADING_OCR_GEMINI_MODEL?.trim() ||
  process.env.OPENROUTER_OCR_MODEL?.trim() ||
  "gemini-3-flash-preview";
function firstNonEmptyEnv(keys: string[]) {
  const expandedKeys: string[] = [];
  for (const key of keys) {
    expandedKeys.push(key);
    if (key.startsWith("MOONSHOT_")) {
      expandedKeys.push(`OPENROUTER_${key.slice("MOONSHOT_".length)}`);
      expandedKeys.push(`ANTHROPIC_${key.slice("MOONSHOT_".length)}`);
    }
  }

  for (const key of expandedKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function firstNonEmptyDirectEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function resolveAssistantTaskModel(keys: string[]) {
  return firstNonEmptyDirectEnv(keys) || DEFAULT_ASSISTANT_PRIMARY_MODEL;
}

function resolveClaudeTaskModel(keys: string[], fallback = DEFAULT_ASSISTANT_PRIMARY_MODEL) {
  return firstNonEmptyDirectEnv(keys) || fallback;
}

function getTierModel(tier: ModelTier) {
  const configured =
    tier === "core"
      ? firstNonEmptyEnv(["MOONSHOT_MODEL_CORE", "MOONSHOT_MODEL"])
      : tier === "aux"
        ? firstNonEmptyEnv(["MOONSHOT_MODEL_AUX", "MOONSHOT_MODEL"])
        : firstNonEmptyEnv(["MOONSHOT_MODEL_TOOL", "MOONSHOT_MODEL_AUX", "MOONSHOT_MODEL"]);

  if (configured) {
    return configured;
  }

  if (tier === "core") return DEFAULT_CORE_MODEL;
  if (tier === "aux") return DEFAULT_AUX_MODEL;
  return DEFAULT_TOOL_MODEL;
}

function normalizeQuestionTaxonomyModel(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return DEFAULT_QUESTION_TAXONOMY_MODEL;

  const lower = normalized.toLowerCase();
  if (lower.includes("kimi") || lower.includes("moonshot")) {
    return DEFAULT_QUESTION_TAXONOMY_MODEL;
  }

  return normalized;
}

export function getModelForTask(task: ModelTask) {
  const configured = (() => {
    if (task === "intent") {
      return (
        process.env.GEMINI_INTENT_MODEL?.trim() ||
        process.env.INTENT_MODEL?.trim() ||
        firstNonEmptyEnv(["MOONSHOT_INTENT_MODEL"])
      );
    }
    if (task === "intent_classify") {
      return (
        process.env.GEMINI_INTENT_CLASSIFY_MODEL?.trim() ||
        process.env.INTENT_CLASSIFY_MODEL?.trim() ||
        process.env.GEMINI_INTENT_MODEL?.trim() ||
        process.env.INTENT_MODEL?.trim() ||
        firstNonEmptyEnv([
          "MOONSHOT_INTENT_CLASSIFY_MODEL",
          "MOONSHOT_INTENT_MODEL",
        ])
      );
    }
    if (task === "exercise_generate") {
      return resolveAssistantTaskModel([
        "EXERCISE_GENERATE_MODEL",
        "ASSISTANT_EXERCISES_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_EXERCISE_GENERATE_MODEL",
        "OPENROUTER_ASSISTANT_EXERCISES_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_EXERCISE_GENERATE_MODEL",
        "ANTHROPIC_ASSISTANT_EXERCISES_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "exercise_verify") {
      return (
        firstNonEmptyDirectEnv([
          "EXERCISE_VERIFY_MODEL",
          "GEMINI_EXERCISE_VERIFY_MODEL",
          "GOOGLE_EXERCISE_VERIFY_MODEL",
        ]) ||
        DEFAULT_GEMINI_EXERCISE_VERIFY_MODEL
      );
    }
    if (task === "exercise_equivalence") {
      return (
        firstNonEmptyDirectEnv([
          "EXERCISE_EQUIVALENCE_MODEL",
          "GEMINI_EXERCISE_EQUIVALENCE_MODEL",
          "GOOGLE_EXERCISE_EQUIVALENCE_MODEL",
          "EXERCISE_VERIFY_MODEL",
          "GEMINI_EXERCISE_VERIFY_MODEL",
          "GOOGLE_EXERCISE_VERIFY_MODEL",
        ]) ||
        DEFAULT_GEMINI_EXERCISE_VERIFY_MODEL
      );
    }
    if (task === "question_taxonomy") {
      return normalizeQuestionTaxonomyModel(
        firstNonEmptyEnv([
          "MOONSHOT_QUESTION_TAXONOMY_MODEL",
          "OPENROUTER_QUESTION_TAXONOMY_MODEL",
          "QUESTION_TAXONOMY_MODEL",
        ]),
      );
    }
    if (task === "question_figure_summary") {
      return (
        process.env.GEMINI_QUESTION_FIGURE_SUMMARY_MODEL?.trim() ||
        process.env.QUESTION_FIGURE_SUMMARY_MODEL?.trim() ||
        DEFAULT_QUESTION_FIGURE_SUMMARY_GEMINI_MODEL
      );
    }
    if (task === "pdf_document_subject") {
      return resolveClaudeTaskModel([
        "PDF_DOCUMENT_SUBJECT_MODEL",
        "ANTHROPIC_PDF_DOCUMENT_SUBJECT_MODEL",
        "OPENROUTER_PDF_DOCUMENT_SUBJECT_MODEL",
      ], DEFAULT_PDF_DOCUMENT_SUBJECT_MODEL);
    }
    if (task === "worksheet_curate") {
      return resolveClaudeTaskModel([
        "WORKSHEET_CURATE_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_WORKSHEET_CURATE_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_WORKSHEET_CURATE_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "worksheet_blueprint") {
      return resolveClaudeTaskModel([
        "WORKSHEET_BLUEPRINT_MODEL",
      ], "claude-haiku-4-5-20251001");
    }
    if (task === "rubric_generate") {
      return resolveClaudeTaskModel([
        "RUBRIC_GENERATE_MODEL",
        "ASSISTANT_RUBRIC_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_RUBRIC_GENERATE_MODEL",
        "OPENROUTER_ASSISTANT_RUBRIC_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_RUBRIC_GENERATE_MODEL",
        "ANTHROPIC_ASSISTANT_RUBRIC_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "material_digest") {
      return resolveClaudeTaskModel(
        ["MATERIAL_DIGEST_MODEL", "ANTHROPIC_MATERIAL_DIGEST_MODEL"],
        "claude-haiku-4-5-20251001",
      );
    }
    if (task === "asset_summarize") {
      return (
        process.env.ASSET_SUMMARIZE_MODEL?.trim() ||
        "gemini-3.1-flash-lite-preview"
      );
    }
    if (task === "lesson_outline") {
      return resolveClaudeTaskModel([
        "LESSON_OUTLINE_MODEL",
        "ASSISTANT_LESSON_PLAN_MODEL",
        "ASSISTANT_LESSON_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_LESSON_OUTLINE_MODEL",
        "OPENROUTER_ASSISTANT_LESSON_PLAN_MODEL",
        "OPENROUTER_ASSISTANT_LESSON_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_LESSON_OUTLINE_MODEL",
        "ANTHROPIC_ASSISTANT_LESSON_PLAN_MODEL",
        "ANTHROPIC_ASSISTANT_LESSON_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "lesson_section") {
      return resolveClaudeTaskModel([
        "LESSON_SECTION_MODEL",
        "ASSISTANT_LESSON_PLAN_MODEL",
        "ASSISTANT_LESSON_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_LESSON_SECTION_MODEL",
        "OPENROUTER_ASSISTANT_LESSON_PLAN_MODEL",
        "OPENROUTER_ASSISTANT_LESSON_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_LESSON_SECTION_MODEL",
        "ANTHROPIC_ASSISTANT_LESSON_PLAN_MODEL",
        "ANTHROPIC_ASSISTANT_LESSON_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pdf_vision") {
      return (
        process.env.GEMINI_PDF_VISION_MODEL?.trim() ||
        firstNonEmptyEnv(["MOONSHOT_PDF_VISION_MODEL"])
      );
    }
    if (task === "pdf_llm_parse") {
      return (
        process.env.GEMINI_PDF_LLM_PARSE_MODEL?.trim() ||
        process.env.GEMINI_PDF_VISION_MODEL?.trim() ||
        firstNonEmptyEnv(["MOONSHOT_PDF_LLM_PARSE_MODEL", "MOONSHOT_PDF_VISION_MODEL"])
      );
    }
    if (task === "pdf_parse") {
      return firstNonEmptyEnv(["MOONSHOT_PDF_PARSE_MODEL"]);
    }

    if (task === "assistant_chat") {
      return resolveAssistantTaskModel([
        "ASSISTANT_CHAT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_CHAT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_CHAT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "assistant_memory_extract") {
      return resolveClaudeTaskModel([
        "ASSISTANT_MEMORY_EXTRACT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MEMORY_EXTRACT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MEMORY_EXTRACT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "assistant_lesson_plan") {
      return resolveClaudeTaskModel([
        "ASSISTANT_LESSON_PLAN_MODEL",
        "ASSISTANT_LESSON_MODEL",
        "OPENROUTER_ASSISTANT_LESSON_PLAN_MODEL",
        "OPENROUTER_ASSISTANT_LESSON_MODEL",
        "ANTHROPIC_ASSISTANT_LESSON_PLAN_MODEL",
        "ANTHROPIC_ASSISTANT_LESSON_MODEL",
      ], DEFAULT_CLAUDE_MODEL);
    }
    if (task === "assistant_exercises") {
      return resolveClaudeTaskModel([
        "ASSISTANT_EXERCISES_MODEL",
        "OPENROUTER_ASSISTANT_EXERCISES_MODEL",
        "ANTHROPIC_ASSISTANT_EXERCISES_MODEL",
      ], DEFAULT_CLAUDE_MODEL);
    }
    if (task === "assistant_rubric") {
      return resolveClaudeTaskModel([
        "ASSISTANT_RUBRIC_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_RUBRIC_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_RUBRIC_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_assistant") {
      return resolveClaudeTaskModel([
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_infer_params") {
      return resolveClaudeTaskModel([
        "PBL_INFER_PARAMS_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_INFER_PARAMS_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_INFER_PARAMS_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_generate_full") {
      return resolveClaudeTaskModel([
        "PBL_GENERATE_FULL_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_GENERATE_FULL_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_GENERATE_FULL_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_metadata_extract") {
      return resolveClaudeTaskModel([
        "PBL_METADATA_EXTRACT_MODEL",
        "PBL_INFER_PARAMS_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_METADATA_EXTRACT_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_METADATA_EXTRACT_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_chat_iterate") {
      return resolveClaudeTaskModel([
        "PBL_CHAT_ITERATE_MODEL",
        "PBL_GENERATE_FULL_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_CHAT_ITERATE_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_CHAT_ITERATE_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ], DEFAULT_CLAUDE_MODEL);
    }

    if (task === "pbl_overview_generate") {
      return resolveClaudeTaskModel([
        "PBL_OVERVIEW_GENERATE_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_OVERVIEW_GENERATE_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_OVERVIEW_GENERATE_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_plan_expand") {
      return resolveClaudeTaskModel([
        "PBL_PLAN_EXPAND_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_PLAN_EXPAND_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_PLAN_EXPAND_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_quality_check") {
      return resolveClaudeTaskModel([
        "PBL_QUALITY_CHECK_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_QUALITY_CHECK_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_QUALITY_CHECK_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_material_annotate") {
      return resolveClaudeTaskModel([
        "PBL_MATERIAL_ANNOTATE_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_MATERIAL_ANNOTATE_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_MATERIAL_ANNOTATE_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "pbl_curriculum_extract") {
      return resolveClaudeTaskModel([
        "PBL_CURRICULUM_EXTRACT_MODEL",
        "PBL_ASSISTANT_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_PBL_CURRICULUM_EXTRACT_MODEL",
        "OPENROUTER_PBL_ASSISTANT_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_PBL_CURRICULUM_EXTRACT_MODEL",
        "ANTHROPIC_PBL_ASSISTANT_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }


    if (task === "wechat_article") {
      return resolveClaudeTaskModel([
        "WECHAT_ARTICLE_MODEL",
        "ASSISTANT_MODEL",
        "OPENROUTER_WECHAT_ARTICLE_MODEL",
        "OPENROUTER_ASSISTANT_MODEL",
        "ANTHROPIC_WECHAT_ARTICLE_MODEL",
        "ANTHROPIC_ASSISTANT_MODEL",
      ]);
    }
    if (task === "wechat_vision") {
      return firstNonEmptyEnv([
        "MOONSHOT_WECHAT_VISION_MODEL",
        "MOONSHOT_MODEL_CORE",
        "MOONSHOT_MODEL",
      ]);
    }

    if (task === "grading_extract_answer") {
      return (
        process.env.GEMINI_GRADING_EXTRACT_MODEL?.trim() ||
        process.env.GEMINI_GRADING_MODEL?.trim() ||
        process.env.GEMINI_SCORING_MODEL?.trim() ||
        process.env.GRADING_OCR_GEMINI_MODEL?.trim() ||
        process.env.OPENROUTER_OCR_MODEL?.trim() ||
        firstNonEmptyEnv(["MOONSHOT_GRADING_EXTRACT_MODEL", "MOONSHOT_GRADING_MODEL"])
      );
    }
    if (task === "grading_score") {
      return (
        process.env.GEMINI_SCORING_MODEL?.trim() ||
        process.env.GRADING_OCR_GEMINI_MODEL?.trim() ||
        process.env.OPENROUTER_OCR_MODEL?.trim() ||
        firstNonEmptyEnv(["MOONSHOT_GRADING_SCORE_MODEL", "MOONSHOT_GRADING_MODEL"])
      );
    }


    return resolveClaudeTaskModel([
      "LESSON_REWRITE_MODEL",
      "ASSISTANT_LESSON_PLAN_MODEL",
      "ASSISTANT_LESSON_MODEL",
      "ASSISTANT_MODEL",
      "OPENROUTER_LESSON_REWRITE_MODEL",
      "OPENROUTER_ASSISTANT_LESSON_PLAN_MODEL",
      "OPENROUTER_ASSISTANT_LESSON_MODEL",
      "OPENROUTER_ASSISTANT_MODEL",
      "ANTHROPIC_LESSON_REWRITE_MODEL",
      "ANTHROPIC_ASSISTANT_LESSON_PLAN_MODEL",
      "ANTHROPIC_ASSISTANT_LESSON_MODEL",
      "ANTHROPIC_ASSISTANT_MODEL",
    ]);
  })();

  if (configured) {
    return configured;
  }

  if (task === "intent") {
    return DEFAULT_INTENT_MODEL;
  }

  if (task === "question_taxonomy") {
    return DEFAULT_QUESTION_TAXONOMY_MODEL;
  }

  if (task === "question_figure_summary") {
    return DEFAULT_QUESTION_FIGURE_SUMMARY_GEMINI_MODEL;
  }

  if (task === "pdf_document_subject") {
    return DEFAULT_PDF_DOCUMENT_SUBJECT_MODEL;
  }

  if (task === "worksheet_curate") {
    return DEFAULT_ASSISTANT_PRIMARY_MODEL;
  }

  if (task === "worksheet_blueprint") {
    return "claude-haiku-4-5-20251001";
  }

  if (task === "intent_classify") {
    return DEFAULT_INTENT_MODEL;
  }

  if (task === "assistant_memory_extract") {
    return "claude-haiku-4-5-20251001";
  }

  if (task === "grading_extract_answer") {
    return DEFAULT_GEMINI_GRADING_EXTRACT_MODEL;
  }

  if (task === "grading_score") {
    return DEFAULT_GEMINI_GRADING_MODEL;
  }

  if (
    task === "exercise_generate" ||
    task === "exercise_verify" ||
    task === "exercise_equivalence" ||
    task === "rubric_generate" ||
    task === "material_digest" ||
    task === "lesson_outline" ||
    task === "lesson_section" ||
    task === "lesson_rewrite" ||
    task === "assistant_chat" ||
    task === "assistant_exercises" ||
    task === "assistant_lesson_plan" ||
    task === "assistant_rubric" ||
    task === "pbl_assistant" ||
    task === "pbl_infer_params" ||
    task === "pbl_generate_full" ||
    task === "pbl_metadata_extract" ||
    task === "pbl_chat_iterate" ||
    task === "pbl_overview_generate" ||
    task === "pbl_plan_expand" ||
    task === "pbl_quality_check" ||
    task === "pbl_material_annotate" ||
    task === "pbl_curriculum_extract" ||
    task === "wechat_article"
  ) {
    return DEFAULT_ASSISTANT_PRIMARY_MODEL;
  }

  // pdf_vision 默认走 Gemini 3.1 Pro；pdf_parse / wechat_vision 仍走 core 层。
  if (task === "pdf_vision") {
    return DEFAULT_GEMINI_PDF_VISION_MODEL;
  }
  if (task === "pdf_llm_parse") {
    return DEFAULT_GEMINI_PDF_LLM_PARSE_MODEL;
  }
  if (task === "pdf_parse" || task === "wechat_vision") {
    return getTierModel("core");
  }

  return getTierModel("core");
}

export function getResolvedLanguageModelForTask(task: ModelTask) {
  return resolveLanguageModel(getModelForTask(task));
}
