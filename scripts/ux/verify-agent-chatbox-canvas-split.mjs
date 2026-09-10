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
const summaryPrompt =
  process.env.UX_CHATBOX_SUMMARY_PROMPT ??
  "请根据我刚上传并引用的资料，用中文总结这一章的核心冲突与关键调查线索，控制在三句话内。";
const worksheetPrompt =
  process.env.UX_CANVAS_WORKSHEET_PROMPT ??
  "请根据刚才这份资料生成一份给学生上课直接使用的 worksheet。要求：guided notes + 一个课堂活动单，围绕小说章节内容，不要题库组卷，不要另外生成练习题。";

const networkEvents = [];
const chatPayloads = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function countAnchorHits(text, patterns) {
  return patterns.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0,
  );
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
  return repairMojibake(`${value ?? ""}`).replace(/\s+/g, " ").trim();
}

function repairMojibake(text) {
  if (!text) return "";
  if (/[\u4e00-\u9fff]/.test(text)) return text;
  if (!/[À-ÿ]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return /[\u4e00-\u9fff]/.test(repaired) ? repaired : text;
  } catch {
    return text;
  }
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

  const streamedText = repairMojibake(
    events
      .filter(
        (event) =>
          event?.type === "text-delta" &&
          (typeof event.text === "string" || typeof event.delta === "string"),
      )
      .map((event) => event.text ?? event.delta)
      .join(""),
  );

  return {
    raw,
    events,
    text: streamedText,
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
  };
}

async function expectChatResponse(page, timeout = 240000) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/api/agent/chat") &&
      response.request().method() === "POST",
    { timeout },
  );
}

