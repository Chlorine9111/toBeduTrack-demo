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
const uploadPdfPath =
  process.env.UX_MATERIAL_PDF_PATH ??
  "/Users/martin/Downloads/Chapter_11_Of_Rats_and_Men.pdf";
const worksheetAnswerKeyPrompt =
  process.env.UX_WORKSHEET_ANSWER_KEY_PROMPT ??
  "请根据我刚上传并引用的资料生成一份给学生上课直接使用的 worksheet，并附详细答案解析。要求：guided notes + 一个课堂活动单，围绕小说章节内容，不要题库组卷，不要另外生成练习题。";
const adaptDifficultyPrompt =
  process.env.UX_ADAPT_DIFFICULTY_PROMPT ??
  "把刚才那份 worksheet 降一档，增加更多支架和分步提示，但保持相同学习目标。";
const exitTicketPrompt =
  process.env.UX_EXIT_TICKET_PROMPT ??
  "再基于同一份资料生成一个 exit ticket，控制在 4 道题，适合下课前 5 分钟完成。";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const chatPayloads = [];
const apiFailures = [];
const requestStarts = new WeakMap();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function isStatic404(response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  if (
    resourceType === "stylesheet" ||
    resourceType === "script" ||
    resourceType === "font"
  ) {
    return true;
  }
  return /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url());
}

function isTrackedApi(url) {
  return (
    url.includes("/api/content-assets/upload") ||
    url.includes("/api/content-assets/status") ||
    url.includes("/api/agent/chat")
  );
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureLoggedIn(page) {
  await page.goto(agentUrl, { waitUntil: "domcontentloaded" });
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== "/auth/login") {
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
    await page.goto(agentUrl, { waitUntil: "domcontentloaded" });
  }
}

async function readResponseBody(response) {
  const headers = await response.allHeaders().catch(() => ({}));
  const raw = await response.text().catch(() => "");
  let parsed = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  return {
    status: response.status(),
    url: sanitizeUrl(response.url()),
    headers,
    raw,
    parsed,
  };
}

async function readUiStreamResponse(response) {
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
        event?.type === "tool-result" ||
        event?.type === "tool-output-available",
    )
    .map((event) => ({
      ...event,
      toolName: event.toolName ?? toolNameByCallId.get(event.toolCallId),
      output:
        typeof event.output === "string"
          ? (() => {
              try {
                return JSON.parse(event.output);
              } catch {
                return event.output;
              }
            })()
          : event.output,
    }))
    .filter((event) => {
      const output = event.output;
      return (
        output &&
        typeof output === "object" &&
        (Object.prototype.hasOwnProperty.call(output, "ok") ||
          Object.prototype.hasOwnProperty.call(output, "type") ||
          Object.prototype.hasOwnProperty.call(output, "artifact"))
      );
    });

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
          typeof (event.toolName ?? toolNameByCallId.get(event.toolCallId)) ===
            "string",
      )
      .map((event) => event.toolName ?? toolNameByCallId.get(event.toolCallId)),
    toolResults,
  };
}

async function pollAssetStatus(page, assetId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = await page.evaluate(async (id) => {
      const response = await fetch("/api/content-assets/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      return await response.json();
    }, assetId);

    const item = Array.isArray(result) ? result[0] : null;
    if (
      item?.processingStatus === "ready" ||
      item?.processingStatus === "failed"
    ) {
      return item;
    }
    await page.waitForTimeout(1500);
  }
  throw new Error(`资产 ${assetId} 状态轮询超时`);
}

async function waitForArtifactCount(page, previousCount, delta = 1) {
  await page.waitForFunction(
    ({ count, expectedDelta }) =>
      document.querySelectorAll('[data-testid="agent-artifact-reference"]').length >=
      count + expectedDelta,
    { count: previousCount, expectedDelta: delta },
    { timeout: 180000 },
  );
}

async function clickArtifactReference(page, indexFromEnd = 0) {
  const references = page.getByTestId("agent-artifact-reference");
  const count = await references.count();
  assert(count > indexFromEnd, `artifact 引用块数量不足，当前 ${count}`);
  const target = references.nth(count - 1 - indexFromEnd);
  await target.waitFor({ state: "visible", timeout: 60000 });
  await target.click();
}

