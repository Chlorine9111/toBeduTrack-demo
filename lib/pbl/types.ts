export type PblCurriculumSystem = "AP" | "IB" | "CN";
export type PblMaterialCurriculumScope = PblCurriculumSystem | "GENERIC";
export type PblDifficulty = "basic" | "advanced" | "challenge";
export type PblCoverageType = "core" | "supporting";
export type PblStageType = "explore" | "execute" | "synthesize";
export type PblAssessmentType = "formative" | "summative";
export type PblPlanStatus = "draft" | "confirmed" | "archived";
export type PblQualityStatus = "pass" | "warning" | "fail";

export type PblSimpleInput = {
  prompt: string;
  curriculumSystem?: PblCurriculumSystem;
  grade?: string;
  subject?: string;
  totalPeriods?: number;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  type: "case" | "regulation" | "pbl_reference" | "article" | "video";
};

export type PblInferredParams = {
  curriculumSystem: PblCurriculumSystem;
  primarySubject: string;
  grade: string;
  totalPeriods: number;
  difficulty: PblDifficulty;
  topic: string;
  knowledgePoints: string[];
};

export type PblChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  changeSummary?: string;
  createdAt: string;
};

export type PblMaterialType =
  | "competition"
  | "pbl_case"
  | "driving_question"
  | "curriculum_map";

export type PblMaterialKnowledgeLink = {
  knowledgePointId?: string;
  code: string;
  name: string;
  curriculumSystem: PblCurriculumSystem;
  subject: string;
  relevance: "primary" | "supporting";
};

export type PblMaterialTopicLink = {
  topicId?: string;
  slug: string;
  name: string;
  aliases: string[];
  relevance: "primary" | "supporting";
};

export type PblMaterialTopicMatch = {
  slug: string;
  name: string;
  relevance: "primary" | "supporting";
  matchedTerms: string[];
  matchType: "exact" | "partial";
};

export type PblMaterialKnowledgeMatch = {
  code: string;
  name: string;
  curriculumSystem: PblCurriculumSystem;
  subject: string;
  relevance: "primary" | "supporting";
  matchedTerms: string[];
};

export type PblMaterialSearchHints = {
  topicMatches?: PblMaterialTopicMatch[];
  knowledgeMatches?: PblMaterialKnowledgeMatch[];
  reasonSummary?: string[];
};

export type PblTagDimension = "A" | "B" | "C" | "D";

export type PblMaterialTag = {
  id?: string;
  name: string;
  dimension: PblTagDimension;
};

export type PblMaterialTagGroups = Record<PblTagDimension, string[]>;

export type PblMaterial = {
  id: string;
  title: string;
  type: PblMaterialType;
  source: string;
  year: number;
  curriculumScope: PblMaterialCurriculumScope;
  tags: string[];
  tagDetails?: PblMaterialTag[];
  tagsByDimension?: PblMaterialTagGroups;
  link: string;
  originalContent?: string;
  knowledgePointLinks?: PblMaterialKnowledgeLink[];
  topicLinks?: PblMaterialTopicLink[];
  searchHints?: PblMaterialSearchHints;
  visibility: "public" | "private";
  ownerId: string | null;
};

export type PblMaterialBucketKey =
  | "curriculumAnchors"
  | "crossDisciplinaryBridges"
  | "projectInspiration";

export type PblMaterialSearchBucket = {
  key: PblMaterialBucketKey;
  label: string;
  purpose: string;
  materials: PblMaterial[];
};

export type PblMaterialSearchResult = {
  materials: PblMaterial[];
  buckets: PblMaterialSearchBucket[];
};

export type PblKnowledgePoint = {
  code: string;
  curriculumSystem: PblCurriculumSystem;
  subject: string;
  hierarchyLabel: string;
  name: string;
  description?: string;
  projectPotential: "high" | "medium" | "low";
};

export type PblGenerationInput = {
  curriculumSystem: PblCurriculumSystem;
  primarySubject: string;
  crossSubjects: string[];
  grade: string;
  totalPeriods: number;
  topic?: string;
  knowledgePoints: string[];
  projectForms: string[];
  difficulty: PblDifficulty;
  themes: string[];
  classSize: string;
  resources: string[];
  outcomes: string[];
  specialRequirements?: string;
};

