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
const samplePdfPath =
  process.env.UX_UPLOAD_FILE ??
  path.join(process.cwd(), "tmp", "ux-upload-sample.pdf");
const prompt =
  process.env.UX_TEMP_POOL_PROMPT ??
  "从这份 PDF 里面的题直接组一套 worksheet，附答案，不要混入题库里的其他题。";
const injectEventName = "edutrack-agent-inject-scan-file";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const requestStarts = new WeakMap();

let processScanPayload = null;
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
    url.includes("/api/pdf/upload-scan") ||
    url.includes("/api/pdf/scan-status/") ||
    url.includes("/api/pdf/process-scan") ||
    url.includes("/api/pdf/save-scan-questions") ||
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat") ||
    url.includes("/api/pdf/download/")
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

  const phases = events
    .filter((event) => event?.type === "phase" || event?.type === "data-agent-phase")
    .map((event) =>
      event?.type === "data-agent-phase" && event.data && typeof event.data === "object"
        ? event.data
        : event,
    );
  const questionBlocks = events
    .filter(
      (event) =>
        event?.type === "question-ready" || event?.type === "data-agent-question-ready",
    )
    .map((event) => {
      if (
        event?.type === "data-agent-question-ready" &&
        event.data &&
        typeof event.data === "object"
      ) {
        return event.data.question ?? null;
      }
      return event?.question ?? null;
    })
    .filter(Boolean);
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
    phases,
    questionBlocks,
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

