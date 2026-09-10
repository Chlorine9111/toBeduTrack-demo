export type ApQuestionBankCourse =
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

export type ApQuestionBankDifficulty = "easy" | "medium" | "hard";

export type ApQuestionBankCognitiveTask =
  | "recall"
  | "diagram_reading"
  | "calculation"
  | "causal_prediction"
  | "comparison"
  | "scenario_application"
  | "evidence_evaluation";

export type ApQuestionBankTransferDistance = "near" | "far";
export type ApQuestionBankSearchMode = "content" | "diagnostic" | "auto";

export type ApQuestionBankChoice = {
  text: string;
  misconception: string | null;
  image_url?: string | null;
};

export type ApQuestionBankSearchParams = {
  query: string;
  course?: string | null;
  unit?: number | null;
  difficulty?: ApQuestionBankDifficulty | null;
  cognitive_task?: string | null;
  topic_code?: string | null;
  mode?: ApQuestionBankSearchMode;
  limit?: number;
  page?: number;
  skip_cache?: boolean;
};

export type ApQuestionBankSearchResultRow = {
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
  choices: Record<string, ApQuestionBankChoice>;
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

export type ApQuestionBankSearchResponse = {
  data: ApQuestionBankSearchResultRow[];
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

export type ApQuestionBankParsedIntent = {
  search_query: string;
  course: string | null;
  unit: number | null;
  difficulty: ApQuestionBankDifficulty | null;
  mode: "content" | "diagnostic";
  reasoning: string;
};

export type ApQuestionBankListItem = {
  id: string;
  course: string;
  unit: number;
  stem: string;
  choices: Record<string, ApQuestionBankChoice>;
  correct_answer: string;
  explanation: string | null;
  difficulty: string;
  cognitive_task: string | null;
  topic_code: string | null;
  key_concepts: string[];
  source_type: string;
  source_assessment: string;
  question_number: number;
  stimulus_id: string | null;
  stimulus_dependent: boolean;
  standalone_usable: boolean;
  requires_calculation: boolean;
  negative_stem: boolean;
  created_at: string;
  stimulus?: {
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  } | Array<{
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  }> | null;
};

export type ApQuestionBankListResponse = {
  items: ApQuestionBankListItem[];
  total: number;
  page: number;
  limit: number;
};

export type ApQuestionBankMaterialItem = {
  course: string;
  sourceAssessment: string;
  unit: number;
  questionCount: number;
};

export type ApQuestionBankMaterialsResponse = {
  items: ApQuestionBankMaterialItem[];
  total: number;
};

export type ApQuestionBankMaterialDetailQuestion = {
  id: string;
  course: string;
  unit: number;
  stem: string;
  choices: Record<string, ApQuestionBankChoice>;
  correct_answer: string;
  explanation: string | null;
  difficulty: string;
  cognitive_task: string | null;
  topic_code: string | null;
  key_concepts: string[];
  source_type: string;
  source_assessment: string;
  question_number: number;
  stimulus_id: string | null;
  stimulus_dependent: boolean;
  standalone_usable: boolean;
  requires_calculation: boolean;
  negative_stem: boolean;
  created_at: string;
  stimulus?: {
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  } | Array<{
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  }> | null;
};

export type ApQuestionBankMaterialDetailResponse = {
  material: {
    course: string;
    sourceAssessment: string;
    questionCount: number;
    unit: number | null;
  };
  questions: ApQuestionBankMaterialDetailQuestion[];
};
