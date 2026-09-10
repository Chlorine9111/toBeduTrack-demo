import { summarizeConversationTitle } from "@/lib/assistant/store";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import type { StoredConversationMessage } from "@/lib/agent/chat-shared";
import {
  extractEmbeddedArtifactPayload,
  type EmbeddedArtifactKind,
} from "@/lib/agent/artifact-payload";
import {
  parseIntentFromText,
  type WorkflowAction,
} from "@/lib/chat/intent";

const WORKSHEET_BUILD_PATTERN =
  /(worksheet|练习卷|作业单|组卷|套卷|试卷|出一套题|整理成一套题|render.*worksheet|导出.*worksheet)/i;
const WORKSHEET_DOCUMENT_PATTERN =
  /(讲义|导学单|学习单|活动单|阅读单|词汇单|课堂材料|课堂活动|学生用|上课用|guided\s*notes?|handout|student\s+handout|study\s+guide|graphic\s+organizer|summary\s+sheet|notes?\s+sheet|fill-?in\s+notes?)/i;
const WORKSHEET_QUESTION_PATTERN =
  /(题库|现成题|已有题|抽题|组卷|试卷|考试卷|题目|习题|选择题|简答题|问答题|填空题|解析|答案|mcq|frq|multiple\s*choice|free\s*response|quiz|assessment|刷题|\d{1,2}\s*(?:道|题))/i;
const WORKSHEET_MATERIAL_DRIVEN_PATTERN =
  /(基于|根据|围绕|结合|用这份|按这份|根据这份|总结|梳理|讲解|概念|框架|提纲|阅读|材料|文章|课文|文本|资料|notes?|summary|outline|讲义型|课堂用|学生版)/i;
const NEGATED_WORKSHEET_QUESTION_PATTERN =
  /(?:不要|不用|不需要|无需|别|不是)[^，。；;\n]{0,24}(?:题库|组卷|试卷|题目|习题|整套习题|选择题|简答题|问答题|填空题|答案页?|解析)/gi;
const GENERIC_FOLLOW_UP_TITLE_PATTERN =
  /^(继续|继续优化|优化一下|再调整|改成|改为|润色|翻译|扩写|缩短|继续吧|继续|refine|revise|adjust|rewrite|translate|expand|shorten|continue)\b/i;
const ARTIFACT_EDIT_FOLLOW_UP_PATTERN =
  /(刚才那份|刚才那版|上一版|上一份|上轮|刚生成|这份|那份|把刚才|把上次|把上一版|修改上一版|改成|改为|修改|调整|补充|增加|删掉|精简|重写|导出|排版|翻译|扩写|缩短)/i;
const CONVERSATION_EXERCISE_REUSE_PATTERN =
  /(刚才|上一轮|刚生成|刚才那|这些题|这几道|那几道|这批|上次生成|just generated|those questions|these questions|previous exercises)/i;
const EXPLICIT_NEW_TASK_PATTERN =
  /^\s*(新任务|新需求|新指令|new task|new request)[:：]?\s*/i;
const TEMP_POOL_REFERENCE_PATTERN =
  /(这份pdf|这份\s*pdf|上传的题|这批题|这份题|里面的题|当前pdf|当前这份pdf|刚上传的pdf|from this pdf|these uploaded questions|this uploaded pdf)/i;

export type DirectGenerationWorkflow =
  | "lesson-plan"
  | "rubric"
  | "pbl"
  | "worksheet"
  | "exercises"
  | "organize";

export type WorksheetRequestMode = "question_set" | "document_handout";

function sanitizeConversationFileLabel(fileName: string) {
  return (
    fileName
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? "上传材料"
  );
}

