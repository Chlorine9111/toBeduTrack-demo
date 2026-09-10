import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const agentUrl = `${baseUrl}/main/agent`;
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const dualArtifactPrompt =
  process.env.UX_DUAL_ARTIFACT_PROMPT ??
  "请在这一次回复里同时生成两个独立文档，并都放到左侧引用块/右侧 Canvas：1）一份 8 年级英语阅读 worksheet；2）基于同一任务的一份 rubric。不要只生成一个，也不要让我再追问。";

const consoleErrors = [];
const pageErrors = [];
const networkEvents = [];
const requestStarts = new WeakMap();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  [
    "apikey",
    "access_token",
    "refresh_token",
    "token",
    "token_hash",
    "code",
    "conversationId",
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildMockAgentStream() {
  const startedAt = Date.now();
  const worksheetToolCallId = "tool-worksheet-mock";
  const rubricToolCallId = "tool-rubric-mock";
  const worksheetRaw =
    "# Worksheet\\n\\n## Reading Goal\\n- Identify the central conflict in the passage.\\n\\n## Guided Notes\\n1. Circle two details that reveal the narrator's mood.\\n2. Write one inference about the main character.\\n\\n## Exit Ticket\\nExplain the author's message in two sentences.";
  const rubricRaw =
    "# Rubric\\n\\n| 维度 | 4 | 3 | 2 | 1 |\\n| --- | --- | --- | --- | --- |\\n| 内容理解 | 观点准确且完整 | 观点基本准确 | 观点部分偏离文本 | 观点明显失焦 |\\n| 证据引用 | 引用具体且解释充分 | 有引用且解释基本充分 | 引用较弱 | 缺少有效证据 |";

  return [
    {
      waitMs: 0,
      event: {
        type: "tool-call",
        toolCallId: worksheetToolCallId,
        toolName: "generate_document_worksheet",
        input: { prompt: "worksheet" },
        at: startedAt,
      },
    },
    {
      waitMs: 120,
      event: {
        type: "artifact-chunk",
        toolCallId: worksheetToolCallId,
        artifactKind: "worksheet",
        chunkType: "meta",
        data: {
          title: "Worksheet（生成中）",
          summary: "正在生成课堂阅读 worksheet。",
          previewText: "Worksheet 已开始生成。",
        },
        at: startedAt + 120,
      },
    },
    {
      waitMs: 120,
      event: {
        type: "tool-call",
        toolCallId: rubricToolCallId,
        toolName: "generate_rubric",
        input: { prompt: "rubric" },
        at: startedAt + 240,
      },
    },
    {
      waitMs: 120,
      event: {
        type: "artifact-chunk",
        toolCallId: rubricToolCallId,
        artifactKind: "rubric",
        chunkType: "meta",
        data: {
          title: "Rubric（生成中）",
          summary: "正在生成配套评分量表。",
          previewText: "Rubric 已开始生成。",
        },
        at: startedAt + 360,
      },
    },
    {
      waitMs: 100,
      event: {
        type: "artifact-chunk",
        toolCallId: worksheetToolCallId,
        artifactKind: "worksheet",
        chunkType: "text-delta",
        data: {
          delta:
            "# Worksheet\\n\\n## Reading Goal\\n- Identify the central conflict in the passage.\\n\\n",
        },
        at: startedAt + 460,
      },
    },
    {
      waitMs: 100,
      event: {
        type: "artifact-chunk",
        toolCallId: rubricToolCallId,
        artifactKind: "rubric",
        chunkType: "text-delta",
        data: {
          delta:
            "# Rubric\\n\\n| 维度 | 4 | 3 | 2 | 1 |\\n| --- | --- | --- | --- | --- |\\n",
        },
        at: startedAt + 560,
      },
    },
    {
      waitMs: 100,
      event: {
        type: "artifact-chunk",
        toolCallId: worksheetToolCallId,
        artifactKind: "worksheet",
        chunkType: "text-delta",
        data: {
          delta:
            "## Guided Notes\\n1. Circle two details that reveal the narrator's mood.\\n2. Write one inference about the main character.\\n\\n",
        },
        at: startedAt + 660,
      },
    },
    {
      waitMs: 100,
      event: {
        type: "artifact-chunk",
        toolCallId: rubricToolCallId,
        artifactKind: "rubric",
        chunkType: "text-delta",
        data: {
          delta:
            "| 内容理解 | 观点准确且完整 | 观点基本准确 | 观点部分偏离文本 | 观点明显失焦 |\\n| 证据引用 | 引用具体且解释充分 | 有引用且解释基本充分 | 引用较弱 | 缺少有效证据 |\\n",
        },
        at: startedAt + 760,
      },
    },
    {
      waitMs: 100,
      event: {
        type: "artifact-chunk",
        toolCallId: worksheetToolCallId,
        artifactKind: "worksheet",
        chunkType: "complete",
        data: {
          title: "Reading Response Worksheet",
          summary: "已生成课堂阅读 worksheet，包含 guided notes 与 exit ticket。",
          previewText: "Worksheet 已完成。",
          rawContent: worksheetRaw,
        },
        at: startedAt + 860,
      },
    },
    {
      waitMs: 120,
      event: {
        type: "tool-result",
        toolCallId: worksheetToolCallId,
        toolName: "generate_document_worksheet",
        output: {
          artifactKind: "worksheet",
          title: "Reading Response Worksheet",
        },
        at: startedAt + 980,
        durationMs: 860,
      },
    },
    {
      waitMs: 120,
      event: {
        type: "artifact-chunk",
        toolCallId: rubricToolCallId,
        artifactKind: "rubric",
        chunkType: "complete",
        data: {
          title: "Reading Response Rubric",
          summary: "已生成配套 rubric，包含内容理解与证据引用维度。",
          previewText: "Rubric 已完成。",
          rawContent: rubricRaw,
        },
        at: startedAt + 1100,
      },
    },
    {
      waitMs: 120,
      event: {
        type: "tool-result",
        toolCallId: rubricToolCallId,
        toolName: "generate_rubric",
        output: {
          artifactKind: "rubric",
          title: "Reading Response Rubric",
        },
        at: startedAt + 1220,
        durationMs: 980,
      },
    },
    {
      waitMs: 80,
      event: {
        type: "text-delta",
        text: "已同时生成 worksheet 和 rubric，可点击左侧引用块在右侧 Canvas 查看。",
      },
    },
    {
      waitMs: 80,
      event: {
        type: "finish",
        totalMs: 1380,
        finishReason: "stop",
      },
    },
  ];
}

async function ensureLoggedIn(page) {
  await page.goto(agentUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (new URL(page.url()).pathname !== "/auth/login") {
    return;
  }

  await page
    .locator('form[data-auth-ready="true"]')
    .waitFor({ state: "visible", timeout: 60000 });
  await page.locator("#login-email").fill(loginEmail);
  await page.locator("#login-password").fill(loginPassword);

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/main/"), {
      timeout: 120000,
    }),
    page.getByRole("button", { name: /^登录$/ }).click(),
  ]);

  if (new URL(page.url()).pathname !== "/main/agent") {
    await page.goto(agentUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  }
}

