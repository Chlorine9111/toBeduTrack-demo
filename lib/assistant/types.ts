import type { Json } from "@/types/database";

export type AssistantIntentType =
  | "generate_lesson_plan"
  | "generate_exercises"
  | "generate_rubric"
  | "search_web"
  | "knowledge_qa"
  | "general_chat";

export type SourceType = "knowledge" | "web" | "memory";

export interface SourceReference {
  type: SourceType;
  title: string;
  url?: string;
  snippet?: string;
  score?: number;
  documentId?: string;
  chunkIndex?: number;
  pageRange?: string;
}

export interface IntentRouteResult {
  intent: AssistantIntentType;
  useKnowledge: boolean;
  useWeb: boolean;
  requiresFollowUp: boolean;
  followUpQuestions: string[];
  parsed: {
    questionType?: "mcq" | "frq";
    count?: number;
    difficulty?: "easy" | "medium" | "hard";
    classHours?: number;
  };
}

export interface AssistantContextBundle {
  knowledgeContext: string;
  webContext: string;
  memoryContext: string;
  sources: SourceReference[];
}

export interface KnowledgeSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score?: number;
}

export type KnowledgeRetrievalConfidence = "high" | "medium" | "low";

export type KnowledgeRetrievalStrategy =
  | "semantic"
  | "keyword"
  | "hybrid"
  | "corrective_hybrid"
  | "fallback";

export interface KnowledgeRetrievalAttempt {
  query: string;
  stage: "primary" | "corrective" | "fallback";
  strategy: KnowledgeRetrievalStrategy;
  hitCount: number;
  confidence: KnowledgeRetrievalConfidence;
  reason: string;
}

export interface KnowledgeRetrievalSummary {
  strategy: KnowledgeRetrievalStrategy;
  confidence: KnowledgeRetrievalConfidence;
  corrected: boolean;
  originalQuery: string;
  finalQuery: string;
  reason: string;
  attempts: KnowledgeRetrievalAttempt[];
}

export interface KnowledgeRagSearchResponse {
  results: KnowledgeSearchResult[];
  retrieval: KnowledgeRetrievalSummary;
}

export interface ConversationMemorySearchResult {
  id: string;
  summary: string;
  preferences: string[];
  progress: string[];
  weakPoints: string[];
  score?: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  summary: string;
  results: WebSearchResult[];
}

export interface ConversationSummaryExtraction {
  summary: string;
  preferences: string[];
  progress: string[];
  weakPoints: string[];
}

export interface ChatResponse {
  intent: IntentRouteResult;
  answer: string;
  sources: SourceReference[];
  contextBundle: AssistantContextBundle;
}

export interface AssistantMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
  sources?: Json;
}