function formatCourseHintLabel(courseHint: string | undefined) {
  if (!courseHint) return "";

  const labels: Record<string, string> = {
    environmental_science: "AP Environmental Science",
    calculus: "AP Calculus",
    physics: "AP Physics",
    statistics: "AP Statistics",
    chemistry: "AP Chemistry",
    biology: "AP Biology",
    english: "AP English",
    history: "AP History",
  };

  return labels[courseHint] ?? courseHint.replace(/_/g, " ");
}

function mapEmbeddedArtifactKindToWorkflow(
  kind: EmbeddedArtifactKind | null | undefined,
): DirectGenerationWorkflow | null {
  switch (kind) {
    case "lesson-plan":
      return "lesson-plan";
    case "rubric":
      return "rubric";
    case "pbl":
      return "pbl";
    case "exam":
    case "worksheet":
      return "worksheet";
    case "exercises":
      return "exercises";
    default:
      return null;
  }
}

function mapMemoryArtifactTypeToWorkflow(
  lastArtifactType: string | null | undefined,
): DirectGenerationWorkflow | null {
  switch ((lastArtifactType ?? "").trim()) {
    case "lesson_plan":
      return "lesson-plan";
    case "rubric":
      return "rubric";
    case "pbl":
      return "pbl";
    case "exam":
    case "worksheet":
      return "worksheet";
    case "exercises":
      return "exercises";
    default:
      return null;
  }
}

function mapTaskContextActionToWorkflow(
  action: string | null | undefined,
): DirectGenerationWorkflow | null {
  switch ((action ?? "").trim()) {
    case "generate_lesson_plan":
    case "lesson_plan":
    case "scan_lesson":
      return "lesson-plan";
    case "generate_rubric":
    case "export_rubric_pdf":
      return "rubric";
    case "generate_pbl":
      return "pbl";
    case "create_worksheet":
    case "export_exam_pdf":
    case "export_worksheet_pdf":
      return "worksheet";
    case "generate_exercises":
    case "save_exercises":
    case "scan_variant":
      return "exercises";
    case "organize_content":
      return "organize";
    default:
      return null;
  }
}

function mapTaskContextKindToWorkflow(
  kind: string | null | undefined,
): DirectGenerationWorkflow | null {
  switch ((kind ?? "").trim()) {
    case "lesson_plan":
      return "lesson-plan";
    case "exercise":
      return "exercises";
    case "rubric":
      return "rubric";
    case "pbl":
      return "pbl";
    case "organize":
      return "organize";
    default:
      return null;
  }
}

function findLatestArtifactKind(previousMessages: StoredConversationMessage[]) {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (message.role !== "assistant") continue;
    const payload = extractEmbeddedArtifactPayload(message.content);
    if (payload?.kind) return payload.kind;
  }
  return null;
}