async function injectFileIntoInput(page, filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString("base64");
  const fileName = path.basename(filePath);

  await page.evaluate(
    ({ eventName, payload }) => {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        }),
      );
    },
    {
      eventName: injectEventName,
      payload: {
        base64,
        fileName,
        mimeType: "application/pdf",
      },
    },
  );

  return fileName;
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

    if (request.method() === "POST" && request.url().includes("/api/pdf/process-scan")) {
      response
        .json()
        .then((payload) => {
          processScanPayload = payload;
        })
        .catch(() => {
          processScanPayload = null;
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
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible", timeout: 60000 });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    await injectFileIntoInput(page, samplePdfPath);
    await page.waitForFunction(() => {
      const composer = document.querySelector('[data-testid="agent-composer"]');
      return (
        composer instanceof HTMLTextAreaElement &&
        composer.value.trim().length > 0
      );
    }, { timeout: 15000 });

    const processScanPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/pdf/process-scan") &&
        response.request().method() === "POST",
      { timeout: 180000 },
    );
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

    await page.getByTestId("agent-progress-panel").waitFor({
      state: "visible",
      timeout: 15000,
    });
    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await processScanPromise;
    const preflightResponse = await preflightPromise;
    const preflightBody = preflightPayload ?? (await preflightResponse.json().catch(() => null));
    const chatResponse = await chatPromise;
    const chatNdjson = await readNdjsonResponse(chatResponse);
    const tempPoolToolResult = chatNdjson.toolResults.find(
      (event) => event?.toolName === "prepare_temp_question_pool",
    )?.output;
    const worksheetToolResult = chatNdjson.toolResults.find(
      (event) => event?.toolName === "assemble_temp_question_pool_worksheet",
    )?.output;
    const worksheetPdfToolResult = chatNdjson.toolResults.find(
      (event) => event?.toolName === "export_worksheet_pdf",
    )?.output;
    const phaseNames = chatNdjson.phases
      .map((event) =>
        event && typeof event === "object" && typeof event.phase === "string"
          ? event.phase
          : null,
      )
      .filter(Boolean);

    await page.locator('[data-testid="agent-question-block"]').first().waitFor({
      state: "visible",
      timeout: 120000,
    });
    const artifactReference = page
      .getByTestId("agent-artifact-reference")
      .filter({ hasText: "临时组好一套试卷" })
      .first();
    await artifactReference.waitFor({
      state: "visible",
      timeout: 30000,
    });
    await artifactReference.click();

    const artifactCanvas = page.getByTestId("agent-artifact-canvas");
    await artifactCanvas.waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("agent-canvas-title").waitFor({ state: "visible", timeout: 30000 });
    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const questionBlockCount = await page.locator('[data-testid="agent-question-block"]').count();
    const canvasText =
      (await artifactCanvas.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    const linkHref =
      (await artifactCanvas.locator('a[href*="/api/pdf/download/"]').first().getAttribute("href").catch(() => null)) ??
      (typeof worksheetPdfToolResult?.downloadUrl === "string"
        ? worksheetPdfToolResult.downloadUrl
        : null) ??
      null;
    const assistantText = await page
      .locator('[data-testid="agent-assistant-message"]')
      .last()
      .textContent();

    const processScanEvent = networkEvents.find(
      (item) => item.method === "POST" && item.url.includes("/api/pdf/process-scan"),
    );
    const preflightEvent = networkEvents.find(
      (item) => item.method === "POST" && item.url.includes("/api/agent/preflight"),
    );
    const chatEvent = networkEvents.find(
      (item) => item.method === "POST" && item.url.includes("/api/agent/chat"),
    );
    const saveScanEvents = networkEvents.filter(
      (item) => item.method === "POST" && item.url.includes("/api/pdf/save-scan-questions"),
    );

    assert(preflightBody?.status === "ready", `preflight 未 ready：${JSON.stringify(preflightBody ?? {})}`);
    assert(
      preflightBody?.taskContext?.attachmentMode === "scan_pool_worksheet",
      `attachmentMode 不正确：${preflightBody?.taskContext?.attachmentMode ?? "unknown"}`,
    );
    assert(processScanPayload?.saveResult == null, "process-scan 不应自动入库");
    assert(saveScanEvents.length === 0, "临时题池组卷不应触发 /api/pdf/save-scan-questions");
    assert(
      phaseNames.includes("temp_pool_preparing") || phaseNames.includes("question_selecting"),
      `缺少临时题池准备阶段事件，当前阶段：${phaseNames.join(", ") || "none"}`,
    );
    assert(chatNdjson.questionBlocks.length > 0, "缺少 question-ready 题块事件");
    assert(questionBlockCount > 0, "页面未显示题块卡片");
    assert(typeof tempPoolToolResult?.poolId === "string", "临时题池 tool-result 缺少 poolId");
    assert(typeof linkHref === "string", "Canvas 中没有可见的 PDF 下载链接");
    assert(canvasText.includes("临时题池"), "Canvas 最终结果未显示临时题池组卷说明");
    assert(canvasText.includes("PDF 下载"), "Canvas 最终结果未显示 PDF 下载链接");

    crossChecks.push({
      apiField: "POST /api/pdf/process-scan -> saveResult",
      apiValue: processScanPayload?.saveResult ?? null,
      domValue: canvasText.slice(0, 160),
      pass: processScanPayload?.saveResult == null && canvasText.includes("临时题池"),
    });
    crossChecks.push({
      apiField: "POST /api/agent/preflight -> taskContext.attachmentMode",
      apiValue: preflightBody?.taskContext?.attachmentMode ?? null,
      domValue: `${questionBlockCount} 个题块`,
      pass:
        preflightBody?.taskContext?.attachmentMode === "scan_pool_worksheet" &&
        questionBlockCount >= chatNdjson.questionBlocks.length,
    });
    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolResult.recordId",
      apiValue: worksheetPdfToolResult?.recordId ?? null,
      domValue: linkHref,
      pass:
        typeof worksheetPdfToolResult?.recordId === "string" &&
        typeof linkHref === "string" &&
        linkHref.includes(worksheetPdfToolResult.recordId),
    });
    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolResult.selectedCount",
      apiValue: worksheetToolResult?.selectedCount ?? null,
      domValue: canvasText,
      pass:
        typeof worksheetToolResult?.selectedCount === "number" &&
        canvasText.includes(`题目数：${worksheetToolResult.selectedCount}`),
    });

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      `  - POST /api/pdf/process-scan: ${processScanEvent ? `${(processScanEvent.durationMs / 1000).toFixed(2)}s` : "未捕获"}`,
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
    processScanPayload,
    preflightPayload,
  });
  await fs.writeFile(path.join(artifactDir, "report.md"), failReport.join("\n"), "utf8");
  console.error(error);
  process.exit(1);
});
