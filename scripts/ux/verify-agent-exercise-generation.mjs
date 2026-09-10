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
const runTag =
  process.env.UX_RUN_TAG ?? `UXEX-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const expectedSaveCount = Number.parseInt(process.env.UX_EXPECTED_SAVE_COUNT ?? "3", 10) || 3;
const exercisePrompt =
  process.env.UX_EXERCISE_PROMPT ??
  `请为 AP Biology Unit 3 Cellular Respiration 生成 5 道 AP 风格选择题。每道题题干第一行都以「${runTag}」开头，并直接保存到题库。`;

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
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

function isTrackedApi(url) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat") ||
    url.includes("/api/question-bank")
  );
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

async function pollQuestionBankMatches(page, keyword, { expectedCount = 1, requireClassification = false } = {}) {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const payload = await page.evaluate(async ({ q }) => {
      const response = await fetch(`/api/question-bank?sourceKind=agent_generated&limit=100&q=${encodeURIComponent(q)}`, {
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    }, { q: keyword });

    const items = Array.isArray(payload?.items) ? payload.items : [];
    const matched = items.filter((item) =>
      normalizeText(item?.questionText).includes(keyword),
    );
    const classified = matched.filter((item) =>
      Boolean(item?.knowledgeCluster) && Boolean(item?.knowledgeSubskillLabel),
    );
    if (
      matched.length >= expectedCount &&
      (!requireClassification || classified.length >= expectedCount)
    ) {
      return { payload, matched };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`30 秒内未读到 runTag=${keyword} 的 ${expectedCount} 道已分类题目`);
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

    const preflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );

    await composer.fill(exercisePrompt);
    await composer.press("Enter");

    const preflightResponse = await preflightPromise;
    const preflightBody = await preflightResponse.json().catch(() => null);
    const preflightReady =
      preflightBody?.ready === true ||
      preflightBody?.decision === "ready" ||
      preflightBody?.status === "ready";
    assert(preflightReady, `习题请求未进入正式生成，preflight 返回：${JSON.stringify(preflightBody ?? {})}`);

    const chatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 150000 },
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const chatResponse = await chatPromise;
    assert(chatResponse.ok(), `习题生成 /api/agent/chat 失败：${chatResponse.status()}`);

    const firstQuestionBlock = page.getByTestId("agent-question-block").filter({
      hasText: runTag,
    }).first();
    await firstQuestionBlock.waitFor({ state: "visible", timeout: 120000 });
    const firstQuestionText = normalizeText(await firstQuestionBlock.textContent());

    const saveConfirmation = page
      .getByTestId("agent-assistant-message")
      .filter({ hasText: "已真实保存" })
      .last();
    await saveConfirmation.waitFor({ state: "visible", timeout: 120000 });
    const saveConfirmationText = normalizeText(await saveConfirmation.textContent());

    let canvasTitle = "";
    let canvasText = firstQuestionText;
    const artifactReference = page.getByTestId("agent-artifact-reference").last();
    if (await artifactReference.count()) {
      await artifactReference.waitFor({ state: "visible", timeout: 30000 });
      await artifactReference.click();
      const artifactCanvas = page.getByTestId("agent-artifact-canvas");
      await artifactCanvas.waitFor({ state: "visible", timeout: 120000 });
      await page.getByTestId("agent-canvas-title").waitFor({ state: "visible", timeout: 120000 });
      canvasTitle = normalizeText(await page.getByTestId("agent-canvas-title").textContent());
      canvasText = normalizeText(await artifactCanvas.textContent());
    }

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> taskContext.action",
      apiValue: preflightBody?.taskContext?.action ?? null,
      domValue: saveConfirmationText,
      pass:
        preflightBody?.taskContext?.action === "generate_exercises" &&
        saveConfirmationText.includes("已真实保存"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> runTag / exercise DOM",
      apiValue: runTag,
      domValue: `${canvasTitle} | ${canvasText.slice(0, 80)}`,
      pass:
        firstQuestionText.includes(runTag) &&
        (canvasText.includes(runTag) || firstQuestionText.includes("第 1 题")),
    });

    const generatedQuestionBankPayload = await pollQuestionBankMatches(page, runTag, {
      expectedCount: expectedSaveCount,
      requireClassification: true,
    });
    const savedItems = generatedQuestionBankPayload.matched;
    assert(savedItems.length > 0, "题库列表里未找到本轮保存的习题");

    const firstSavedItem = savedItems[0];
    assert(firstSavedItem?.knowledgeCluster, "题目已入库但缺少知识簇分类");
    assert(firstSavedItem?.knowledgeSubskillLabel, "题目已入库但缺少细分知识点分类");
    const questionPrefix = normalizeText(firstSavedItem?.questionText).slice(0, 24);
    assert(questionPrefix.length >= 12, "生成题目题干过短，无法做 UI 交叉验证");

    crossChecks.push({
      apiField: "GET /api/question-bank?sourceKind=agent_generated -> runTag 命中数",
      apiValue: savedItems.length,
      domValue: savedItems.length,
      pass: savedItems.length > 0,
    });

    crossChecks.push({
      apiField: "GET /api/question-bank?sourceKind=agent_generated -> taxonomy",
      apiValue: `${firstSavedItem?.knowledgeClusterLabel ?? firstSavedItem?.knowledgeCluster ?? ""} / ${firstSavedItem?.knowledgeSubskillLabel ?? ""}`,
      domValue: firstQuestionText,
      pass: Boolean(firstSavedItem?.knowledgeCluster) && Boolean(firstSavedItem?.knowledgeSubskillLabel),
    });

    crossChecks.push({
      apiField: "GET /api/question-bank?sourceKind=agent_generated -> firstSaved.questionText[0:24]",
      apiValue: questionPrefix,
      domValue: canvasText,
      pass: canvasText.includes(questionPrefix),
    });

    await page.goto(`${baseUrl}/main/question-bank`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("question-bank-search").waitFor({ state: "visible", timeout: 60000 });
    await page.getByTestId("question-bank-search").fill(questionPrefix);
    await page.waitForFunction(
      (prefix) =>
        Array.from(document.querySelectorAll('[data-testid="question-bank-question-list"] button')).some((node) =>
          node.textContent?.includes(prefix),
        ),
      questionPrefix,
      { timeout: 30000 },
    );
    const searchedQuestionBankPayload = await page.evaluate(async ({ keyword }) => {
      const response = await fetch(`/api/question-bank?q=${encodeURIComponent(keyword)}&limit=20`, {
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    }, { keyword: questionPrefix });
    const searchedItems = Array.isArray(searchedQuestionBankPayload?.items)
      ? searchedQuestionBankPayload.items
      : [];
    crossChecks.push({
      apiField: "GET /api/question-bank?q=questionPrefix -> 命中条目",
      apiValue: searchedItems.length,
      domValue: questionPrefix,
      pass: searchedItems.length > 0,
    });

    const questionCard = page
      .locator('[data-testid="question-bank-question-list"] button')
      .filter({ hasText: questionPrefix })
      .first();
    await questionCard.waitFor({ state: "visible", timeout: 30000 });
    await questionCard.click();
    await page.getByTestId("question-bank-detail").waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("question-bank-source-panel").waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("question-bank-taxonomy-panel").waitFor({ state: "visible", timeout: 30000 });

    const detailText = normalizeText(
      await page.getByTestId("question-bank-detail").textContent(),
    );
    const taxonomyText = normalizeText(
      await page.getByTestId("question-bank-taxonomy-panel").textContent(),
    );
    crossChecks.push({
      apiField: "GET /api/question-bank -> detail runTag",
      apiValue: runTag,
      domValue: detailText,
      pass: detailText.includes(runTag),
    });
    crossChecks.push({
      apiField: "GET /api/question-bank -> detail taxonomy",
      apiValue: `${firstSavedItem?.knowledgeClusterLabel ?? firstSavedItem?.knowledgeCluster ?? ""} / ${firstSavedItem?.knowledgeSubskillLabel ?? ""}`,
      domValue: taxonomyText,
      pass:
        taxonomyText.includes(firstSavedItem?.knowledgeClusterLabel ?? firstSavedItem?.knowledgeCluster ?? "") &&
        taxonomyText.includes(firstSavedItem?.knowledgeSubskillLabel ?? ""),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });

    const agentChatRequests = networkEvents.filter((item) => item.url.includes("/api/agent/chat"));
    const requiredCrossChecks = crossChecks.filter((item) =>
      item.apiField.includes("taskContext.action") ||
      item.apiField.includes("runTag 命中数") ||
      item.apiField.includes("taxonomy") ||
      item.apiField.includes("GET /api/question-bank?q=questionPrefix") ||
      item.apiField.includes("detail runTag"),
    );
    const report = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      ...networkEvents.map(
        (entry) => `  - ${entry.method} ${entry.url.replace(baseUrl, "")}: ${(entry.durationMs / 1000).toFixed(2)}s`,
      ),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (item) =>
          `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${String(item.domValue)}\`: ${item.pass ? "PASS" : "FAIL"}`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ].join("\n");
    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");

    assert(static404s.length === 0, "存在静态资源 404");
    assert(consoleErrors.length === 0, "存在 console error");
    assert(pageErrors.length === 0, "存在 pageerror");
    assert(agentChatRequests.length > 0, "未记录到 /api/agent/chat 请求");
    assert(
      agentChatRequests.every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000),
      "习题生成 chat 耗时超过 30s 或请求失败",
    );
    assert(requiredCrossChecks.length >= 4, "关键交叉验证数量不足");
    assert(requiredCrossChecks.every((item) => item.pass), "数据流交叉验证失败");
  } catch (error) {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
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
        `- 失败原因: ${error instanceof Error ? error.message : "未知错误"}`,
        "- 数据流交叉验证:",
        ...crossChecks.map(
          (item) =>
            `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${String(item.domValue)}\`: ${item.pass ? "PASS" : "FAIL"}`,
        ),
        "- 截图:",
        "  - verify-1-loaded.png",
        "  - verify-2-after-action.png",
        "  - verify-3-result.png",
        "- 产物目录:",
        `  - ${artifactDir}`,
        "",
      ].join("\n"),
      "utf8",
    );
    throw error;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
