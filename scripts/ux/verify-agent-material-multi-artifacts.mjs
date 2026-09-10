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
const existingAssetTitle =
  process.env.UX_EXISTING_CONTENT_ASSET_TITLE?.trim() || "";

const prompts = {
  worksheet:
    process.env.UX_MULTI_WORKSHEET_PROMPT ??
    "请根据我刚上传并引用的资料生成一份给学生上课直接使用的 worksheet。要求：guided notes + 一个课堂活动单，围绕小说章节内容，不要题库组卷，不要另外生成练习题。",
  rubric:
    process.env.UX_MULTI_RUBRIC_PROMPT ??
    "再基于同一份资料，为学生的 chapter discussion + reading response 写作任务生成一份 rubric。要求：4 个维度，包含内容理解、证据引用、分析深度、表达质量。",
  lessonPlan:
    process.env.UX_MULTI_LESSON_PLAN_PROMPT ??
    "再基于同一份资料生成一份 45 分钟的 lesson plan。要求：围绕小说章节内容，包含教学目标、导入、close reading、讨论活动和 exit ticket。",
  exam:
    process.env.UX_MULTI_EXAM_PROMPT ??
    "再基于同一份资料生成一份 exam。要求：5 道选择题 + 2 道简答题，聚焦章节理解与人物分析，附答案。",
};

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const chatPayloads = [];
const apiFailures = [];
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

function logStage(label) {
  console.log(`[verify-agent-material-multi-artifacts] ${label}`);
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
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat")
  );
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

async function attachExistingAssetByTitle(page, title) {
  logStage(`attach-existing:start:${title}`);
  const contextSidebar = page.locator("aside").filter({
    hasText: /上下文|Context/,
  });
  await contextSidebar.waitFor({ state: "visible", timeout: 20000 });

  const searchInput = contextSidebar.locator('input[type="text"]').first();
  await searchInput.fill(title);

  const row = contextSidebar.getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
  await row.waitFor({ state: "visible", timeout: 30000 });
  await row.click();

  const attachButton = contextSidebar.getByRole("button", {
    name: /贴入|Attach/,
  });
  await attachButton.waitFor({ state: "visible", timeout: 10000 });
  await attachButton.click();

  logStage(`attach-existing:done:${title}`);
  return title;
}

async function waitForArtifactCount(page, previousCount) {
  logStage(`artifact-count:wait:${previousCount}`);
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid="agent-artifact-reference"]').length >
      count,
    previousCount,
    { timeout: 120000 },
  );
  logStage(`artifact-count:done:${previousCount}`);
}

async function assertCanvasContains(page, pattern, failureMessage) {
  const artifactReference = page.getByTestId("agent-artifact-reference").last();
  await artifactReference.waitFor({ state: "visible", timeout: 60000 });
  await artifactReference.click();

  const artifactCanvas = page.getByTestId("agent-artifact-canvas");
  await artifactCanvas.waitFor({ state: "visible", timeout: 60000 });
  const canvasText = normalizeText(await artifactCanvas.textContent());
  assert(pattern.test(canvasText), `${failureMessage}: ${canvasText.slice(0, 260)}`);
  return canvasText;
}

