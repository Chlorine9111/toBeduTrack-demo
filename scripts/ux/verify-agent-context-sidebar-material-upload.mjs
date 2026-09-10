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
const factualPrompt =
  process.env.UX_MATERIAL_FACT_PROMPT ??
  "请根据我刚上传并引用的资料回答：Bill Greenslade 做了哪两件关键调查动作？并说明 Tientsin Grammar 与调查的关系。请用中文两句话回答。";
const worksheetPrompt =
  process.env.UX_MATERIAL_WORKSHEET_PROMPT ??
  "再根据刚才这份资料生成一份给学生上课直接使用的 worksheet。要求：guided notes + 一个课堂活动单，围绕小说章节内容，不要题库组卷，不要另外生成练习题。";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const chatPayloads = [];
const requestStarts = new WeakMap();

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    url.includes("/api/content-assets?") ||
    url.includes("/api/pdf/") ||
    url.includes("/api/agent/preflight") ||
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
    await page.getByTestId("agent-open-reference-picker").waitFor({ state: "visible" });
    await page.getByTestId("agent-open-material-upload").waitFor({ state: "visible" });
    await page.getByTestId("agent-open-scan-upload").waitFor({ state: "detached" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-agent-loaded.png"),
      fullPage: true,
    });

    await page.getByTestId("agent-open-material-upload").click();
    const contextSidebar = page.locator("aside").filter({
      hasText: /上下文|Context/,
    });
    await contextSidebar.waitFor({ state: "visible", timeout: 20000 });

    const sidebarUploadStart = Date.now();
    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-assets/upload") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 60000 },
    );

    await contextSidebar
      .locator('input[type="file"]')
      .setInputFiles(uploadPdfPath);
    const uploadResponse = await uploadResponsePromise;
    const uploadBody = await uploadResponse.json();
    const uploadedAsset = uploadBody?.asset ?? null;
    assert(uploadedAsset?.id, "侧栏上传未返回 asset.id");

    const composer = page.locator('[data-testid="agent-composer"]').first();
    const sendButton = page.getByTestId("agent-send-button").first();
    const pendingPrompt = "根据内容给我 worksheet";
    const chatPayloadCountBeforeReady = chatPayloads.length;

    await composer.fill(pendingPrompt);
    await page
      .getByTestId("agent-reference-processing-hint")
      .waitFor({ state: "visible", timeout: 10000 });
    assert(
      await sendButton.isDisabled(),
      "资料仍在处理中时，发送按钮不应可用",
    );

    await composer.press("Enter");
    await page.waitForTimeout(1500);
    assert(
      chatPayloads.length === chatPayloadCountBeforeReady,
      "资料仍在处理中时，不应发出 /api/agent/chat 请求",
    );

    const settled = await pollAssetStatus(page, uploadedAsset.id);
    assert(
      settled?.processingStatus === "ready",
      `侧栏上传素材未 ready：${JSON.stringify(settled ?? {})}`,
    );

    const postUploadEvents = networkEvents.filter(
      (item) => item.url.includes("/api/pdf/") || item.url.includes("/api/content-assets/"),
    );
    assert(
      postUploadEvents.some((item) => item.url.includes("/api/content-assets/upload")),
      "侧栏上传未命中 /api/content-assets/upload",
    );
    assert(
      !postUploadEvents.some((item) => item.url.includes("/api/pdf/upload-scan")),
      "侧栏上传误命中 /api/pdf/upload-scan",
    );
    assert(
      !postUploadEvents.some((item) => item.url.includes("/api/pdf/process-scan")),
      "侧栏上传误命中 /api/pdf/process-scan",
    );

    const referenceTag = page.getByTestId("agent-asset-reference-tag").filter({
      hasText: uploadedAsset.title,
    });
    await referenceTag.waitFor({ state: "visible", timeout: 30000 });
    await page
      .getByTestId("agent-reference-processing-hint")
      .waitFor({ state: "detached", timeout: 30000 });
    assert(
      !(await sendButton.isDisabled()),
      "资料 ready 并贴入上下文后，发送按钮应该恢复可用",
    );

    crossChecks.push({
      apiField: "AgentContextSidebar upload -> route",
      apiValue: "content-assets/upload",
      domValue: referenceTag ? uploadedAsset.title : "",
      pass: true,
    });

    await composer.fill("拆解题目");
    await page.getByTestId("agent-open-scan-upload").waitFor({ state: "visible", timeout: 10000 });
    await composer.fill("");
    await page.getByTestId("agent-open-scan-upload").waitFor({ state: "detached", timeout: 10000 });

    const firstChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 240000 },
    );

    await composer.fill(factualPrompt);
    await composer.press("Enter");
    const firstChatResponse = await firstChatPromise;
    const firstChatStream = await readUiStreamResponse(firstChatResponse);

    const firstPayload = chatPayloads.at(-1);
    const firstReferencedIds = Array.isArray(firstPayload?.contentAssetIds)
      ? firstPayload.contentAssetIds
      : [];
    assert(
      firstReferencedIds.includes(uploadedAsset.id),
      "侧栏上传后的首轮问答未携带 contentAssetIds",
    );
    assert(
      /bill greenslade/i.test(firstChatStream.text) &&
        /tientsin grammar/i.test(firstChatStream.text),
      `侧栏上传后的资料问答未命中关键内容：${firstChatStream.text.slice(0, 200)}`,
    );

    crossChecks.push({
      apiField: "POST /api/agent/chat -> 首轮 contentAssetIds",
      apiValue: JSON.stringify(firstReferencedIds),
      domValue: firstChatStream.text.slice(0, 160),
      pass: firstReferencedIds.includes(uploadedAsset.id),
    });

    const secondChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 300000 },
    );

    await composer.fill(worksheetPrompt);
    await composer.press("Enter");
    const secondChatResponse = await secondChatPromise;
    const secondChatStream = await readUiStreamResponse(secondChatResponse);
    const worksheetToolResult = secondChatStream.toolResults.find(
      (item) => item?.toolName === "generate_document_worksheet",
    )?.output;

    assert(
      secondChatStream.toolCalls.includes("generate_document_worksheet"),
      `侧栏上传后的 worksheet 未命中文档型 workflow：${secondChatStream.toolCalls.join(", ") || "none"}`,
    );
    assert(
      !secondChatStream.toolCalls.includes("assemble_question_bank_worksheet"),
      "侧栏上传后的 worksheet 误命中题库组卷 workflow",
    );
    assert(
      !secondChatStream.toolCalls.includes("generate_ap_exercises_pipeline"),
      "侧栏上传后的 worksheet 误命中生成式习题 workflow",
    );
    assert(
      typeof worksheetToolResult?.sourceMode === "string" &&
        worksheetToolResult.sourceMode === "document_handout",
      `侧栏上传后的 worksheet sourceMode 异常：${JSON.stringify(worksheetToolResult ?? {})}`,
    );

    const artifactReference = page.getByTestId("agent-artifact-reference").first();
    await artifactReference.waitFor({ state: "visible", timeout: 60000 });
    await artifactReference.click();

    const artifactCanvas = page.getByTestId("agent-artifact-canvas");
    await artifactCanvas.waitFor({ state: "visible", timeout: 60000 });
    const canvasText = normalizeText(await artifactCanvas.textContent());
    assert(
      /(学习目标|课堂活动|引导笔记|guided notes|活动步骤|快速检查|exit ticket)/i.test(
        canvasText,
      ),
      "侧栏上传后的 Canvas 未显示文档型 worksheet 结构",
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-material-upload-result.png"),
      fullPage: true,
    });

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      `- 侧栏上传素材: ${path.basename(uploadPdfPath)}`,
      `- 上传资产 ID: ${uploadedAsset.id}`,
      `- 上传后到 ready: ${Date.now() - sidebarUploadStart}ms`,
      "- 关键断言:",
      "  - Agent 右侧上下文侧栏上传命中 /api/content-assets/upload",
      "  - 未命中 /api/pdf/upload-scan 与 /api/pdf/process-scan",
      "  - 首轮问答命中 contentAssetIds 与资料内容",
      "  - 第二轮 worksheet 命中文档型 workflow",
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
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 截图:",
      "  - verify-1-agent-loaded.png",
      "  - verify-2-material-upload-result.png",
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
