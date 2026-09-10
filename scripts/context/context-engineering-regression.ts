import assert from "node:assert/strict";
import { buildAgentMemoryFragments } from "@/lib/agent/context-memory";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import { buildAgentTaskContext } from "@/lib/agent/task-context";
import { buildAgentTaskState, mergeAgentTaskStateWithContext } from "@/lib/agent/task-state";
import { buildAgentRuntimeContextPack } from "@/lib/agent/runtime-context";
import {
  buildContextRetrievalQuery,
  detectContextReset,
  selectContextFragments,
  selectConversationMessages,
} from "@/lib/context-engineering/core";

function runResetSuppressionCase() {
  const pack = buildAgentRuntimeContextPack({
    visiblePrompt: "重新开始，帮我做 AP Chemistry Unit 3 的习题，不要参考刚才的微积分内容。",
    modelPrompt: "重新开始，帮我做 AP Chemistry Unit 3 的习题，不要参考刚才的微积分内容。",
    conversationContext: {
      olderSummary: "上一轮一直在做 AP Calculus Chain Rule 练习，重点是导数。",
      recentMessages: [
        { role: "user", content: "帮我继续优化 chain rule 题单" },
        { role: "assistant", content: "我已经生成了一组 AP Calculus Chain Rule 题目。" },
      ],
      latestAssistantArtifact: "上一份重要产物是一套 AP Calculus Chain Rule 题目。",
      latestAssistantReply: "我已经生成了一组 AP Calculus Chain Rule 题目。",
      recentTranscript: "教师: 帮我继续优化 chain rule 题单\n助手: 我已经生成了一组 AP Calculus Chain Rule 题目。",
    },
    memoryPrompt: [
      "最近持续关注主题: AP Calculus；Chain Rule",
      "当前高频目标: 继续补 calculus worksheet",
    ].join("\n"),
    uploadedMaterialsSummary: "【参考材料1】chemistry_unit3_notes.pdf\n化学平衡、反应商 Q、平衡常数 Kc 与 Kp。",
    memorySemanticHints: ["AP Calculus", "Chain Rule"],
    memoryEpisodicHints: ["继续补 calculus worksheet"],
  });

  assert.equal(pack.resetApplied, true);
  assert.ok(pack.systemContext.includes("本轮输入被识别为新任务"));
  assert.ok(!pack.systemContext.includes("Chain Rule"));
  assert.ok(pack.systemContext.includes("化学平衡"));
  assert.ok(!pack.retrievalHint.includes("Chain Rule"));
}

