/**
 * Follow-up Questions System type definitions.
 *
 * Phase 1: Pre-generation — enhanced parameter inference with confidence scoring
 * Phase 2: Post-generation — result quality check and suggestion generation
 */

import type { WorkflowAction, ParsedIntent } from "@/lib/chat/intent";

// ---------------------------------------------------------------------------
// Confidence levels
// ---------------------------------------------------------------------------

/** How confident the system is about an inferred parameter value. */
export type ConfidenceLevel = "high" | "medium" | "low";

/** Where a parameter value originated. */
export type ParameterSource =
  | "explicit"      // Teacher stated it directly
  | "context"       // Inferred from conversation/curriculum context
  | "history"       // Carried from previous interaction
  | "default";      // System default

// ---------------------------------------------------------------------------
// Teacher Profile (accumulated over sessions)
// ---------------------------------------------------------------------------

export interface TeacherProfile {
  /** Preferred exercise type distribution, e.g. { MC: 0.6, FR: 0.3, MIXED: 0.1 } */
  preferredExerciseType?: Record<string, number>;
  /** Most-used difficulty levels */
  preferredDifficulty?: number;
  /** Typical exercise count */
  preferredCount?: number;
  /** Typical lesson duration */
  preferredDuration?: number;
  /** Preferred lesson template */
  preferredTemplate?: string;
  /** Preferred rubric dimension count */
  preferredDimensionCount?: number;
  /** Track the teacher most commonly works with */
  dominantTrack?: "ap" | "general";
  /** Most recently used course IDs */
  recentCourseIds?: string[];
  /** Most recently used unit IDs */
  recentUnitIds?: string[];
  /** Total interactions count (for weighting defaults) */
  interactionCount?: number;
}

// ---------------------------------------------------------------------------
// Phase 1: Parameter Inference
// ---------------------------------------------------------------------------

/** A single inferred parameter with confidence metadata. */
export interface ParameterInference {
  /** The parameter field name, e.g. "count", "difficulty", "exerciseType" */
  field: string;
  /** The inferred value */
  value: unknown;
  /** Confidence in this inference */
  confidence: ConfidenceLevel;
  /** Where the value came from */
  source: ParameterSource;
  /** Human-readable reason for this value (Chinese) */
  reason: string;
}

/** Full inference result for a teacher request. */
export interface InferenceResult {
  /** The primary action(s) inferred */
  actions: WorkflowAction[];
  /** All parameter inferences with confidence scores */
  parameters: ParameterInference[];
  /** Overall confidence in the complete inference */
  overallConfidence: ConfidenceLevel;
  /** Whether we need to confirm anything with the teacher */
  needsConfirmation: boolean;
  /** Natural language confirmation message (Chinese), or null if no confirmation needed */
  confirmationMessage: string | null;
  /** Critical unknown fields that MUST be asked (max 1 question) */
  criticalUnknowns: string[];
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

/** The confirmation message shown to the teacher before generation. */
export interface ConfirmationPayload {
  /** Natural language summary of what will be generated */
  summary: string;
  /** Key parameters displayed for quick review */
  keyParams: Array<{
    label: string;
    value: string;
    confidence: ConfidenceLevel;
    field: string;
  }>;
  /** Optional single question if a critical parameter is unknown */
  question?: {
    text: string;
    field: string;
    options: Array<{
      label: string;
      value: string | number | boolean;
    }>;
  };
  /** Whether the teacher can just confirm without changes */
  canAutoConfirm: boolean;
}

// ---------------------------------------------------------------------------
// Phase 2: Post-generation Suggestions
// ---------------------------------------------------------------------------

export type SuggestionPriority = "high" | "medium" | "low";

export type SuggestionCategory =
  | "quality_issue"     // Something wrong with the generated content
  | "enhancement"       // Could be improved
  | "next_step"         // Natural workflow continuation
  | "alternative"       // Alternative approach
  | "export";           // Export/save suggestion

/** A single post-generation suggestion. */
export interface PostGenerationSuggestion {
  /** Unique ID for this suggestion */
  id: string;
  /** Priority — determines display order */
  priority: SuggestionPriority;
  /** Category of the suggestion */
  category: SuggestionCategory;
  /** Short label shown on the button (Chinese, max 15 chars) */
  label: string;
  /** Longer description shown on hover/expansion (Chinese) */
  description: string;
  /** The action to execute if clicked */
  action: SuggestionAction;
  /** Icon hint for UI rendering */
  icon?: string;
}

/** What happens when a suggestion is clicked. */
export type SuggestionAction =
  | { type: "send_message"; message: string }
  | { type: "trigger_action"; action: WorkflowAction; params?: Record<string, unknown> }
  | { type: "navigate"; path: string }
  | { type: "modify_params"; changes: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Content Check Result (post-generation)
// ---------------------------------------------------------------------------

export interface ContentCheckResult {
  /** Overall quality score 0-100 */
  qualityScore: number;
  /** Quick quality band */
  qualityBand: "excellent" | "good" | "edge" | "fail";
  /** Issues found during self-check */
  issues: Array<{
    severity: "high" | "medium" | "low";
    message: string;
    field?: string;
  }>;
  /** Generated suggestions, max 3, sorted by priority */
  suggestions: PostGenerationSuggestion[];
  /** Brief summary of the check (Chinese) */
  summary: string;
}

// ---------------------------------------------------------------------------
// API Request/Response shapes
// ---------------------------------------------------------------------------

/** POST /api/generation/check — request body */
export interface GenerationCheckRequest {
  /** What type of content was generated */
  contentType: "exercises" | "rubric" | "lesson_plan" | "worksheet";
  /** The generated content (JSON) */
  content: unknown;
  /** The original intent/parameters used for generation */
  originalIntent: Record<string, unknown>;
  /** Optional teacher profile for personalized suggestions */
  teacherProfile?: TeacherProfile;
}

/** POST /api/generation/check — response body */
export interface GenerationCheckResponse {
  check: ContentCheckResult;
  /** Model used for the check */
  model: string;
}

// ---------------------------------------------------------------------------
// Enhanced Intent Response (extends existing IntentResponse)
// ---------------------------------------------------------------------------

/** Extended intent response with confidence scoring. */
export interface EnhancedIntentResponse {
  intent: ParsedIntent & {
    parameterInferences?: ParameterInference[];
    overallConfidence?: ConfidenceLevel;
  };
  source: "model" | "fallback" | "enhanced";
  completeness: "complete" | "needs_info";
  missingRequired: string[];
  /** New: natural language confirmation instead of form-based questions */
  confirmation?: ConfirmationPayload;
  /** Legacy: still supported for backward compatibility */
  followUpQuestion?: string;
  followUpOptions?: Array<{ label: string; value: string; field: string }>;
  optionQuestion?: {
    question: string;
    options: Array<{
      key: string;
      label: string;
      value: string;
      field: string;
      isOther: boolean;
      description?: string;
    }>;
    questionType: "required" | "preference";
    field: string;
  };
  model?: string;
}
