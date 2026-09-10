export type MemoryDocumentType = "profile" | "session_summary" | "knowledge";

export interface MemorySearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SessionSummaryExtraction {
  text: string;
  pendingTasks: string[];
  profileUpdate: {
    subjects: string[];
    style: string;
  } | null;
}

export interface MemoryContext {
  profile: string | null;
  recentSessions: string[];
  knowledge: string[];
}
