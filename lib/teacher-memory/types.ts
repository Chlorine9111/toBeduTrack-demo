export type TeacherMemoryScope = "wechat_editor" | "agent_workspace";

export type TeacherMemoryEntryStatus = "active" | "closed";

export type TeacherMemoryMutationOperation =
  | "add"
  | "update"
  | "close"
  | "delete"
  | "noop";

export type TeacherMemoryBucket =
  | "procedural"
  | "semantic"
  | "activeGoals"
  | "openLoops"
  | "closedLoops"
  | "episodicRecent";

export interface TeacherMemoryEntry {
  key: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  status: TeacherMemoryEntryStatus;
  sourceTurnKey: string | null;
}

export interface TeacherCoreProfileState {
  subjects: string[];
  teachingStyle: string;
  notes: string;
}

export interface TeacherStructuredMemoryState {
  version: 2;
  coreProfile: TeacherCoreProfileState;
  procedural: TeacherMemoryEntry[];
  semantic: TeacherMemoryEntry[];
  activeGoals: TeacherMemoryEntry[];
  openLoops: TeacherMemoryEntry[];
  closedLoops: TeacherMemoryEntry[];
  episodicRecent: TeacherMemoryEntry[];
  latestConversationSummary: string;
  lastArtifactType: string;
  lastArtifactSummary: string;
  lastReviewedAt: string | null;
}

export interface TeacherMemoryMutationDraft {
  bucket: TeacherMemoryBucket;
  operation: TeacherMemoryMutationOperation;
  targetKey: string;
  beforeValue: unknown | null;
  afterValue: unknown | null;
  reason: string;
}

export interface TeacherMemoryMutationMeta {
  turnKey?: string;
  model?: string;
}

export interface TeacherMemoryFormationJobPayload {
  profileKey: string;
  scope: TeacherMemoryScope;
  teacherId: string | null;
  conversationId?: string | null;
  conversationTitle?: string | null;
  latestUserPrompt: string;
  latestAssistantReply: string;
  toolNames: string[];
  eventType: string;
  conversation: {
    olderSummary: string;
    recentMessages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
      createdAt?: string;
    }>;
    latestAssistantArtifact: string;
    latestAssistantReply: string;
    recentTranscript: string;
  };
  title?: string | null;
}

export interface TeacherMemoryFormationJob {
  id: string;
  teacherId: string | null;
  profileKey: string;
  scope: TeacherMemoryScope;
  conversationId: string | null;
  turnKey: string;
  status: string;
  attempts: number;
  lastError: string | null;
  payload: TeacherMemoryFormationJobPayload;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface TeacherMemoryRecord {
  id: string;
  profileKey: string;
  teacherId: string | null;
  scope: TeacherMemoryScope;
  preferences: Record<string, unknown>;
  history: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

export interface TeacherMemoryEvent {
  id: string;
  memoryId: string;
  profileKey: string;
  teacherId: string | null;
  scope: TeacherMemoryScope;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TeacherMemoryContext {
  memory: TeacherMemoryRecord;
  insights: {
    favoriteTab: string | null;
    favoriteTemplate: string | null;
    favoriteAiAction: string | null;
    favoriteTool?: string | null;
    totalSessions: number;
    lastUsedAt: string | null;
    recentTitles: string[];
    recentTopics?: string[];
    activeGoals?: string[];
    openLoops?: string[];
    proceduralMemory?: string[];
    semanticMemory?: string[];
    episodicMemory?: string[];
    coreProfile?: TeacherCoreProfileState;
    lastConversationTitle?: string | null;
  };
}