async function sendPromptAndRead(page, prompt) {
  logStage(`chat:send:${prompt.slice(0, 40)}`);
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
  logStage(`chat:response:${chatResponse.status()}`);
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
    logStage("boot:start");
    await ensureLoggedIn(page);
    await page.getByTestId("agent-open-material-upload").waitFor({
      state: "visible",
      timeout: 60000,
    });
    await page.getByTestId("agent-open-scan-upload").waitFor({
      state: "detached",
      timeout: 20000,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-agent-loaded.png"),
      fullPage: true,
    });
    logStage("boot:ready");

    await page.getByTestId("agent-open-material-upload").click();
    logStage("sidebar:opened");

    const uploadStartedAt = Date.now();
    let uploadedAsset = null;
    let uploadedAssetTitle = existingAssetTitle;

    if (existingAssetTitle) {
      await attachExistingAssetByTitle(page, existingAssetTitle);
    } else {
      const contextSidebar = page.locator("aside").filter({
        hasText: /上下文|Context/,
      });
      await contextSidebar.waitFor({ state: "visible", timeout: 20000 });

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
      uploadedAsset = uploadBody?.asset ?? null;
      assert(uploadedAsset?.id, "侧栏上传未返回 asset.id");
      logStage(`upload:response:${uploadedAsset.id}`);

      const settled = await pollAssetStatus(page, uploadedAsset.id);
      assert(
        settled?.processingStatus === "ready",
        `侧栏上传素材未 ready：${JSON.stringify(settled ?? {})}`,
      );
      logStage(`upload:ready:${uploadedAsset.id}`);
      uploadedAssetTitle = uploadedAsset.title;
    }

    const referenceTag = page.getByTestId("agent-asset-reference-tag").filter({
      hasText: uploadedAssetTitle,
    });
    await referenceTag.waitFor({ state: "visible", timeout: 30000 });

    crossChecks.push({
      stage: "upload",
      uploadedAssetId: uploadedAsset?.id ?? null,
      uploadedAssetTitle,
      route: existingAssetTitle ? "content-assets/existing-selection" : "content-assets/upload",
      uploadToReadyMs: Date.now() - uploadStartedAt,
    });

    logStage("worksheet:start");
    const worksheetBeforeCount = await page
      .getByTestId("agent-artifact-reference")
      .count();
    const worksheetStream = await sendPromptAndRead(page, prompts.worksheet);
    await waitForArtifactCount(page, worksheetBeforeCount);
    const worksheetPayload = chatPayloads.at(-1);
    const worksheetIds = Array.isArray(worksheetPayload?.contentAssetIds)
      ? worksheetPayload.contentAssetIds
      : [];
    assert(
      uploadedAsset?.id ? worksheetIds.includes(uploadedAsset.id) : worksheetIds.length > 0,
      "worksheet 请求未携带上传资料的 contentAssetIds",
    );
    assert(
      worksheetStream.toolCalls.includes("generate_document_worksheet"),
      `worksheet 未命中文档型 workflow：${worksheetStream.toolCalls.join(", ") || "none"}`,
    );
    const worksheetToolResult = worksheetStream.toolResults.find(
      (item) => item?.toolName === "generate_document_worksheet",
    )?.output;
    assert(
      worksheetToolResult?.sourceMode === "document_handout",
      `worksheet sourceMode 异常：${JSON.stringify(worksheetToolResult ?? {})}`,
    );
    const worksheetCanvas = await assertCanvasContains(
      page,
      /(学习目标|课堂活动|guided notes|活动单|课堂讲义|exit ticket|活动步骤)/i,
      "worksheet Canvas 未显示文档型课堂材料结构",
    );
    crossChecks.push({
      stage: "worksheet",
      toolCalls: worksheetStream.toolCalls,
      contentAssetIds: worksheetIds,
      canvasPreview: worksheetCanvas.slice(0, 200),
    });
    logStage("worksheet:done");

    logStage("rubric:start");
    const rubricBeforeCount = await page
      .getByTestId("agent-artifact-reference")
      .count();
    const rubricStream = await sendPromptAndRead(page, prompts.rubric);
    await waitForArtifactCount(page, rubricBeforeCount);
    const rubricPayload = chatPayloads.at(-1);
    const rubricIds = Array.isArray(rubricPayload?.contentAssetIds)
      ? rubricPayload.contentAssetIds
      : [];
    assert(
      uploadedAsset?.id ? rubricIds.includes(uploadedAsset.id) : rubricIds.length > 0,
      "rubric 请求未携带上传资料的 contentAssetIds",
    );
    assert(
      rubricStream.toolCalls.includes("generate_rubric"),
      `rubric 未命中 generate_rubric：${rubricStream.toolCalls.join(", ") || "none"}`,
    );
    const rubricCanvas = await assertCanvasContains(
      page,
      /(评分|rubric|标准|维度|等级|证据引用|分析深度|表达质量)/i,
      "rubric Canvas 未显示评分量表结构",
    );
    crossChecks.push({
      stage: "rubric",
      toolCalls: rubricStream.toolCalls,
      contentAssetIds: rubricIds,
      canvasPreview: rubricCanvas.slice(0, 200),
    });
    logStage("rubric:done");

    logStage("lesson-plan:start");
    const lessonPlanBeforeCount = await page
      .getByTestId("agent-artifact-reference")
      .count();
    const lessonPlanStream = await sendPromptAndRead(page, prompts.lessonPlan);
    await waitForArtifactCount(page, lessonPlanBeforeCount);
    const lessonPlanPayload = chatPayloads.at(-1);
    const lessonPlanIds = Array.isArray(lessonPlanPayload?.contentAssetIds)
      ? lessonPlanPayload.contentAssetIds
      : [];
    assert(
      uploadedAsset?.id ? lessonPlanIds.includes(uploadedAsset.id) : lessonPlanIds.length > 0,
      "lesson plan 请求未携带上传资料的 contentAssetIds",
    );
    assert(
      lessonPlanStream.toolCalls.includes("generate_lesson_plan_workflow"),
      `lesson plan 未命中教案 workflow：${lessonPlanStream.toolCalls.join(", ") || "none"}`,
    );
    const lessonPlanCanvas = await assertCanvasContains(
      page,
      /(教学目标|导入|活动|课堂|exit ticket|讨论|close reading|流程)/i,
      "lesson plan Canvas 未显示教案结构",
    );
    crossChecks.push({
      stage: "lesson_plan",
      toolCalls: lessonPlanStream.toolCalls,
      contentAssetIds: lessonPlanIds,
      canvasPreview: lessonPlanCanvas.slice(0, 200),
    });
    logStage("lesson-plan:done");

    logStage("exam:start");
    const examBeforeCount = await page
      .getByTestId("agent-artifact-reference")
      .count();
    const examStream = await sendPromptAndRead(page, prompts.exam);
    await waitForArtifactCount(page, examBeforeCount);
    const examPayload = chatPayloads.at(-1);
    const examIds = Array.isArray(examPayload?.contentAssetIds)
      ? examPayload.contentAssetIds
      : [];
    assert(
      uploadedAsset?.id ? examIds.includes(uploadedAsset.id) : examIds.length > 0,
      "exam 请求未携带上传资料的 contentAssetIds",
    );
    assert(
      examStream.toolCalls.includes("generate_ap_exercises_pipeline") ||
        examStream.toolCalls.includes("assemble_question_bank_worksheet"),
      `exam 未命中题目/试卷生成 workflow：${examStream.toolCalls.join(", ") || "none"}`,
    );
    assert(
      !examStream.toolCalls.includes("generate_document_worksheet"),
      "exam 误命中文档型 worksheet workflow",
    );
    const examCanvas = await assertCanvasContains(
      page,
      /(第 1 题|答案|选择题|简答题|A[.．、]|B[.．、]|正确答案)/i,
      "exam Canvas 未显示试题结构",
    );
    crossChecks.push({
      stage: "exam",
      toolCalls: examStream.toolCalls,
      contentAssetIds: examIds,
      canvasPreview: examCanvas.slice(0, 200),
    });
    logStage("exam:done");

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-material-multi-artifacts.png"),
      fullPage: true,
    });

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      `- 素材来源: ${existingAssetTitle ? `复用现有资料 ${existingAssetTitle}` : `新上传 ${path.basename(uploadPdfPath)}`}`,
      `- 上传资产 ID: ${uploadedAsset?.id ?? "复用现有资产（未读取 id）"}`,
      `- 上传后到 ready: ${Date.now() - uploadStartedAt}ms`,
      "- 验证范围:",
      "  - 同一份 PDF 资料在同一会话里连续生成 worksheet / rubric / lesson plan / exam",
      "  - 每轮请求都继续携带 contentAssetIds",
      "  - 右侧 Canvas 能显示对应产物正文",
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
      "  - verify-2-material-multi-artifacts.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
      apiFailures,
    });
    await writeJson(path.join(artifactDir, "chat-payloads.json"), chatPayloads);
    await writeJson(path.join(artifactDir, "cross-checks.json"), crossChecks);
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      reportLines.join("\n"),
      "utf8",
    );
    logStage("report:done");
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
    apiFailures,
  });
  await writeJson(path.join(artifactDir, "chat-payloads.json"), chatPayloads);
  await writeJson(path.join(artifactDir, "cross-checks.json"), crossChecks);
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