async function openContextSidebar(page) {
  await page.getByTestId("agent-open-material-upload").waitFor({ state: "visible" });
  await page.getByTestId("agent-open-material-upload").click();
  const sidebar = page.getByTestId("agent-context-sidebar");
  await sidebar.waitFor({ state: "visible", timeout: 20000 });
  return sidebar;
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
    const newChatButton = page.getByRole("button", { name: /New chat/i }).first();
    if (await newChatButton.isVisible().catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(800);
    }

    const contextSidebar = await openContextSidebar(page);

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-assets/upload") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 60000 },
    );
    await contextSidebar.locator('input[type="file"]').setInputFiles(uploadPdfPath);
    const uploadResponse = await uploadResponsePromise;
    const uploadBody = await uploadResponse.json();
    const uploadedAsset = uploadBody?.asset ?? null;
    assert(uploadedAsset?.id, "上传未返回 asset.id");

    const composer = page.locator('[data-testid="agent-composer"]').first();
    const sendButton = page.getByTestId("agent-send-button").first();
    await composer.fill(summaryPrompt);
    await page.getByTestId("agent-reference-processing-hint").waitFor({ state: "visible", timeout: 10000 });
    assert(await sendButton.isDisabled(), "资料处理中时发送按钮不应可用");

    const settled = await pollAssetStatus(page, uploadedAsset.id);
    assert(
      settled?.processingStatus === "ready",
      `上传资料未 ready：${JSON.stringify(settled ?? {})}`,
    );

    const referenceTag = page.getByTestId("agent-asset-reference-tag").filter({
      hasText: uploadedAsset.title,
    });
    await referenceTag.waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("agent-reference-processing-hint").waitFor({
      state: "detached",
      timeout: 30000,
    });

    const summaryResponsePromise = expectChatResponse(page, 240000);
    await composer.fill(summaryPrompt);
    await composer.press("Enter");
    const summaryResponse = await summaryResponsePromise;
    if (!summaryResponse.ok()) {
      throw new Error(
        `资料总结请求失败 (${summaryResponse.status()}): ${await summaryResponse.text()}`,
      );
    }
    const summaryStream = await readUiStreamResponse(summaryResponse);

    const summaryPayload = chatPayloads.at(-1);
    const summaryReferencedIds = Array.isArray(summaryPayload?.contentAssetIds)
      ? summaryPayload.contentAssetIds
      : [];
    assert(
      summaryReferencedIds.includes(uploadedAsset.id),
      "总结请求没有带上 contentAssetIds",
    );
    assert(
      !summaryStream.toolCalls.includes("generate_worksheet") &&
        !summaryStream.toolCalls.includes("assemble_worksheet") &&
        !summaryStream.toolCalls.includes("generate_rubric") &&
        !summaryStream.toolCalls.includes("generate_lesson_plan_workflow") &&
        !summaryStream.toolCalls.includes("generate_ap_exercises_pipeline"),
      `资料总结不应命中文档型工具：${summaryStream.toolCalls.join(", ") || "none"}`,
    );
    await page.waitForTimeout(1000);
    const artifactReferencesAfterSummary = await page.getByTestId("agent-artifact-reference").count();
    assert(
      artifactReferencesAfterSummary === 0,
      `资料总结后左侧不应出现 artifact 引用卡，当前数量：${artifactReferencesAfterSummary}`,
    );
    const latestAssistantText = normalizeText(
      await page.getByTestId("agent-assistant-message").last().textContent(),
    );
    const summaryAnchorHits = countAnchorHits(latestAssistantText, [
      /bill greenslade/i,
      /dennis|丹尼斯/i,
      /pamela|帕梅拉/i,
      /tientsin grammar|天津文法学校|天津语法学校/i,
      /mischa|霍杰尔斯基/i,
      /悉尼·叶茨|sydney yeats|yeats/i,
    ]);
    assert(
      summaryAnchorHits >= 2,
      `资料总结未命中 PDF 核心内容：${latestAssistantText.slice(0, 240)}`,
    );
    assert(
      latestAssistantText.length > 0 && latestAssistantText.length < 800,
      `资料总结左侧正文异常，长度=${latestAssistantText.length}`,
    );

    const worksheetResponsePromise = expectChatResponse(page, 300000);
    await composer.fill(worksheetPrompt);
    await composer.press("Enter");
    const worksheetResponse = await worksheetResponsePromise;
    if (!worksheetResponse.ok()) {
      throw new Error(
        `worksheet 请求失败 (${worksheetResponse.status()}): ${await worksheetResponse.text()}`,
      );
    }
    const worksheetStream = await readUiStreamResponse(worksheetResponse);

    const worksheetPayload = chatPayloads.at(-1);
    const worksheetReferencedIds = Array.isArray(worksheetPayload?.contentAssetIds)
      ? worksheetPayload.contentAssetIds
      : [];
    assert(
      worksheetReferencedIds.includes(uploadedAsset.id),
      "worksheet 请求没有继续带上 contentAssetIds",
    );
    assert(
      worksheetStream.toolCalls.includes("generate_worksheet"),
      `worksheet 未命中 generate_worksheet：${worksheetStream.toolCalls.join(", ") || "none"}`,
    );
    assert(
      !worksheetStream.toolCalls.includes("assemble_worksheet"),
      "worksheet 不应误命中 assemble_worksheet",
    );
    assert(
      !worksheetStream.text.includes("<article"),
      "worksheet 左侧聊天区不应再回填整段 HTML",
    );

    const artifactReference = page.getByTestId("agent-artifact-reference").first();
    await artifactReference.waitFor({ state: "visible", timeout: 60000 });
    await artifactReference.click();

    const artifactCanvas = page.getByTestId("agent-artifact-canvas");
    await artifactCanvas.waitFor({ state: "visible", timeout: 60000 });
    const canvasText = normalizeText(await artifactCanvas.textContent());
    assert(
      /(学习目标|课堂活动|引导笔记|guided notes|活动步骤|quick check|exit ticket)/i.test(
        canvasText,
      ),
      "worksheet 右侧 Canvas 未显示文档型结构",
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-chatbox-canvas-split.png"),
      fullPage: true,
    });

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "chat-payloads.json"), chatPayloads);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      [
        "## UX 验证报告",
        "",
        "- 验证级别: L1",
        "- 最终结论: PASS",
        `- 测试素材: ${path.basename(uploadPdfPath)}`,
        `- 上传资产 ID: ${uploadedAsset.id}`,
        "- 验证点:",
        "  - 资料总结只在左侧 Chatbox 输出，不产生 artifact 引用卡",
        "  - worksheet 左侧只保留摘要，完整正文进入右侧 Canvas",
        "  - 两轮请求都继续携带同一 contentAssetIds",
        "  - worksheet 命中 generate_worksheet，不回退 assemble_worksheet",
        `- console error: ${consoleErrors.length}`,
        `- pageerror: ${pageErrors.length}`,
        `- 静态资源 404: ${static404s.length}`,
        "",
      ].join("\n"),
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
  await writeJson(path.join(artifactDir, "chat-payloads.json"), chatPayloads);
  await writeJson(path.join(artifactDir, "errors.json"), {
    consoleErrors,
    pageErrors,
    static404s,
  });
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: FAIL",
      `- 失败原因: ${error instanceof Error ? error.message : String(error)}`,
      "",
    ].join("\n"),
    "utf8",
  );
  console.error(error);
  process.exit(1);
});
