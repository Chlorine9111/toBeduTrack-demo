import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const contentAssetsUrl = `${baseUrl}/main/content-assets`;
const agentUrl = `${baseUrl}/main/agent`;
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const uploadPdfPath =
  process.env.UX_MATERIAL_PDF_PATH ??
  "/Users/martin/Downloads/Chapter_11_Of_Rats_and_Men.pdf";
const factualPrompt =
  process.env.UX_MATERIAL_FACT_PROMPT ??
  "请根据我刚引用的资料回答：Bill Greenslade 做了哪两件关键调查动作？并说明 Tientsin Grammar 与调查的关系。请用中文两句话回答。";
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
    url.includes("/api/content-assets/bootstrap") ||
    url.includes("/api/content-assets/") ||
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat")
  );
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureLoggedIn(page, targetUrl) {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
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

  if (new URL(page.url()).pathname !== new URL(targetUrl).pathname) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
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

async function pollAssetStatus(page, assetId, options = {}) {
  const attempts = Math.max(1, options.attempts ?? 90);
  const intervalMs = Math.max(500, options.intervalMs ?? 2000);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
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

    await page.waitForTimeout(intervalMs);
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
    await ensureLoggedIn(page, contentAssetsUrl);
    await page
      .getByText(/上传文件|拖拽文件到此处或点击上传/)
      .first()
      .waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-content-assets-loaded.png"),
      fullPage: true,
    });

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-assets/upload") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 60000 },
    );

    await page.locator('input[type="file"]').first().setInputFiles(uploadPdfPath);
    const uploadResponse = await uploadResponsePromise;
    const uploadBody = await uploadResponse.json();
    const uploadedAsset = uploadBody?.asset ?? null;
    assert(uploadedAsset?.id, "上传接口未返回 asset.id");
    assert(uploadedAsset.assetSource === "uploaded", "上传后的资产不是 uploaded");

    const readyAsset = await pollAssetStatus(page, uploadedAsset.id, {
      attempts: 120,
      intervalMs: 1500,
    });
    assert(
      readyAsset?.processingStatus === "ready",
      `资产未 ready：${JSON.stringify(readyAsset ?? {})}`,
    );

    const detailBody = await page.evaluate(async (id) => {
      const response = await fetch(`/api/content-assets/${id}`, {
        cache: "no-store",
      });
      return await response.json();
    }, uploadedAsset.id);

    assert(
      detailBody?.detailKind === "uploaded",
      `detailKind 异常：${JSON.stringify(detailBody ?? {})}`,
    );
    assert(
      detailBody?.contentLibraryItem === null,
      "上传素材不应自动映射内容库条目",
    );

    crossChecks.push({
      apiField: "POST /api/content-assets/upload -> asset.assetSource",
      apiValue: uploadedAsset.assetSource,
      domValue: readyAsset?.processingStatus ?? null,
      pass:
        uploadedAsset.assetSource === "uploaded" &&
        readyAsset?.processingStatus === "ready",
    });
    crossChecks.push({
      apiField: "GET /api/content-assets/:id -> contentLibraryItem",
      apiValue: detailBody?.contentLibraryItem,
      domValue: detailBody?.detailKind,
      pass:
        detailBody?.contentLibraryItem === null &&
        detailBody?.detailKind === "uploaded",
    });

    await ensureLoggedIn(page, agentUrl);
    await page
      .getByTestId("agent-open-reference-picker")
      .waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-agent-loaded.png"),
      fullPage: true,
    });

    await page.getByTestId("agent-open-reference-picker").click();
    const contextSidebar = page.locator("aside").filter({
      hasText: /上下文|Context/,
    });
    await contextSidebar.waitFor({ state: "visible", timeout: 20000 });
    await contextSidebar.getByPlaceholder(/搜索|Search/).fill(uploadedAsset.title);

    const pickerItem = contextSidebar.locator("button").filter({
      hasText: uploadedAsset.title,
    });
    await pickerItem.first().waitFor({ state: "visible", timeout: 20000 });
    await pickerItem.first().click();

    const attachButton = contextSidebar.getByRole("button", {
      name: /贴入 1 项|Attach 1 items?/,
    });
    await attachButton.waitFor({ state: "visible", timeout: 10000 });
    await attachButton.click();

    const referenceTag = page.getByTestId("agent-asset-reference-tag").filter({
      hasText: uploadedAsset.title,
    });
    await referenceTag.waitFor({ state: "visible", timeout: 10000 });

    const firstChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 240000 },
    );

    const composer = page.locator('[data-testid="agent-composer"]').first();
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
      "首轮问答未携带 contentAssetIds",
    );
    assert(
      /bill greenslade/i.test(firstChatStream.text) &&
        /tientsin grammar/i.test(firstChatStream.text),
      `首轮资料问答未命中关键内容：${firstChatStream.text.slice(0, 200)}`,
    );

    await page
      .getByText(`已引用内容：${uploadedAsset.title}`)
      .waitFor({ state: "visible", timeout: 30000 });
    await page
      .locator('[data-testid="agent-assistant-message"]')
      .last()
      .waitFor({ state: "visible", timeout: 30000 });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> 首轮 contentAssetIds",
      apiValue: JSON.stringify(firstReferencedIds),
      domValue: firstChatStream.text.slice(0, 200),
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

    const secondPayload = chatPayloads.at(-1);
    const secondReferencedIds = Array.isArray(secondPayload?.contentAssetIds)
      ? secondPayload.contentAssetIds
      : [];
    const worksheetToolResult = secondChatStream.toolResults.find(
      (item) => item?.toolName === "generate_document_worksheet",
    )?.output;

    assert(
      secondChatStream.toolCalls.includes("generate_document_worksheet"),
      `未命中文档型 worksheet workflow：${secondChatStream.toolCalls.join(", ") || "none"}`,
    );
    assert(
      !secondChatStream.toolCalls.includes("assemble_question_bank_worksheet"),
      "不应误命中题库组卷 workflow",
    );
    assert(
      !secondChatStream.toolCalls.includes("generate_ap_exercises_pipeline"),
      "不应误命中生成式习题 workflow",
    );
    assert(
      typeof worksheetToolResult?.sourceMode === "string" &&
        worksheetToolResult.sourceMode === "document_handout",
      `worksheet tool-result 不是 document_handout：${JSON.stringify(worksheetToolResult ?? {})}`,
    );

    const artifactReference = page.getByTestId("agent-artifact-reference").first();
    await artifactReference.waitFor({ state: "visible", timeout: 60000 });
    await artifactReference.click();

    const artifactCanvas = page.getByTestId("agent-artifact-canvas");
    await artifactCanvas.waitFor({ state: "visible", timeout: 60000 });
    const canvasTitle = page.getByTestId("agent-canvas-title");
    await canvasTitle.waitFor({ state: "visible", timeout: 60000 });

    const canvasTitleText = normalizeText(await canvasTitle.textContent());
    const canvasText = normalizeText(await artifactCanvas.textContent());
    assert(canvasText.length >= 120, "Canvas 文本过短，疑似未生成有效 worksheet");
    assert(
      /(学习目标|课堂活动|引导笔记|guided notes|活动步骤|快速检查|exit ticket)/i.test(
        canvasText,
      ),
      "Canvas 未显示文档型 worksheet 结构",
    );

    crossChecks.push({
      apiField: "第二轮 worksheet toolResult.sourceMode",
      apiValue: worksheetToolResult?.sourceMode ?? null,
      domValue: canvasTitleText,
      pass: worksheetToolResult?.sourceMode === "document_handout",
    });
    crossChecks.push({
      apiField: "第二轮 contentAssetIds",
      apiValue: JSON.stringify(secondReferencedIds),
      domValue: canvasText.slice(0, 160),
      pass: true,
    });

    assert(crossChecks.every((item) => item.pass), "数据流交叉验证未全部通过");

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-material-workflow.png"),
      fullPage: true,
    });

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      `- 上传素材: ${path.basename(uploadPdfPath)}`,
      `- 上传资产 ID: ${uploadedAsset.id}`,
      `- 首轮资料问答是否携带 contentAssetIds: ${
        firstReferencedIds.includes(uploadedAsset.id) ? "PASS" : "FAIL"
      }`,
      `- 第二轮 worksheet workflow: ${
        secondChatStream.toolCalls.includes("generate_document_worksheet")
          ? "PASS"
          : "FAIL"
      }`,
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
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (item) =>
          `  - API 字段 ${item.apiField} -> DOM/结果 ${String(
            item.domValue ?? "",
          ).slice(0, 160)}: ${item.pass ? "PASS" : "FAIL"}`,
      ),
      "- 截图:",
      "  - verify-1-content-assets-loaded.png",
      "  - verify-2-agent-loaded.png",
      "  - verify-3-material-workflow.png",
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
    await writeJson(
      path.join(artifactDir, "first-chat-stream.json"),
      firstChatStream,
    );
    await writeJson(
      path.join(artifactDir, "second-chat-stream.json"),
      secondChatStream,
    );
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
  const failReport = [
    "## UX 验证报告",
    "",
    "- 验证级别: L1",
    "- 最终结论: FAIL",
    `- 失败原因: ${error instanceof Error ? error.message : String(error)}`,
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
    "- 数据流交叉验证:",
    ...crossChecks.map(
      (item) =>
        `  - API 字段 ${item.apiField} -> DOM/结果 ${String(
          item.domValue ?? "",
        ).slice(0, 160)}: ${item.pass ? "PASS" : "FAIL"}`,
    ),
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
  await writeJson(path.join(artifactDir, "chat-payloads.json"), chatPayloads);
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    failReport.join("\n"),
    "utf8",
  );
  console.error(error);
  process.exit(1);
});
