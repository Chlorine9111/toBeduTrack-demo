import type { Exercise, ExerciseTaxonomyNodeStatus } from "@/types/exercise";

export type QuestionBankTaxonomyNodeStatus = ExerciseTaxonomyNodeStatus;

export type QuestionBankTaxonomyNodeItem = {
  id: string;
  clusterKey: NonNullable<Exercise["knowledgeCluster"]>;
  canonicalKey: string;
  canonicalLabel: string;
  description: string | null;
  status: QuestionBankTaxonomyNodeStatus;
  sourceCount: number;
  reviewCount: number;
  aliasOfNodeId: string | null;
  builtIn: boolean;
};

export type QuestionBankQuestionListItem = {
  id: string;
  title: string;
  questionText: string;
  type: Exercise["type"];
  difficulty: Exercise["difficulty"];
  verificationStatus: Exercise["verificationStatus"];
  courseId: string;
  unitId: string | null;
  courseName: string | null;
  unitName: string | null;
  sourceKind: "pdf_scan" | "knowledge_document" | "agent_generated" | "manual";
  sourceFileName: string | null;
  sourcePageLabel: string | null;
  sourceReviewStatus: string | null;
  sourceConfidence: number | null;
  importBatchId: string | null;
  importBatchLabel: string | null;
  similarityCount: number;
  knowledgeCluster: Exercise["knowledgeCluster"];
  knowledgeClusterLabel: string;
  knowledgeSubskillNodeId: Exercise["knowledgeSubskillNodeId"];
  knowledgeSubskillKey: Exercise["knowledgeSubskillKey"];
  knowledgeSubskillLabel: Exercise["knowledgeSubskillLabel"];
  knowledgeSubskillStatus: Exercise["knowledgeSubskillStatus"];
  knowledgeTags: string[];
  assessmentStyle: Exercise["assessmentStyle"];
  assessmentStyleLabel: string;
  assessmentTags: string[];
  classificationConfidence: number | null;
  classificationStatus: Exercise["classificationStatus"];
  classificationReasons: string[];
  classificationUpdatedByTeacher: boolean;
  subskillConfidence: number | null;
  subskillMatchMode: Exercise["subskillMatchMode"];
  subskillReasons: string[];
  createdAt: string;
  updatedAt: string;
};

export type QuestionBankQuestionDetail = QuestionBankQuestionListItem & {
  exercise: Exercise;
  note: string | null;
  sourcePageImageUrl: string | null;
  similarItems: Array<{
    id: string;
    title: string;
    sourceFileName: string | null;
    sourcePageLabel: string | null;
    updatedAt: string;
  }>;
};

export type QuestionBankTaxonomyListResponse = {
  items: QuestionBankTaxonomyNodeItem[];
};

export type QuestionBankMaterialItem = {
  id: string;
  materialType: "knowledge_document" | "pdf_scan_upload" | "agent_generated_batch";
  title: string;
  fileType: string | null;
  status: string;
  summary: string | null;
  subject: string | null;
  unit: string | null;
  tags: string[];
  detectedQuestionCount: number;
  savedQuestionCount: number;
  questionBankStatus: string | null;
  questionBankMessage: string | null;
  importBatchId: string | null;
  importBatchLabel: string | null;
  linkedDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};