export type PblOverview = {
  optionLabel: "A" | "B" | "C";
  title: string;
  drivingQuestion: string;
  overview: string;
  projectForm: string;
  highlight: string;
  materialRefs: Array<{ id: string; title: string }>;
};

export type PblProjectBrief = {
  realWorldContext: string;
  coreChallenge: string;
  researchBoundary: string;
  stakeholders: string[];
  successCriteria: string[];
  recommendedEvidence: string[];
};

export type PblStage = {
  stageNumber: number;
  name: string;
  stageType: PblStageType;
  periodStart: number;
  periodEnd: number;
  realWorldProblem: string;
  objective: string;
  implementationSteps: string[];
  coreActivities: string[];
  teacherRole: string;
  teacherMoves: string[];
  knowledgeEmbedding: string;
  scaffolding: string[];
  checklist: string[];
  feedbackFocus: string[];
  commonPitfalls: string[];
  evidenceRequirements: string[];
  deliverables: string[];
  deliverableCriteria: string[];
  timeSuggestion: string;
  requiredResources: string[];
};

export type PblRubricItem = {
  dimension: "contextualize" | "method" | "evidence" | "analysis" | "argument" | "reflection";
  score5: string;
  score4: string;
  score3: string;
  score2: string;
  score1: string;
  studentVersion: string;
};

export type PblAssessment = {
  type: PblAssessmentType;
  checkpoint: string;
  method: string;
  content: string;
  weightPercentage: number;
};

export type PblCurriculumAlignment = {
  knowledgePointCode: string;
  coverageType: PblCoverageType;
  relatedStage: number;
};

export type PblMaterialReference = {
  materialId: string;
  title: string;
  referenceType:
    | "driving_question"
    | "stage_design"
    | "theme_direction"
    | "outcome_format"
    | "background_info";
};

export type PblQualityCheckItem = {
  key: string;
  status: PblQualityStatus;
  note?: string;
};

export type PblPlan = {
  id: string;
  title: string;
  originalPrompt: string;
  inferredParams: PblInferredParams;
  markdownContent: string;
  drivingQuestion: string;
  primarySubject: string;
  curriculumSystem: PblCurriculumSystem;
  grade: string;
  searchResults: WebSearchResult[];
  chatHistory: PblChatMessage[];
  status: PblPlanStatus;
  version: number;
  createdAt: string;
  updatedAt: string;

  // Compatibility fields kept so legacy exports and assistant routes can still compile.
  requestId?: string | null;
  overviewOption?: "A" | "B" | "C" | null;
  overviewText: string;
  totalPeriods: number;
  difficulty: PblDifficulty;
  crossSubjects: string[];
  suggestedGroupSize: number;
  suggestedGroupCount: number;
  finalOutcomeForm: string;
  finalOutcomeRequirements: string;
  projectBrief: PblProjectBrief;
  targetAudience: string;
  presentationFormat: string;
  stages: PblStage[];
  curriculumAlignment: PblCurriculumAlignment[];
  rubric: PblRubricItem[];
  assessments: PblAssessment[];
  materialReferences: PblMaterialReference[];
  teacherGuidance: {
    commonDifficulties: string[];
    differentiation: string[];
    timeManagement: string[];
    crossDisciplineCollab: string[];
  };
  studentVersionMarkdown: string;
  qualityCheck: PblQualityCheckItem[];
};

export type PblGenerationRequest = {
  id: string;
  teacherId: string;
  input: PblGenerationInput;
  overviews: PblOverview[];
  selectedOption: "A" | "B" | "C" | null;
  createdAt: string;
  updatedAt: string;
};

export type PblLogRecord = {
  id: string;
  planId?: string | null;
  requestId?: string | null;
  step:
    | "parse_input"
    | "search_materials"
    | "generate_overview"
    | "expand_plan"
    | "quality_check"
    | "format_output"
    | "search"
    | "generate"
    | "extract_metadata"
    | "chat_iterate";
  status: "success" | "error" | "retry";
  modelUsed: string;
  durationMs: number;
  message?: string;
  createdAt: string;
};
