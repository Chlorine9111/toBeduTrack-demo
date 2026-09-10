import {
  enqueueTeacherMemoryFormationJob,
  processTeacherMemoryFormationJob,
} from "@/lib/teacher-memory/service";
import type { AgentConversationContext } from "@/lib/agent/context-memory";
import {
  runReliableBackgroundTaskNow,
  scheduleReliableAfterTask,
} from "@/lib/runtime/background-task";

function buildMemoryTurnKey(params: {
  conversationId: string;
  assistantMessageId: string;
}) {
  return `agent-turn:${params.conversationId}:${params.assistantMessageId}`;
}

export async function enqueueAgentMemoryFormation(params: {
  teacherId: string;
  profileKey: string;
  conversationId: string;
  conversationTitle: string | null;
  assistantMessageId: string;
  displayUserPrompt: string;
  assistantText: string;
  toolNames: string[];
  nextConversationContext: AgentConversationContext;
  isFirstTurn: boolean;
  scheduleWithAfter?: boolean;
}) {
  const job = await enqueueTeacherMemoryFormationJob({
    turnKey: buildMemoryTurnKey({
      conversationId: params.conversationId,
      assistantMessageId: params.assistantMessageId,
    }),
    payload: {
      profileKey: params.profileKey,
      scope: "agent_workspace",
      teacherId: params.teacherId,
      conversationId: params.conversationId,
      conversationTitle: params.conversationTitle,
      latestUserPrompt: params.displayUserPrompt,
      latestAssistantReply: params.assistantText,
      toolNames: params.toolNames,
      eventType: params.isFirstTurn ? "session_start" : "agent_turn",
      conversation: params.nextConversationContext,
      title: params.conversationTitle,
    },
  });

  if (params.scheduleWithAfter === false) {
    await runReliableBackgroundTaskNow({
      taskType: "agent.memory_formation",
      taskKey: job.id,
      teacherId: params.teacherId,
      conversationId: params.conversationId,
      payload: {
        assistantMessageId: params.assistantMessageId,
      },
      run: async () => {
        await processTeacherMemoryFormationJob({ jobId: job.id });
      },
    });
    return job;
  }

  scheduleReliableAfterTask({
    taskType: "agent.memory_formation",
    taskKey: job.id,
    teacherId: params.teacherId,
    conversationId: params.conversationId,
    payload: {
      assistantMessageId: params.assistantMessageId,
    },
    run: async () => {
      await processTeacherMemoryFormationJob({ jobId: job.id });
    },
  });

  return job;
}
