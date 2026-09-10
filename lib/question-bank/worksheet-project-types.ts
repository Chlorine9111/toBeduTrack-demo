import type { WorksheetEditorDraft } from "@/components/main/question-bank/worksheet-editor/types";

export const WORKSHEET_PROJECT_STORAGE_BUCKET =
  process.env.WORKSHEET_PROJECT_ASSET_BUCKET?.trim() || "worksheet-project-assets";
export const WORKSHEET_PROJECT_SNAPSHOT_VERSION = 1;
export const WORKSHEET_PROJECT_VERSION_HISTORY_LIMIT = 5;

export type WorksheetProjectSnapshot = {
  kind: "worksheet_project";
  version: typeof WORKSHEET_PROJECT_SNAPSHOT_VERSION;
  savedAt: string;
  primaryCourse: string | null;
  questionTags: string[];
  stats: {
    questionCount: number;
    totalPoints: number;
    sectionCount: number;
    blankBlockCount: number;
    pageCount: number | null;
  };
  draft: WorksheetEditorDraft;
};

export type WorksheetProjectVersionEntry = {
  id: string;
  versionNumber: number;
  savedAt: string;
  title: string;
  summaryText: string | null;
  snapshot: WorksheetProjectSnapshot;
};

export type WorksheetProjectMetadata = {
  snapshotVersion: typeof WORKSHEET_PROJECT_SNAPSHOT_VERSION;
  projectKey: string;
  savedAt: string;
  questionCount: number;
  totalPoints: number;
  sectionCount: number;
  blankBlockCount: number;
  pageCount: number | null;
  primaryCourse: string | null;
  questionTags: string[];
  stableVersionId: string;
  stableVersionNumber: number;
  versionHistory: WorksheetProjectVersionEntry[];
};

export type WorksheetProjectPayload = {
  projectId: string;
  title: string;
  savedAt: string;
  summaryText: string | null;
  stableVersionNumber: number;
  draft: WorksheetEditorDraft;
};
