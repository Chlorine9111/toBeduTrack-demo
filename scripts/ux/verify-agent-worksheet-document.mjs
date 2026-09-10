import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const prompt =
  process.env.UX_WORKSHEET_DOCUMENT_PROMPT ??
  "请做一份给学生上课直接使用的 worksheet，主题是 AP Biology Unit 2 的 membrane transport。形式是 guided notes + 一个课堂活动单，不要题库组卷，不要整套习题，只要课堂讲义式材料。";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const requestStarts = new WeakMap();

let preflightPayload = null;

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

function isTrackedApi(url) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat")
  );
}

function isStatic404(response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  if (resourceType === "stylesheet" || resourceType === "script" || resourceType === "font") {
    return true;
  }
  return /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url());
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeText(value) {
  return `${value ?? ""}`
    .replace(/\s+/g, " ")
    .replace(/[—–-]/g, "-")
    .trim()
    .toLowerCase();
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readNdjsonResponse(response) {
  const raw = await response.text().catch(() => "");
  const events = raw
    .split("\n")
    .map((line) => line.trim())
    .map((line) => (line.startsWith("data:") ? line.slice(5).trim() : line))
    .filter(Boolean)
    .filter((line) => line !== "[DONE]")
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const toolNameByCallId = new Map();
  for (const event of events) {
    if (
      (event?.type === "tool-call" || event?.type === "tool-input-available") &&
      typeof event.toolCallId === "string" &&
      typeof event.toolName === "string"
    ) {
      toolNameByCallId.set(event.toolCallId, event.toolName);
    }
  }

  const toolResults = events
    .filter(
      (event) =>
        event?.type === "tool-result" || event?.type === "tool-output-available",
    )
    .map((event) => ({
      ...event,
      toolName: event.toolName ?? toolNameByCallId.get(event.toolCallId),
      output: event.output,
    }));

  return {
    raw,
    events,
    text: events
      .filter(
        (event) =>
          event?.type === "text-delta" &&
          (typeof event.text === "string" || typeof event.delta === "string"),
      )
      .map((event) => event.text ?? event.delta)
      .join(""),
    toolCalls: events
      .filter(
        (event) =>
          (event?.type === "tool-call" ||
            event?.type === "tool-input-available" ||
            event?.type === "tool-output-available") &&
          typeof (event.toolName ?? toolNameByCallId.get(event.toolCallId)) === "string",
      )
      .map((event) => event.toolName ?? toolNameByCallId.get(event.toolCallId)),
    toolResults,
  };
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
  });

  page.on("response", (response) => {
    const request = response.request();
    if (isTrackedApi(request.url())) {
      const startedAt = requestStarts.get(request) ?? Date.now();
      networkEvents.push({
        method: request.method(),
        url: sanitizeUrl(request.url()),
        status: response.status(),
        durationMs: Date.now() - startedAt,
      });
    }

    if (isStatic404(response)) {
      static404s.push({
        url: sanitizeUrl(response.url()),
        status: response.status(),
        resourceType: request.resourceType(),
      });
    }

    if (request.method() === "POST" && request.url().includes("/api/agent/preflight")) {
      response
        .json()
        .then((payload) => {
          preflightPayload = payload;
        })
        .catch(() => {
          preflightPayload = null;
        });
    }
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrors.push({
      type: message.type(),
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
    await page.goto(`${baseUrl}/main/agent`, { waitUntil: "domcontentloaded" });
    if (new URL(page.url()).pathname === "/auth/login") {
      await page.locator('form[data-auth-ready="true"]').waitFor({
        state: "visible",
        timeout: 60000,
      });
      await page.locator("#login-email").fill(loginEmail);
      await page.locator("#login-password").fill(loginPassword);

      await Promise.all([
        page.waitForURL((url) => url.pathname.startsWith("/main/"), {
          timeout: 120000,
        }),
        page.getByRole("button", { name: /^登录$/ }).click(),
      ]);

      if (new URL(page.url()).pathname !== "/main/agent") {
        await page.goto(`${baseUrl}/main/agent`, { waitUntil: "domcontentloaded" });
      }
    }

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const preflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 180000 },
    );
    const chatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 180000 },
    );

    await composer.fill(prompt);
    await composer.press("Enter");

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const preflightResponse = await preflightPromise;
    const preflightBody = preflightPayload ?? (await preflightResponse.json().catch(() => null));
    const chatResponse = await chatPromise;
    const chatNdjson = await readNdjsonResponse(chatResponse);
    const worksheetToolResult = chatNdjson.toolResults.find(
      (item) => item?.toolName === "generate_document_worksheet",
    )?.output;

    const artifactReference = page.getByTestId("agent-artifact-reference").first();
    await artifactReference.waitFor({
      state: "visible",
      timeout: 30000,
    });
    await artifactReference.click();

    const artifactCanvas = page.getByTestId("agent-artifact-canvas");
    await artifactCanvas.waitFor({ state: "visible", timeout: 30000 });
    const canvasTitle = page.getByTestId("agent-canvas-title");
    await canvasTitle.waitFor({ state: "visible", timeout: 30000 });
    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const canvasTitleText = (await canvasTitle.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    const canvasText =
      (await artifactCanvas.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    const assistantText = await page
      .locator('[data-testid="agent-assistant-message"]')
      .last()
      .textContent();

    const preflightEvent = networkEvents.find(
      (item) => item.method === "POST" && item.url.includes("/api/agent/preflight"),
    );
    const chatEvent = networkEvents.find(
      (item) => item.method === "POST" && item.url.includes("/api/agent/chat"),
    );

    assert(preflightBody?.status === "ready", `preflight 未 ready：${JSON.stringify(preflightBody ?? {})}`);
    assert(
      chatNdjson.toolCalls.includes("generate_document_worksheet"),
      `未命中文档型 worksheet workflow：${chatNdjson.toolCalls.join(", ") || "none"}`,
    );
    assert(
      !chatNdjson.toolCalls.includes("assemble_question_bank_worksheet"),
      "不应命中题库组卷 workflow",
    );
    assert(
      !chatNdjson.toolCalls.includes("generate_ap_exercises_pipeline"),
      "不应命中生成式习题 workflow",
    );
    assert(
      typeof worksheetToolResult?.sourceMode === "string" &&
        worksheetToolResult.sourceMode === "document_handout",
      `worksheet tool-result 不是 document_handout：${JSON.stringify(worksheetToolResult ?? {})}`,
    );
    assert(canvasText.length >= 120, "Canvas 文本过短，疑似未生成有效 worksheet");
    assert(
      /(学习目标|课堂活动|引导笔记|guided notes|活动步骤|快速检查|exit ticket)/i.test(canvasText),
      "Canvas 未显示文档型 worksheet 的结构内容",
    );

    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolResult.mode",
      apiValue: worksheetToolResult?.mode ?? null,
      domValue: canvasText,
      pass:
        worksheetToolResult?.mode === "guided_notes" &&
        /guided notes|learning objective|learning goals|课堂活动|activity|exit ticket/i.test(
          canvasText,
        ),
    });

    assert(crossChecks.every((item) => item.pass), "数据流交叉验证未全部通过");

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      `  - POST /api/agent/preflight: ${preflightEvent ? `${(preflightEvent.durationMs / 1000).toFixed(2)}s` : "未捕获"}`,
      `  - POST /api/agent/chat: ${chatEvent ? `${(chatEvent.durationMs / 1000).toFixed(2)}s` : "未捕获"}`,
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (item) =>
          `  - API 字段 ${item.apiField} -> DOM 文本 ${item.domValue}: ${item.pass ? "PASS" : "FAIL"}`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  const failReport = [
    "## UX 验证报告",
    "",
    "- 验证级别: L1",
    "- 最终结论: FAIL",
    `- 失败原因: ${error instanceof Error ? error.message : String(error)}`,
    "- 关键接口耗时:",
    ...networkEvents
      .filter((item) => item.method === "POST")
      .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(item.durationMs / 1000).toFixed(2)}s`),
    "- 错误统计:",
    `  - 静态资源 404: ${static404s.length}`,
    `  - console error: ${consoleErrors.length}`,
    `  - pageerror: ${pageErrors.length}`,
    "- 数据流交叉验证:",
    ...crossChecks.map(
      (item) =>
        `  - API 字段 ${item.apiField} -> DOM 文本 ${item.domValue}: ${item.pass ? "PASS" : "FAIL"}`,
    ),
    "- 截图:",
    "  - verify-1-loaded.png",
    "  - verify-2-after-action.png",
    "  - verify-3-result.png",
    "- 产物目录:",
    `  - ${artifactDir}`,
    "",
  ];

  await fs.mkdir(artifactDir, { recursive: true });
  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), {
    static404s,
    consoleErrors,
    pageErrors,
  });
  await fs.writeFile(path.join(artifactDir, "report.md"), failReport.join("\n"), "utf8");
  console.error(error);
  process.exit(1);
});