async function collectReferenceCards(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="agent-artifact-reference"]')).map(
      (card, index) => {
        const titleNode = card.querySelector("p.mt-2.truncate");
        const className = typeof card.className === "string" ? card.className : "";
        return {
          index,
          title: `${titleNode?.textContent ?? card.textContent ?? ""}`
            .replace(/\s+/g, " ")
            .trim(),
          active:
            className.includes("border-accent") ||
            className.includes("bg-accent/10"),
        };
      },
    ),
  );
}

async function sampleReferenceCards(page, initialCount) {
  const samples = [];
  const startedAt = Date.now();
  const requiredCount = initialCount + 2;

  while (Date.now() - startedAt < 120000) {
    const sendVisible = await page
      .getByTestId("agent-send-button")
      .isVisible()
      .catch(() => false);
    const cards = await collectReferenceCards(page);
    samples.push({
      atMs: Date.now() - startedAt,
      sendVisible,
      cards,
      activeIndex: cards.find((card) => card.active)?.index ?? null,
    });

    if (sendVisible && samples.length > 8) {
      break;
    }
    if (cards.length >= requiredCount && !sendVisible && samples.length > 30) {
      // 第二张卡已经稳定出现一段时间，继续等流结束即可
    }
    await page.waitForTimeout(200);
  }

  return samples;
}

