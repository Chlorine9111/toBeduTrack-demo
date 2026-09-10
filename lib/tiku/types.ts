/**
 * ocr-tiku 数据类型定义
 *
 * 与 ocr-tiku Supabase 的 questions / stimuli 表结构对齐。
 * 参考：ocr-tiku/docs/schema.md
 */

// ---------------------------------------------------------------------------
// 课程代码枚举
// ---------------------------------------------------------------------------

export type TikuCourse =
  | "APES"
  | "AP_BIO"
  | "AP_CHEM"
  | "AP_CALC_AB"
  | "AP_CALC_BC"
  | "AP_PRECALC"
  | "AP_STATS"
  | "AP_MACRO"
  | "AP_MICRO"
  | "AP_CSA"
  | "AP_CSP"
  | "AP_PHYSICS_1"
  | "AP_PHYSICS_2"
  | "AP_PHYSICS_C_MECH"
  | "AP_PHYSICS_C_EM";

export type TikuDifficulty = "easy" | "medium" | "hard";

export type TikuCognitiveTask =
  | "recall"
  | "diagram_reading"
  | "calculation"
  | "causal_prediction"
  | "comparison"
  | "scenario_application"
  | "evidence_evaluation";

export type TikuTransferDistance = "near" | "far";

export type TikuSearchMode = "content" | "diagnostic" | "auto";

// ---------------------------------------------------------------------------
// 选项结构
// ---------------------------------------------------------------------------

export type TikuChoice = {
  text: string;
  misconception: string | null;
  image_url?: string | null;
};

// ---------------------------------------------------------------------------
// 核心表类型
// ---------------------------------------------------------------------------

export type TikuQuestion = {
  id: string;
  course: string;
  unit: number;
  source_type: string;
  source_assessment: string;
  question_number: number;
  topic_code: string | null;
  secondary_topics: string[];
  big_idea: string | null;
  science_practice: number | null;
  difficulty: TikuDifficulty;
  cognitive_task: string | null;
  transfer_distance: TikuTransferDistance | null;
  stimulus_id: string | null;
  stem: string;
  choices: Record<string, TikuChoice>;
  correct_answer: string;
  explanation: string | null;
  key_concepts: string[];
  stimulus_dependent: boolean;
  standalone_usable: boolean;
  requires_calculation: boolean;
  negative_stem: boolean;
  embedding_content: number[] | null;
  embedding_diagnostic: number[] | null;
  created_at: string;
  updated_at: string;
};

export type TikuStimulus = {
  id: string;
  content_type: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// 搜索参数 & 结果
// ---------------------------------------------------------------------------

export type TikuSearchParams = {
  /** 用户的自然语言查询 */
  query: string;
  /** 课程过滤（手动指定时覆盖 LLM 解析） */
  course?: string | null;
  /** 单元过滤 */
  unit?: number | null;
  /** 难度过滤 */
  difficulty?: TikuDifficulty | null;
  /** 认知任务类型过滤 */
  cognitive_task?: string | null;
  /** 知识点代码过滤 */
  topic_code?: string | null;
  /** 搜索模式：content=按知识点，diagnostic=按学生误解，auto=LLM 自动判断 */
  mode?: TikuSearchMode;
  /** 返回数量上限 */
  limit?: number;
  /** 跳过响应缓存（AI 组卷等需要每次不同结果时使用） */
  skip_cache?: boolean;
};

/** RPC search_questions 返回的单条结果 */
export type TikuSearchResultRow = {
  id: string;
  course: string;
  unit: number;
  topic_code: string | null;
  difficulty: string;
  cognitive_task: string | null;
  transfer_distance: string | null;
  source_assessment: string | null;
  question_number: number | null;
  stem: string;
  choices: Record<string, TikuChoice>;
  correct_answer: string;
  explanation: string | null;
  key_concepts: string[];
  stimulus_id: string | null;
  standalone_usable: boolean;
  similarity: number;
  stimulus_content_type: string | null;
  stimulus_description: string | null;
  stimulus_image_url: string | null;
};

/** 完整搜索响应 */
export type TikuSearchResponse = {
  data: TikuSearchResultRow[];
  count: number;
  total: number;
  parsed: {
    search_query: string;
    course: string | null;
    unit: number | null;
    difficulty: string | null;
    mode: string;
    reasoning: string;
  };
};

// ---------------------------------------------------------------------------
// Haiku 意图解析结果
// ---------------------------------------------------------------------------

export type TikuParsedIntent = {
  search_query: string;
  course: string | null;
  unit: number | null;
  difficulty: TikuDifficulty | null;
  mode: "content" | "diagnostic";
  reasoning: string;
};