export function buildConversationOverviewTitle(params: {
  currentTitle: string | null;
  displayPrompt: string;
  latestPrompt: string;
  uploadedFileNames: string[];
}) {
  const normalizedPrompt = (params.displayPrompt || params.latestPrompt)
    .replace(/\n+\(?已附[\s\S]*$/, "")
    .replace(/\n+Uploaded materials?:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedPrompt) {
    return params.currentTitle?.trim() || "新对话";
  }

  const existingTitle = params.currentTitle?.trim() ?? "";
  if (
    existingTitle &&
    existingTitle !== "新对话" &&
    GENERIC_FOLLOW_UP_TITLE_PATTERN.test(normalizedPrompt)
  ) {
    return existingTitle;
  }

  const parsedIntent = parseIntentFromText(normalizedPrompt);
  const fileLabel = params.uploadedFileNames[0]
    ? sanitizeConversationFileLabel(params.uploadedFileNames[0])
    : "";
  const scopeLabel = [
    formatCourseHintLabel(parsedIntent.courseHint),
    parsedIntent.unitHint ? `Unit ${parsedIntent.unitHint}` : "",
    parsedIntent.topicFocus ?? parsedIntent.topic ?? "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (parsedIntent.actions.includes("organize_content")) {
    return summarizeConversationTitle(`整理 · ${normalizedPrompt}`);
  }

  if (fileLabel) {
    if (parsedIntent.actions.includes("generate_pbl")) {
      return summarizeConversationTitle(`PBL · ${scopeLabel || fileLabel}`);
    }
    if (parsedIntent.actions.includes("generate_lesson_plan")) {
      return summarizeConversationTitle(`教案 · ${scopeLabel || fileLabel}`);
    }
    if (parsedIntent.actions.includes("generate_rubric")) {
      return summarizeConversationTitle(`Rubric · ${scopeLabel || fileLabel}`);
    }
    if (parsedIntent.actions.includes("create_worksheet")) {
      return summarizeConversationTitle(`Worksheet · ${scopeLabel || fileLabel}`);
    }
    if (parsedIntent.actions.includes("generate_exercises")) {
      return summarizeConversationTitle(`习题 · ${scopeLabel || fileLabel}`);
    }
    return summarizeConversationTitle(`${fileLabel} · ${normalizedPrompt}`);
  }

  if (parsedIntent.actions.includes("generate_pbl")) {
    return summarizeConversationTitle(`PBL · ${scopeLabel || normalizedPrompt}`);
  }
  if (parsedIntent.actions.includes("generate_lesson_plan")) {
    return summarizeConversationTitle(`教案 · ${scopeLabel || normalizedPrompt}`);
  }
  if (parsedIntent.actions.includes("generate_rubric")) {
    return summarizeConversationTitle(`Rubric · ${scopeLabel || normalizedPrompt}`);
  }
  if (parsedIntent.actions.includes("create_worksheet")) {
    return summarizeConversationTitle(`Worksheet · ${scopeLabel || normalizedPrompt}`);
  }
  if (parsedIntent.actions.includes("generate_exercises")) {
    return summarizeConversationTitle(`习题 · ${scopeLabel || normalizedPrompt}`);
  }

  return summarizeConversationTitle(normalizedPrompt);
}

export function resolveDirectGenerationWorkflow(
  actions: WorkflowAction[],
): DirectGenerationWorkflow | null {
  if (
    actions.includes("create_worksheet") ||
    actions.includes("export_exam_pdf") ||
    actions.includes("export_worksheet_pdf")
  ) {
    return "worksheet";
  }
  if (
    actions.includes("generate_rubric") ||
    actions.includes("export_rubric_pdf")
  ) {
    return "rubric";
  }
  if (actions.includes("generate_lesson_plan")) return "lesson-plan";
  if (actions.includes("generate_pbl")) return "pbl";
  if (actions.includes("generate_exercises")) return "exercises";
  return null;
}

export function allowsSpecialExerciseRouting(params: {
  explicitWorkflow: DirectGenerationWorkflow | null;
  taskContext?: AgentTaskContext | null;
  allowedWorkflows: DirectGenerationWorkflow[];
}) {
  if (
    params.explicitWorkflow &&
    !params.allowedWorkflows.includes(params.explicitWorkflow)
  ) {
    return false;
  }

  const taskActionWorkflow = mapTaskContextActionToWorkflow(
    params.taskContext?.action,
  );
  if (
    taskActionWorkflow &&
    !params.allowedWorkflows.includes(taskActionWorkflow)
  ) {
    return false;
  }

  const taskKindWorkflow = mapTaskContextKindToWorkflow(
    params.taskContext?.kind,
  );
  if (taskKindWorkflow && !params.allowedWorkflows.includes(taskKindWorkflow)) {
    return false;
  }

  return true;
}

export function resolveLatestArtifactWorkflow(params: {
  previousMessages: StoredConversationMessage[];
  lastArtifactType: string;
}) {
  return (
    mapEmbeddedArtifactKindToWorkflow(
      findLatestArtifactKind(params.previousMessages),
    ) ?? mapMemoryArtifactTypeToWorkflow(params.lastArtifactType)
  );
}

export function findLatestArtifactRawContent(
  previousMessages: StoredConversationMessage[],
  kind: "lesson-plan" | "rubric",
) {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (message.role !== "assistant") continue;
    const payload = extractEmbeddedArtifactPayload(message.content);
    if (payload?.kind !== kind) continue;
    const rawContent = payload.rawContent.trim();
    if (rawContent) return rawContent;
  }
  return "";
}



