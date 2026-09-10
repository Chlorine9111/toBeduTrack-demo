import { processTeacherMemoryFormationJob } from "@/lib/teacher-memory/service";
import { processGradingJob } from "@/lib/grading/jobs";
import { backgroundTaskReplayHandlers } from "@/lib/runtime/background-task-replay-handlers";

export type BackgroundTaskReplayContext = {
  taskType: string;
  taskKey: string;
  teacherId?: string | null;
  conversationId?: string | null;
  requestId?: string | null;
  payload?: Record<string, unknown> | null;
};

type BackgroundTaskReplayDefinition = {
  handlerKey: string;
  replay: (context: BackgroundTaskReplayContext) => Promise<void>;
};

const backgroundTaskReplayRegistry: Record<string, BackgroundTaskReplayDefinition> = {
  "agent.memory_formation": {
    handlerKey: "teacher_memory_job",
    replay: async ({ taskKey }) => {
      await processTeacherMemoryFormationJob({ jobId: taskKey });
    },
  },
  "grading.infer_answer_key": {
    handlerKey: "grading_job",
    replay: async ({ taskKey }) => {
      await processGradingJob({ jobId: taskKey });
    },
  },
  "grading.auto_grade_submission": {
    handlerKey: "grading_job",
    replay: async ({ taskKey }) => {
      await processGradingJob({ jobId: taskKey });
    },
  },
  "grading.auto_grade_batch": {
    handlerKey: "grading_job",
    replay: async ({ taskKey }) => {
      await processGradingJob({ jobId: taskKey });
    },
  },
  "knowledge.auto_import": {
    handlerKey: "knowledge_document_auto_import",
    replay: backgroundTaskReplayHandlers.replayKnowledgeAutoImport,
  },
  "pbl.project_sync": {
    handlerKey: "pbl_project_sync",
    replay: backgroundTaskReplayHandlers.replayPblProjectSync,
  },
  "pbl.generate_v2_postprocess": {
    handlerKey: "pbl_generate_postprocess",
    replay: backgroundTaskReplayHandlers.replayPblGeneratePostprocess,
  },
  "agent.lesson_plan_postprocess": {
    handlerKey: "agent_lesson_plan_postprocess",
    replay: backgroundTaskReplayHandlers.replayLessonPlanPostprocess,
  },
  "agent.pbl_postprocess": {
    handlerKey: "agent_pbl_postprocess",
    replay: backgroundTaskReplayHandlers.replayPblPostprocess,
  },
  "agent.conversation_exercise_worksheet_postprocess": {
    handlerKey: "agent_conversation_exercise_worksheet_postprocess",
    replay: backgroundTaskReplayHandlers.replayConversationExerciseWorksheetPostprocess,
  },
  "agent.temp_pool_worksheet_postprocess": {
    handlerKey: "agent_temp_pool_worksheet_postprocess",
    replay: backgroundTaskReplayHandlers.replayTempPoolWorksheetPostprocess,
  },
  "agent.temp_pool_missing_notice": {
    handlerKey: "agent_temp_pool_missing_notice",
    replay: backgroundTaskReplayHandlers.replayTempPoolMissingNotice,
  },
  "agent.exercise_postprocess": {
    handlerKey: "agent_exercise_postprocess",
    replay: backgroundTaskReplayHandlers.replayExercisePostprocess,
  },
  "agent.exercise_save_followup_postprocess": {
    handlerKey: "agent_exercise_save_followup_postprocess",
    replay: backgroundTaskReplayHandlers.replayExerciseSaveFollowupPostprocess,
  },
  "content_asset_cleanup": {
    handlerKey: "content_asset_cleanup",
    replay: backgroundTaskReplayHandlers.replayContentAssetCleanup,
  },
  "content_library_projection_sync": {
    handlerKey: "content_library_projection_sync",
    replay: backgroundTaskReplayHandlers.replayContentLibraryProjectionSync,
  },
  "content_library_origin_cleanup": {
    handlerKey: "content_library_origin_cleanup",
    replay: backgroundTaskReplayHandlers.replayContentLibraryOriginCleanup,
  },
  "document_source_projection_sync": {
    handlerKey: "document_source_projection_sync",
    replay: backgroundTaskReplayHandlers.replayDocumentSourceProjectionSync,
  },
  "content_asset_pdf_library_sync": {
    handlerKey: "content_asset_pdf_library_sync",
    replay: backgroundTaskReplayHandlers.replayContentAssetPdfLibrarySync,
  },
  "content_asset_pdf_library_cleanup": {
    handlerKey: "content_asset_pdf_library_cleanup",
    replay: backgroundTaskReplayHandlers.replayContentAssetPdfLibraryCleanup,
  },
};

export function resolveBackgroundTaskReplayDefinition(taskType: string) {
  return backgroundTaskReplayRegistry[taskType] ?? null;
}