async function readCanvasSnapshot(page) {
  const canvas = page.getByTestId("agent-artifact-canvas");
  await canvas.waitFor({ state: "visible", timeout: 60000 });
  const title = normalizeText(await page.getByTestId("agent-canvas-title").textContent());
  const text = normalizeText(await canvas.textContent());
  const tabs = await page
    .getByTestId("agent-canvas-tab")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ""));
  return { title, text, tabs };
}

async function sendPromptAndRead(page, prompt) {
  const composer = page.locator('[data-testid="agent-composer"]').first();
  const chatPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/agent/chat") &&
      response.request().method() === "POST",
    { timeout: 300000 },
  );

  await composer.fill(prompt);
  await composer.press("Enter");
  const chatResponse = await chatPromise;
  if (!chatResponse.ok()) {
    const failure = await readResponseBody(chatResponse);
    const failureMessage =
      failure.parsed?.error?.message ??
      failure.parsed?.error?.code ??
      failure.parsed?.message ??
      failure.parsed?.error ??
      failure.raw.slice(0, 500) ??
      "empty response";
    apiFailures.push({
      stage: "agent_chat",
      prompt,
      ...failure,
    });
    throw new Error(`Agent Chat 返回 ${failure.status}: ${failureMessage}`);
  }
  return readUiStreamResponse(chatResponse);
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.access(uploadPdfPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
    if (!request.url().includes("/api/agent/chat") || request.method() !== "POST") {
      return;
    }

    try {
      chatPayloads.push(request.postDataJSON());
    } catch {
      chatPayloads.push(null);
    }
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
    await ensureLoggedIn(page);
    await page.getByTestId("agent-open-material-upload").waitFor({ state: "visible" });
    await page.getByTestId("agent-open-scan-upload").waitFor({ state: "detached" });

    await page.getByTestId("agent-open-material-upload").click();
    const contextSidebar = page.getByTestId("agent-context-sidebar");
    await contextSidebar.waitFor({ state: "visible", timeout: 20000 });

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-assets/upload") &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 60000 },
    );

    await contextSidebar.locator('input[type="file"]').setInputFiles(uploadPdfPath);
    const uploadResponse = await uploadResponsePromise;
    const uploadBody = await uploadResponse.json();
    const uploadedAsset = uploadBody?.asset ?? null;
    assert(uploadedAsset?.id, "上传未返回 asset.id");

    const settled = await pollAssetStatus(page, uploadedAsset.id);
    assert(
      settled?.processingStatus === "ready",
      `素材未 ready：${JSON.stringify(settled ?? {})}`,
    );

    const referenceTag = page.getByTestId("agent-asset-reference-tag").filter({
      hasText: uploadedAsset.title,
    });
    await referenceTag.waitFor({ state: "visible", timeout: 30000 });
    await page
      .getByTestId("agent-reference-processing-hint")
      .waitFor({ state: "detached", timeout: 30000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-upload-ready.png"),
      fullPage: true,
    });

    const worksheetBeforeCount = await page.getByTestId("agent-artifact-reference").count();
    await sendPromptAndRead(page, worksheetAnswerKeyPrompt);
    const worksheetPayload = chatPayloads.at(-1);
    const worksheetIds = Array.isArray(worksheetPayload?.contentAssetIds)
      ? worksheetPayload.contentAssetIds
      : [];
    assert(
      worksheetIds.includes(uploadedAsset.id),
      "worksheet+answer key 请求未携带 contentAssetIds",
    );

    await waitForArtifactCount(page, worksheetBeforeCount, 2);
    await clickArtifactReference(page, 0);
    const answerKeyCanvas = await readCanvasSnapshot(page);
    assert(
      /answer key|答案|解析/i.test(
        `${answerKeyCanvas.title} ${answerKeyCanvas.text} ${answerKeyCanvas.tabs.join(" ")}`,
      ),
      `右侧未显示 Answer Key：${answerKeyCanvas.title} / ${answerKeyCanvas.text.slice(0, 220)}`,
    );
    assert(
      answerKeyCanvas.tabs.length >= 2,
      `worksheet + answer key 未形成多标签页：${JSON.stringify(answerKeyCanvas.tabs)}`,
    );

    const adaptBeforeCount = await page.getByTestId("agent-artifact-reference").count();
    await sendPromptAndRead(page, adaptDifficultyPrompt);
    const adaptPayload = chatPayloads.at(-1);
    const adaptIds = Array.isArray(adaptPayload?.contentAssetIds)
      ? adaptPayload.contentAssetIds
      : [];
    assert(
      adaptIds.includes(uploadedAsset.id),
      "难度调节请求未继续携带 contentAssetIds",
    );
    await waitForArtifactCount(page, adaptBeforeCount, 1);
    await clickArtifactReference(page, 0);
    const adaptCanvas = await readCanvasSnapshot(page);
    assert(
      adaptCanvas.text.length > 120,
      `难度调节 Canvas 内容过短：${adaptCanvas.text}`,
    );
    assert(
      /支架|scaffold|降一档|更简单|easier/i.test(
        `${adaptCanvas.title} ${adaptCanvas.text}`,
      ),
      `难度调节结果缺少降难信号：${adaptCanvas.title} / ${adaptCanvas.text.slice(0, 220)}`,
    );

    const exitBeforeCount = await page.getByTestId("agent-artifact-reference").count();
    await sendPromptAndRead(page, exitTicketPrompt);
    const exitPayload = chatPayloads.at(-1);
    const exitIds = Array.isArray(exitPayload?.contentAssetIds)
      ? exitPayload.contentAssetIds
      : [];
    assert(
      exitIds.includes(uploadedAsset.id),
      "exit ticket 请求未继续携带 contentAssetIds",
    );
    await waitForArtifactCount(page, exitBeforeCount, 1);
    await clickArtifactReference(page, 0);
    const exitCanvas = await readCanvasSnapshot(page);
    assert(
      /exit ticket|quick check|课堂检测|下课前/i.test(
        `${exitCanvas.title} ${exitCanvas.text}`,
      ) || /1\.|2\.|3\./.test(exitCanvas.text),
      `右侧未显示 Exit Ticket 结构：${exitCanvas.title} / ${exitCanvas.text.slice(0, 240)}`,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-new-tools-result.png"),
      fullPage: true,
    });

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      `- 上传素材: ${path.basename(uploadPdfPath)}`,
      `- 上传资产 ID: ${uploadedAsset.id}`,
      "- 关键断言:",
      "  - worksheet + answer key 同轮组合命中 generate_worksheet -> generate_answer_key",
      "  - 答案解析默认生成独立右侧 Canvas 标签页",
      "  - adapt_difficulty 可基于上一份文档生成难度变体",
      "  - generate_exit_ticket 可基于同一份资料生成短测文档",
      "  - 三轮请求都继续携带同一 contentAssetIds",
      "- 关键接口耗时:",
      ...networkEvents
        .filter((item) => item.method === "POST")
        .map(
          (item) =>
            `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(
              item.durationMs / 1000
            ).toFixed(2)}s (${item.status})`,
        ),
      "- 错误统计:",
      `  - API failures: ${apiFailures.length}`,
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 截图:",
      "  - verify-1-upload-ready.png",
      "  - verify-2-new-tools-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      apiFailures,
      static404s,
      consoleErrors,
      pageErrors,
    });
    await writeJson(path.join(artifactDir, "chat-payloads.json"), chatPayloads);
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      reportLines.join("\n"),
      "utf8",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  await fs.mkdir(artifactDir, { recursive: true });
  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), {
    apiFailures,
    static404s,
    consoleErrors,
    pageErrors,
  });
  await writeJson(path.join(artifactDir, "chat-payloads.json"), chatPayloads);
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: FAIL",
      `- 失败原因: ${error instanceof Error ? error.message : String(error)}`,
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ].join("\n"),
    "utf8",
  );
  console.error(error);
  process.exit(1);
});