export function shouldHandleConversationExerciseWorksheetRouting(params: {
  explicitWorkflow: DirectGenerationWorkflow | null;
  taskContext?: AgentTaskContext | null;
  latestArtifactWorkflow: DirectGenerationWorkflow | null;
  latestParsedActions: WorkflowAction[];
  currentPrompt: string;
}) {
  return (
    allowsSpecialExerciseRouting({
      explicitWorkflow: params.explicitWorkflow,
      taskContext: params.taskContext,
      allowedWorkflows: ["worksheet"],
    }) &&
    params.latestArtifactWorkflow === "exercises" &&
    (params.latestParsedActions.includes("create_worksheet") ||
      WORKSHEET_BUILD_PATTERN.test(params.currentPrompt)) &&
    CONVERSATION_EXERCISE_REUSE_PATTERN.test(params.currentPrompt)
  );
}

export function shouldHandleTempPoolWorksheetDirectly(params: {
  latestUserPrompt: string;
  displayUserPrompt: string;
  taskContext?: {
    attachmentMode?: string;
    attachmentUploadIds?: string[];
  } | null;
}) {
  if (params.taskContext?.attachmentMode === "scan_pool_worksheet") {
    return true;
  }

  const currentPrompt = params.displayUserPrompt || params.latestUserPrompt;
  const parsedIntent = parseIntentFromText(currentPrompt);
  const asksWorksheet =
    parsedIntent.actions.includes("create_worksheet") ||
    parsedIntent.actions.includes("export_worksheet_pdf") ||
    WORKSHEET_BUILD_PATTERN.test(currentPrompt);

  return asksWorksheet && TEMP_POOL_REFERENCE_PATTERN.test(currentPrompt);
}

export function inferWorksheetRequestMode(params: {
  currentPrompt: string;
  latestParsedActions: WorkflowAction[];
  taskContext?: {
    action?: string | null;
    attachmentMode?: string;
    topic?: string | null;
    scope?: string | null;
  } | null;
}) {
  const prompt = (params.currentPrompt || "").trim();
  if (!prompt) {
    return "question_set" as WorksheetRequestMode;
  }

  if (params.taskContext?.attachmentMode === "scan_pool_worksheet") {
    return "question_set" as WorksheetRequestMode;
  }

  if (
    params.latestParsedActions.includes("export_exam_pdf") ||
    /(exam|试卷|考试卷|测验卷|答案页)/i.test(prompt)
  ) {
    return "question_set" as WorksheetRequestMode;
  }

  const hasDocumentSignal = WORKSHEET_DOCUMENT_PATTERN.test(prompt);
  const questionPrompt = prompt.replace(NEGATED_WORKSHEET_QUESTION_PATTERN, " ");
  const hasQuestionSignal = WORKSHEET_QUESTION_PATTERN.test(questionPrompt);
  const hasMaterialSignal =
    WORKSHEET_MATERIAL_DRIVEN_PATTERN.test(prompt) ||
    Boolean(params.taskContext?.topic?.trim()) ||
    Boolean(params.taskContext?.scope?.trim());
  if (hasDocumentSignal && !hasQuestionSignal) {
    return "document_handout" as WorksheetRequestMode;
  }

  if (hasQuestionSignal) {
    return "question_set" as WorksheetRequestMode;
  }

  if (WORKSHEET_BUILD_PATTERN.test(prompt) && hasMaterialSignal) {
    return "document_handout" as WorksheetRequestMode;
  }

  return "document_handout" as WorksheetRequestMode;
}