function runLayeredMemoryCase() {
  const memory = {
    id: "memory-1",
    profileKey: "teacher-1",
    teacherId: "teacher-1",
    scope: "agent_workspace" as const,
    preferences: {
      responseStyle: "结构化、短段落、可直接上课",
    },
    history: [],
    summary: {
      sessions: 8,
      toolUsage: { generate_lesson_plan_workflow: 4 },
      recentTopics: ["AP Biology Unit 2"],
      activeGoals: ["继续优化上一版教案"],
      openLoops: ["补充 exit ticket"],
      stablePreferences: ["优先给可直接上课的结构化版本"],
      knowledgeAnchors: ["长期教授 AP Biology"],
      proceduralMemory: ["偏好先给可执行版本，再给延伸建议"],
      semanticMemory: ["长期教授 AP Biology Unit 2-4"],
      episodicMemory: ["最近一直在打磨 AP Biology Unit 2 教案"],
      latestConversationSummary: "上一轮在改 AP Biology Unit 2 教案。",
      lastArtifactSummary: "上一份产物是一版 45 分钟教案。",
      lastConversationTitle: "AP Biology 教案优化",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  const fragments = buildAgentMemoryFragments(memory);
  const pack = buildAgentRuntimeContextPack({
    visiblePrompt: "重新开始，帮我做 AP Chemistry Unit 3 的习题，不要参考刚才的 Biology 教案。",
    modelPrompt: "重新开始，帮我做 AP Chemistry Unit 3 的习题，不要参考刚才的 Biology 教案。",
    conversationContext: {
      olderSummary: "",
      recentMessages: [],
      latestAssistantArtifact: "",
      latestAssistantReply: "",
      recentTranscript: "",
    },
    memoryFragments: fragments,
    uploadedMaterialsSummary: "",
    memorySemanticHints: ["AP Biology Unit 2-4"],
    memoryEpisodicHints: ["最近一直在打磨 AP Biology Unit 2 教案"],
  });

  assert.ok(pack.systemContext.includes("稳定偏好与习惯"));
  assert.ok(pack.systemContext.includes("可直接上课"));
  assert.ok(!pack.systemContext.includes("最近一直在打磨 AP Biology Unit 2 教案"));
  assert.ok(!pack.retrievalHint.includes("打磨 AP Biology"));
}

function runContinuationSelectionCase() {
  const messages = selectConversationMessages({
    query: "继续把上一版教案改成英文，并保持 45 分钟。",
    messages: [
      { role: "user", content: "帮我做 AP Biology Unit 2 教案" },
      { role: "assistant", content: "下面是上一版教案，包含教学目标、课堂活动和作业安排。" },
      { role: "user", content: "请再具体一点" },
      { role: "assistant", content: "我补充了实验活动、板书和 exit ticket。" },
    ],
  });

  assert.ok(messages.length >= 2);
  assert.ok(messages.some((item) => item.content.includes("上一版教案")));
}

function runFragmentSelectionCase() {
  const selected = selectContextFragments({
    query: "帮我总结 AP Physics Unit 1 的关键误区",
    maxLength: 700,
    minScore: 2,
    fragments: [
      {
        id: "memory-1",
        kind: "memory",
        label: "长期记忆",
        content: "最近持续关注主题: AP Physics Unit 1；kine​​matics；motion graphs",
        priority: 8,
        maxLength: 220,
      },
      {
        id: "memory-2",
        kind: "memory",
        label: "长期记忆 2",
        content: "最近持续关注主题: AP Calculus；Chain Rule；derivatives",
        priority: 8,
        maxLength: 220,
      },
      {
        id: "artifact-1",
        kind: "artifact",
        label: "上一份产物",
        content: "上一份讲义总结了 motion graphs 的常见误区和斜率判断。",
        priority: 7,
        maxLength: 260,
      },
    ],
  });

  const joined = selected.fragments.map((item) => item.content).join("\n");
  assert.ok(joined.includes("AP Physics Unit 1"));
  assert.ok(!joined.includes("Chain Rule"));
}

function runRetrievalQueryCase() {
  const query = buildContextRetrievalQuery({
    query: "帮我整理 AP History Unit 4 的 DBQ 写作要点",
    hints: [
      "最近持续关注主题: AP History Unit 4",
      "当前高频目标: DBQ 写作训练",
      "最近持续关注主题: AP Calculus Chain Rule",
    ],
  });

  assert.ok(query.includes("AP History Unit 4"));
  assert.ok(query.includes("DBQ"));
  assert.ok(!detectContextReset(query));
}

function runTaskStateCase() {
  const lessonState = buildAgentTaskState({
    visiblePrompt: "请基于这份讲义生成一份 AP Biology Unit 2 教案",
    latestPrompt: "请基于这份讲义生成一份 AP Biology Unit 2 教案",
    lastArtifactType: "",
    hasUploadedMaterials: true,
  });
  assert.equal(lessonState.kind, "lesson_plan");
  assert.ok(lessonState.allowedTools.includes("generate_lesson_plan_workflow"));
  assert.ok(!lessonState.allowedTools.includes("generate_ap_exercises_pipeline"));

  const researchState = buildAgentTaskState({
    visiblePrompt: "帮我查一下 AP History DBQ 最新评分趋势并给来源",
    latestPrompt: "帮我查一下 AP History DBQ 最新评分趋势并给来源",
    lastArtifactType: "",
    hasUploadedMaterials: false,
  });
  assert.equal(researchState.kind, "research");
  assert.ok(researchState.allowedTools.includes("web_search"));
  assert.ok(researchState.allowedTools.includes("read_webpage"));
}

function runTaskContextCarryoverCase() {
  const taskContext = buildAgentTaskContext({
    message: "重新开始，帮我出 3 道 AP Biology Unit 3 习题",
    action: "generate_exercises",
    actionLabel: "生成练习题",
    curriculum: "AP Biology Unit 3",
    count: "3",
    conversationContext: ["上一轮一直在做 AP Calculus Chain Rule 题单"],
  });

  const baseState = buildAgentTaskState({
    visiblePrompt: "重新开始，帮我出 3 道 AP Biology Unit 3 习题",
    latestPrompt: "重新开始，帮我出 3 道 AP Biology Unit 3 习题",
    lastArtifactType: "exercises",
    hasUploadedMaterials: false,
  });
  const mergedState = mergeAgentTaskStateWithContext(baseState, taskContext);

  assert.equal(taskContext.kind, "exercise");
  assert.equal(taskContext.mode, "reset");
  assert.ok(taskContext.normalizedRequest.includes("AP Biology Unit 3"));
  assert.ok(!taskContext.retrievalQuery.includes("Chain Rule"));
  assert.equal(mergedState.kind, "exercise");
  assert.equal(mergedState.resetApplied, true);
  assert.ok(mergedState.summary.includes("标准化请求"));
}

function runTaskAwareMaterialCase() {
  const text =
    "Chain rule states that the derivative of a composite function requires the outer derivative times the inner derivative. Common error: students forget to multiply by the derivative of the inside. Example: d/dx of sin(x^2).";
  const lessonContext = buildTaskAwareMaterialContext({
    materials: [{ fileName: "calculus-note.pdf", fileType: "pdf", textContent: text }],
    taskKind: "lesson_plan",
    query: "请基于这份材料设计 chain rule 课堂活动和误区讲解",
    maxLength: 500,
  });
  const exerciseContext = buildTaskAwareMaterialContext({
    materials: [{ fileName: "calculus-note.pdf", fileType: "pdf", textContent: text }],
    taskKind: "exercise",
    query: "帮我基于这份材料生成 chain rule 习题",
    maxLength: 500,
  });

  assert.ok(lessonContext.includes("可用于教案的材料摘录"));
  assert.ok(exerciseContext.includes("可用于出题的材料摘录"));
  assert.ok(exerciseContext.includes("Chain rule"));
}

function main() {
  runResetSuppressionCase();
  runContinuationSelectionCase();
  runFragmentSelectionCase();
  runRetrievalQueryCase();
  runTaskStateCase();
  runTaskContextCarryoverCase();
  runTaskAwareMaterialCase();
  runLayeredMemoryCase();
  console.log("context-engineering regression: PASS");
}

main();
