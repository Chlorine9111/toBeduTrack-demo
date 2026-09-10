/**
 * Exercise domain types, AI output formats, and verification results.
 */

export type ExerciseType = "MC" | "FR" | "fill_in";
export type ExerciseDifficulty = "easy" | "medium" | "hard";

/** 将旧版 integer (1-4) 或 text 难度值统一为 ExerciseDifficulty */
export function toExerciseDifficulty(
  value: number | string | null | undefined,
): ExerciseDifficulty {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "easy") return "easy";
    if (lower === "hard" || lower === "expert") return "hard";
    return "medium";
  }
  if (typeof value === "number") {
    if (value <= 1) return "easy";
    if (value >= 3) return "hard";
    return "medium";
  }
  return "medium";
}

/** 将 ExerciseDifficulty 字符串转回旧版 integer（1-4），供 block data 等仍使用数字的场景 */
export function fromExerciseDifficulty(value: ExerciseDifficulty): number {
  if (value === "easy") return 1;
  if (value === "hard") return 3;
  return 2;
}
/**
 * 知识簇：开放式分类。已有的内置 key 保留向后兼容，
 * Haiku 可自由创建新 key（snake_case），如 microeconomics、world_history。
 */
export type ExerciseKnowledgeCluster = string;
/** 考察方式：开放式分类，同 knowledgeCluster。 */
export type ExerciseAssessmentStyle = string;
export type ExerciseClassificationStatus =
  | "auto_confirmed"
  | "needs_review"
  | "teacher_confirmed"
  | "unreviewed";
export type ExerciseSubskillMatchMode =
  | "matched_existing"
  | "candidate_new"
  | "needs_review"
  | "teacher_confirmed";
export type ExerciseTaxonomyMatchMode = ExerciseSubskillMatchMode;
export type ExerciseTaxonomyNodeStatus =
  | "active"
  | "candidate"
  | "merged"
  | "rejected";
export type ExerciseVerificationStatus =
  | "pending"
  | "rule_checked"
  | "verified"
  | "failed"
  | "manual_review";
export type ExerciseSourceKind =
  | "pdf_scan"
  | "knowledge_document"
  | "agent_generated"
  | "manual";
export type ExerciseSourceReviewStatus =
  | "ready"
  | "review"
  | "critical"
  | "unreviewed";

export interface ExerciseSourceMeta {
  kind: ExerciseSourceKind;
  documentId?: string | null;
  uploadId?: string | null;
  fileName?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  confidence?: number | null;
  reviewStatus?: ExerciseSourceReviewStatus;
}

export interface ExerciseOption {
  label: string;
  text: string;
  isCorrect: boolean;
}

export type ExerciseContentLeaf =
  | {
      id: string;
      kind: "text";
      text: string;
    }
  | {
      id: string;
      kind: "image";
      src: string;
      alt?: string | null;
    };

export interface ExerciseContentOption {
  id: string;
  label: string;
  blocks: ExerciseContentLeaf[];
  isCorrect?: boolean;
}

export interface ExerciseContent {
  version: 1;
  type: ExerciseType | "TF";
  stem: ExerciseContentLeaf[];
  options?: ExerciseContentOption[] | null;
  answer?: ExerciseContentLeaf[] | null;
  explanation?: ExerciseContentLeaf[] | null;
  answerSpace?: "small" | "medium" | "large" | null;
  commonMistakes?: string[];
}

export interface Exercise {
  id: string;
  teacherId: string;
  courseId: string;
  unitId?: string | null;
  topicId?: string | null;
  rubricId?: string | null;
  type: ExerciseType;
  difficulty: ExerciseDifficulty;
  content?: ExerciseContent | null;
  questionText: string;
  options?: ExerciseOption[] | null;
  correctAnswer: string;
  solutionSteps: string;
  commonMistakes: string[];
  verificationStatus: ExerciseVerificationStatus;
  verificationAttempts: number;
  isAiGenerated: boolean;
  teacherModified: boolean;
  teacherPrompt?: string | null;
  importBatchId?: string | null;
  importBatchLabel?: string | null;
  source?: ExerciseSourceMeta | null;
  similarityFingerprint?: string | null;
  knowledgeCluster?: ExerciseKnowledgeCluster | null;
  knowledgeClusterNodeId?: string | null;
  knowledgeClusterStatus?: ExerciseTaxonomyNodeStatus | null;
  knowledgeSubskillNodeId?: string | null;
  knowledgeSubskillKey?: string | null;
  knowledgeSubskillLabel?: string | null;
  knowledgeSubskillStatus?: ExerciseTaxonomyNodeStatus | null;
  knowledgeTags?: string[];
  assessmentStyle?: ExerciseAssessmentStyle | null;
  assessmentTags?: string[];
  classificationConfidence?: number | null;
  classificationStatus?: ExerciseClassificationStatus | null;
  classificationReasons?: string[];
  classificationUpdatedByTeacher?: boolean;
  subskillConfidence?: number | null;
  subskillMatchMode?: ExerciseSubskillMatchMode | null;
  subskillReasons?: string[];
  createdAt: string;
  updatedAt: string;
}

// AI tool-use output format (flattened JSON, not normalized tables).
export interface ExerciseAIOutput {
  exercises: Array<{
    questionText?: string;
    stem?: string;
    type?: ExerciseType;
    questionType?: "MCQ" | "FRQ" | "MC" | "FR";
    question_type?: "MCQ" | "FRQ" | "MC" | "FR";
    difficulty?: ExerciseDifficulty | "easy" | "medium" | "hard";
    difficultyLabel?: "easy" | "medium" | "hard";
    difficulty_label?: "easy" | "medium" | "hard";
    topicId?: string;
    topic_id?: string;
    loIds?: string[];
    lo_ids?: string[];
    ekIds?: string[];
    ek_ids?: string[];
    options?: ExerciseOption[] | Record<string, string>;
    correctAnswer?: string;
    correct_answer?: string;
    solutionSteps?: string;
    solution?: string;
    commonMistakes?: string[];
    distractorRationale?: Record<string, string>;
    distractor_rationale?: Record<string, string>;
    parts?: Record<string, unknown>;
    totalPoints?: number;
    total_points?: number;
  }>;
}

export interface ExerciseVerificationResult {
  exercise: ExerciseAIOutput["exercises"][number];
  status: ExerciseVerificationStatus;
  originalAnswer: string;
  verifiedAnswer: string;
  isMatch: boolean;
  attempts: number;
}