function summarizeSamples(samples, initialCount) {
  const requiredCount = initialCount + 2;
  const readyIndex = samples.findIndex((sample) => sample.cards.length >= requiredCount);
  const afterReadySamples =
    readyIndex >= 0 ? samples.slice(readyIndex) : [];
  const activeIndexes = afterReadySamples
    .map((sample) => sample.activeIndex)
    .filter((index) => Number.isInteger(index));
  const activeIndexTransitions = activeIndexes.reduce((count, index, position) => {
    if (position === 0) return count;
    return index !== activeIndexes[position - 1] ? count + 1 : count;
  }, 0);
  const droppedBelowRequiredCount =
    readyIndex >= 0 &&
    afterReadySamples.some(
      (sample) => sample.cards.length < requiredCount && !sample.sendVisible,
    );

  return {
    requiredCount,
    sawTwoArtifacts: readyIndex >= 0,
    activeIndexes,
    activeIndexTransitions,
    droppedBelowRequiredCount,
  };
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);

  const mockAgentStream = buildMockAgentStream();
  await page.addInitScript(({ mockEvents }) => {
    const originalFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    window.__dualArtifactMockPayloads = [];
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method ??
        (input instanceof Request ? input.method : "GET");
      if (
        url.includes("/api/agent/chat") &&
        `${method}`.toUpperCase() === "POST"
      ) {
        window.__dualArtifactMockPayloads.push({
          url,
          method: `${method}`.toUpperCase(),
        });
        return new Response(
          new ReadableStream({
            start(controller) {
              let index = 0;
              const pushNext = () => {
                if (index >= mockEvents.length) {
                  controller.close();
                  return;
                }
                const current = mockEvents[index];
                controller.enqueue(
                  encoder.encode(`${JSON.stringify(current.event)}\n`),
                );
                index += 1;
                window.setTimeout(pushNext, current.waitMs);
              };
              pushNext();
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/x-ndjson; charset=utf-8",
            },
          },
        );
      }
      return originalFetch(input, init);
    };
  }, { mockEvents: mockAgentStream });

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
  });

  page.on("response", (response) => {
    const request = response.request();
    if (!request.url().includes("/api/agent/chat")) {
      return;
    }
    const startedAt = requestStarts.get(request) ?? Date.now();
    networkEvents.push({
      method: request.method(),
      url: sanitizeUrl(request.url()),
      status: response.status(),
      durationMs: Date.now() - startedAt,
    });
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrors.push({
      text: message.text(),
      location: message.location(),
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack ?? null,
    });
  });

  try {
    await ensureLoggedIn(page);
    await page.getByTestId("agent-composer").waitFor({
      state: "visible",
      timeout: 60000,
    });

    const initialCards = await collectReferenceCards(page);
    const initialCount = initialCards.length;
    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const composer = page.getByTestId("agent-composer").first();
    const sendButton = page.getByTestId("agent-send-button").first();
    await composer.fill(dualArtifactPrompt);
    await page.waitForFunction(
      () => {
        const textarea = document.querySelector(
          '[data-testid="agent-composer"]',
        );
        const button = document.querySelector(
          '[data-testid="agent-send-button"]',
        );
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        if (!(button instanceof HTMLButtonElement)) return false;
        const disabled =
          button.disabled ||
          button.getAttribute("aria-disabled") === "true" ||
          button.getAttribute("data-disabled") === "true";
        return textarea.value.trim().length > 0 && !disabled;
      },
      { timeout: 15000 },
    );
    await sendButton.click();

    const samples = await sampleReferenceCards(page, initialCount);
    const toolCalls = mockAgentStream
      .map((item) => item.event)
      .filter((event) => event?.type === "tool-call")
      .map((event) => event.toolName)
      .filter((toolName) => typeof toolName === "string");

    const sampleSummary = summarizeSamples(samples, initialCount);
    const finalCards = samples.at(-1)?.cards ?? [];

    assert(
      sampleSummary.sawTwoArtifacts,
      `左侧未出现两个独立引用块：${finalCards.map((card) => card.title).join(" | ") || "none"}`,
    );
    assert(
      toolCalls.some((toolName) => toolName.includes("worksheet")) &&
        toolCalls.some((toolName) => toolName.includes("rubric")),
      `本轮未同时命中 worksheet + rubric 工具：${toolCalls.join(", ") || "none"}`,
    );
    assert(
      !sampleSummary.droppedBelowRequiredCount,
      `第二张引用块出现后又回落，疑似发生替换闪烁：required=${sampleSummary.requiredCount}`,
    );
    assert(
      sampleSummary.activeIndexTransitions <= 1,
      `第二张引用块出现后 active 卡片来回切换过多：${sampleSummary.activeIndexTransitions}`,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const summary = {
      initialCount,
      finalCardTitles: finalCards.map((card) => card.title),
      toolCalls,
      activeIndexTransitions: sampleSummary.activeIndexTransitions,
      activeIndexes: sampleSummary.activeIndexes,
      droppedBelowRequiredCount: sampleSummary.droppedBelowRequiredCount,
      consoleErrors,
      pageErrors,
      networkEvents,
    };

    await writeJson(path.join(artifactDir, "summary.json"), summary);
    await writeJson(path.join(artifactDir, "samples.json"), samples);
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      [
        "## UX 验证报告",
        "",
        "- 验证级别: L1",
        "- 场景: `/main/agent` 单轮同时生成 worksheet + rubric，左侧引用块不得互相顶替闪烁",
        `- activeIndexTransitions: ${sampleSummary.activeIndexTransitions}`,
        `- droppedBelowRequiredCount: ${sampleSummary.droppedBelowRequiredCount}`,
        `- toolCalls: ${toolCalls.join(", ") || "none"}`,
        `- 产物目录: ${artifactDir}`,
      ].join("\n"),
      "utf8",
    );

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

run().catch(async (error) => {
  await fs.mkdir(artifactDir, { recursive: true }).catch(() => undefined);
  await writeJson(path.join(artifactDir, "errors.json"), {
    message: error instanceof Error ? error.message : String(error),
    consoleErrors,
    pageErrors,
    networkEvents,
  }).catch(() => undefined);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
