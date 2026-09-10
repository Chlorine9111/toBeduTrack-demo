import {
  isStructuredAgentStreamResponse,
  parseAgentStreamEvents,
  parseLessonUiParts,
} from "../../lib/api/ui-message-stream";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${name}`);
  return Promise.resolve(fn());
}

async function it(name: string, fn: () => void | Promise<void>) {
  const failedBefore = failed;
  try {
    await fn();
    if (failed === failedBefore) {
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

function createUiSseResponse(parts: unknown[]) {
  const text = parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("");
  return new Response(text, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}

function createUiSdkTextPlainResponse(parts: unknown[]) {
  const text = parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("");
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

async function collectAsync<T>(iterable: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

async function main() {
  await describe("parseAgentStreamEvents", async () => {
    await it("应把 UI stream chunk 还原为主工作台事件", async () => {
      const response = createUiSseResponse([
        {
          type: "data-agent-meta",
          data: {
            startedAt: 123,
            conversationId: "conv-1",
          },
        },
        {
          type: "tool-input-available",
          toolCallId: "tool-1",
          toolName: "search_question_bank",
          input: { query: "unit 3 frq" },
        },
        {
          type: "tool-output-available",
          toolCallId: "tool-1",
          output: { total: 2 },
        },
        {
          type: "text-start",
          id: "text-1",
        },
        {
          type: "text-delta",
          id: "text-1",
          delta: "这是第一段输出",
        },
        {
          type: "data-agent-finish",
          data: {
            totalMs: 1800,
            finishReason: "stop",
          },
        },
      ]);

      const events = await collectAsync(parseAgentStreamEvents(response));
      const meta = events.find((event) => event.type === "meta");
      const toolCall = events.find((event) => event.type === "tool-call");
      const toolResult = events.find((event) => event.type === "tool-result");
      const textEvent = events.find((event) => event.type === "text-delta");
      const finish = events.find((event) => event.type === "finish");

      assert(meta?.type === "meta" && meta.conversationId === "conv-1", "应解析出 agent meta");
      assert(
        toolCall?.type === "tool-call" && toolCall.toolName === "search_question_bank",
        "应解析出 tool-call",
      );
      assert(
        toolResult?.type === "tool-result" &&
          typeof toolResult.output === "object" &&
          toolResult.toolName === "search_question_bank",
        "应解析出带 toolName 的 tool-result",
      );
      assert(
        textEvent?.type === "text-delta" && textEvent.text === "这是第一段输出",
        "应解析出 text-delta",
      );
      assert(
        finish?.type === "finish" && finish.totalMs === 1800,
        "应解析出 finish 数据",
      );
    });

    await it("应解析 agent decision 事件，供前端消费 triage 结果", async () => {
      const response = createUiSseResponse([
        {
          type: "data-agent-decision",
          data: {
            workflow: "worksheet",
            workflowLabel: "Worksheet 工作流",
            source: "structured_classifier",
            confidence: "high",
            continuationMode: "new_task",
            retrievalSources: "knowledge",
            artifactIntent: "primary_plus_auxiliary",
            forcedToolChoice: "generate_worksheet",
            preferredTools: ["generate_worksheet", "generate_answer_key"],
            allowedTools: ["generate_worksheet", "generate_answer_key"],
            reasonCodes: ["preflight:ready", "workflow:worksheet"],
            at: 234,
          },
        },
      ]);

      const events = await collectAsync(parseAgentStreamEvents(response));
      const decision = events.find((event) => event.type === "decision");

      assert(
        decision?.type === "decision" &&
          decision.workflow === "worksheet" &&
          decision.source === "structured_classifier" &&
          decision.allowedTools.includes("generate_worksheet") &&
          decision.reasonCodes.includes("preflight:ready"),
        "应解析出 agent decision 事件",
      );
    });

    await it("应解析 agent handoff 事件，并保留 prompt/runtime 差异", async () => {
      const response = createUiSseResponse([
        {
          type: "data-agent-handoff",
          data: {
            kind: "triage_to_runtime",
            promptWorkflow: "general_chat",
            runtimeWorkflow: "worksheet",
            promptMode: "chat_answer",
            runtimeMode: "retrieval_then_document",
            promptSource: "rules",
            runtimeSource: "structured_classifier",
            promptConfidence: "medium",
            runtimeConfidence: "high",
            changed: true,
            reasonCodes: ["classifier:applied", "workflow:worksheet"],
            at: 456,
          },
        },
      ]);

      const events = await collectAsync(parseAgentStreamEvents(response));
      const handoff = events.find((event) => event.type === "handoff");

      assert(
        handoff?.type === "handoff" &&
          handoff.promptWorkflow === "general_chat" &&
          handoff.runtimeWorkflow === "worksheet" &&
          handoff.runtimeMode === "retrieval_then_document" &&
          handoff.changed === true &&
          handoff.reasonCodes.includes("classifier:applied"),
        "应解析出 agent handoff 事件",
      );
    });

    await it("应保留 artifactKey 并解析 artifact persisted 事件", async () => {
      const response = createUiSseResponse([
        {
          type: "data-agent-artifact-chunk",
          data: {
            toolCallId: "tool-worksheet-1",
            artifactKey: "artifact-worksheet-1",
            artifactRole: "auxiliary",
            artifactVariant: "answer_key",
            artifactKind: "worksheet",
            chunkType: "complete",
            data: {
              title: "Worksheet",
            },
            at: 200,
          },
        },
        {
          type: "data-agent-artifact-persisted",
          data: {
            artifactKey: "artifact-worksheet-1",
            artifactRole: "auxiliary",
            artifactVariant: "answer_key",
            assistantMessageId: "assistant-db-1",
            conversationId: "conv-1",
            at: 260,
          },
        },
      ]);

      const events = await collectAsync(parseAgentStreamEvents(response));
      const artifactChunk = events.find((event) => event.type === "artifact-chunk");
      const persistedEvent = events.find((event) => event.type === "artifact-persisted");

      assert(
        artifactChunk?.type === "artifact-chunk" &&
          artifactChunk.artifactKey === "artifact-worksheet-1" &&
          artifactChunk.artifactRole === "auxiliary" &&
          artifactChunk.artifactVariant === "answer_key",
        "应保留 artifactKey",
      );
      assert(
        persistedEvent?.type === "artifact-persisted" &&
          persistedEvent.artifactKey === "artifact-worksheet-1" &&
          persistedEvent.artifactRole === "auxiliary" &&
          persistedEvent.artifactVariant === "answer_key" &&
          persistedEvent.assistantMessageId === "assistant-db-1" &&
          persistedEvent.conversationId === "conv-1",
        "应解析 artifact-persisted 事件",
      );
    });

    await it("应继续兼容正式 tool-result chunk，而不只识别 legacy tool-output-available", async () => {
      const response = createUiSseResponse([
        {
          type: "tool-input-available",
          toolCallId: "tool-2",
          toolName: "generate_rubric",
          input: { teacherRequest: "生成 rubric" },
        },
        {
          type: "tool-result",
          toolCallId: "tool-2",
          toolName: "generate_rubric",
          output: {
            ok: true,
            type: "rubric",
            title: "Calculus Rubric",
          },
        },
      ]);

      const events = await collectAsync(parseAgentStreamEvents(response));
      const toolCall = events.find((event) => event.type === "tool-call");
      const toolResult = events.find((event) => event.type === "tool-result");

      assert(
        toolCall?.type === "tool-call" && toolCall.toolName === "generate_rubric",
        "应解析出 tool-call",
      );
      assert(
        toolResult?.type === "tool-result" &&
          toolResult.toolName === "generate_rubric" &&
          typeof toolResult.output === "object",
        "应解析正式 tool-result chunk",
      );
    });

    await it("应解析 agent working process 事件", async () => {
      const response = createUiSseResponse([
        {
          type: "data-agent-run",
          data: {
            runId: "run-1",
            mode: "retrieval_then_document",
            status: "started",
            startedAt: 100,
          },
        },
        {
          type: "data-agent-working-note",
          data: {
            id: "note-1",
            runId: "run-1",
            section: "planning",
            status: "running",
            title: "正在准备资料与会话上下文",
            markdown: "已开始整理当前资料。",
            transient: true,
            at: 120,
          },
        },
        {
          type: "data-agent-process-summary",
          data: {
            runId: "run-1",
            title: "本轮工作摘要",
            markdown: "- 已生成文档",
            totalMs: 1400,
            at: 1500,
          },
        },
      ]);

      const events = await collectAsync(parseAgentStreamEvents(response));
      const runEvent = events.find((event) => event.type === "run");
      const workingNote = events.find((event) => event.type === "working-note");
      const summaryEvent = events.find((event) => event.type === "process-summary");

      assert(
        runEvent?.type === "run" &&
          runEvent.mode === "retrieval_then_document" &&
          runEvent.runId === "run-1",
        "应解析 agent run 事件",
      );
      assert(
        workingNote?.type === "working-note" &&
          workingNote.section === "planning" &&
          workingNote.title === "正在准备资料与会话上下文",
        "应解析 agent working note 事件",
      );
      assert(
        summaryEvent?.type === "process-summary" &&
          summaryEvent.totalMs === 1400,
        "应解析 agent process summary 事件",
      );
    });

    await it("应把字符串化的 tool-output-available 结果还原成对象", async () => {
      const response = createUiSseResponse([
        {
          type: "tool-input-available",
          toolCallId: "tool-3",
          toolName: "generate_answer_key",
          input: { teacherRequest: "生成答案" },
        },
        {
          type: "tool-output-available",
          toolCallId: "tool-3",
          output: JSON.stringify({
            ok: true,
            type: "answer_key",
            data: { sourceArtifactKind: "worksheet" },
          }),
        },
      ]);

      const events = await collectAsync(parseAgentStreamEvents(response));
      const toolResult = events.find((event) => event.type === "tool-result");

      assert(
        toolResult?.type === "tool-result" &&
          typeof toolResult.output === "object" &&
          toolResult.output !== null &&
          (toolResult.output as { type?: string }).type === "answer_key",
        "应把字符串化的 tool result 还原成对象",
      );
    });

    await it("应识别带 x-vercel 标头的 UI stream，避免把 SSE 原文当纯文本显示", async () => {
      const response = createUiSdkTextPlainResponse([
        {
          type: "data-agent-meta",
          data: {
            startedAt: 123,
            conversationId: "conv-2",
          },
        },
        {
          type: "text-start",
          id: "text-1",
        },
        {
          type: "text-delta",
          id: "text-1",
          delta: "第 1 题",
        },
      ]);

      assert(
        isStructuredAgentStreamResponse(response),
        "应把带 x-vercel-ai-ui-message-stream 的响应识别为结构化流",
      );

      const events = await collectAsync(parseAgentStreamEvents(response));
      const meta = events.find((event) => event.type === "meta");
      const textEvent = events.find((event) => event.type === "text-delta");

      assert(meta?.type === "meta" && meta.conversationId === "conv-2", "应继续解析 meta");
      assert(
        textEvent?.type === "text-delta" && textEvent.text === "第 1 题",
        "应把 UI stream 文本块还原成 text-delta，而不是保留 data: 原文",
      );
    });
  });

  await describe("parseLessonUiParts", async () => {
    await it("应透传教案 data parts", async () => {
      const response = createUiSseResponse([
        {
          type: "data-lesson-meta",
          data: {
            planId: "plan-1",
            title: "测试教案",
          },
        },
        {
          type: "data-lesson-section",
          data: {
            section: {
              id: "section-1",
              title: "导入",
            },
            progress: 50,
          },
        },
      ]);

      const parts = await collectAsync(parseLessonUiParts(response));
      const meta = parts.find((part) => part.type === "data-lesson-meta");
      const section = parts.find((part) => part.type === "data-lesson-section");

      assert(meta?.type === "data-lesson-meta", "应保留 lesson meta part");
      assert(section?.type === "data-lesson-section", "应保留 lesson section part");
    });

    await it("应支持带 x-vercel 标头的 lesson UI stream", async () => {
      const response = createUiSdkTextPlainResponse([
        {
          type: "data-lesson-meta",
          data: {
            planId: "plan-2",
            title: "正式教案",
          },
        },
      ]);

      const parts = await collectAsync(parseLessonUiParts(response));
      const meta = parts.find((part) => part.type === "data-lesson-meta");

      assert(meta?.type === "data-lesson-meta", "应在 content-type 漂移时继续解析 lesson meta");
    });
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
