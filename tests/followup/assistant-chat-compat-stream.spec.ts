import { parseSSEJson } from "../../lib/api/ndjson";
import { createLegacyAssistantSseStream } from "../../lib/assistant/chat-compat-stream";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
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
    failed += 1;
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

async function collectSseEvents(stream: ReadableStream<Uint8Array>) {
  const response = new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
  const events: Array<Record<string, unknown>> = [];
  for await (const event of parseSSEJson<Record<string, unknown>>(response)) {
    events.push(event);
  }
  return events;
}

async function main() {
  await describe("assistant chat compat stream", async () => {
    await it("应把 agent decision 和文本映射为旧 SSE 协议", async () => {
      const upstream = createUiSseResponse([
        {
          type: "data-agent-meta",
          data: {
            conversationId: "conv-agent-1",
          },
        },
        {
          type: "data-agent-decision",
          data: {
            workflow: "worksheet",
            retrievalSources: "knowledge",
          },
        },
        {
          type: "text-delta",
          id: "text-1",
          delta: "第一段",
        },
        {
          type: "text-delta",
          id: "text-1",
          delta: "第二段",
        },
        {
          type: "data-agent-finish",
          data: {
            totalMs: 1200,
          },
        },
      ]);

      const events = await collectSseEvents(
        createLegacyAssistantSseStream({
          upstreamResponse: upstream,
        }),
      );
      const meta = events.find((event) => event.type === "meta");
      const deltas = events.filter((event) => event.type === "delta");
      const done = events.find((event) => event.type === "done");

      assert(meta?.conversationId === "conv-agent-1", "meta 应包含 conversationId");
      assert(meta?.intent === "generate_exercises", "worksheet 应映射为 generate_exercises");
      assert(
        Array.isArray(meta?.sources) &&
          meta.sources.some(
            (source) =>
              source &&
              typeof source === "object" &&
              !Array.isArray(source) &&
              (source as Record<string, unknown>).type === "knowledge",
          ),
        "knowledge 检索应映射为 sources",
      );
      assert(deltas.length === 2, "应输出两段 delta");
      assert(
        deltas.map((item) => item.content).join("") === "第一段第二段",
        "delta 内容应与上游文本一致",
      );
      assert(done?.type === "done", "应输出 done 事件");
    });

    await it("上游未产出文本时应输出兼容兜底文本", async () => {
      const upstream = createUiSseResponse([
        {
          type: "data-agent-meta",
          data: {
            conversationId: "conv-agent-2",
          },
        },
        {
          type: "data-agent-finish",
          data: {
            totalMs: 30,
          },
        },
      ]);

      const events = await collectSseEvents(
        createLegacyAssistantSseStream({
          upstreamResponse: upstream,
        }),
      );
      const deltas = events.filter((event) => event.type === "delta");
      assert(deltas.length === 1, "无文本时应输出一条兜底 delta");
      assert(
        deltas[0]?.content === "我已完成分析，但没有生成有效文本，请重试。",
        "兜底 delta 文案应匹配",
      );
    });

    await it("上游异常时应返回旧协议错误兜底，并使用 fallback conversationId", async () => {
      const upstream = createUiSseResponse([
        {
          type: "error",
          errorText: "upstream error",
        },
      ]);

      const events = await collectSseEvents(
        createLegacyAssistantSseStream({
          upstreamResponse: upstream,
          fallbackConversationId: "conv-fallback",
        }),
      );
      const meta = events.find((event) => event.type === "meta");
      const delta = events.find((event) => event.type === "delta");

      assert(meta?.conversationId === "conv-fallback", "应使用 fallback conversationId");
      assert(
        delta?.content === "对话生成失败，请稍后重试。",
        "异常时应输出兼容错误文案",
      );
    });
  });

  if (failed > 0) {
    console.error(`\n${failed} assertions failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} assertions passed.`);
}

void main();

