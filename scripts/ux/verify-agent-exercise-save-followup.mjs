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
  process.env.UX_RUN_TAG ??
  `UXSAVE-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const expectedSaveCount = Number.parseInt(process.env.UX_EXPECTED_SAVE_COUNT ?? "3", 10) || 3;
const expectedKeyword = process.env.UX_EXERCISE_EXPECTED_KEYWORD ?? runTag;
const firstPrompt =
  process.env.UX_EXERCISE_FIRST_PROMPT ??
  `帮我出 3 道 AP Biology Unit 3 cellular respiration 选择题。每道题题干第一行都以「${runTag}」开头。先不要入库。`;
const savePrompt =
  process.env.UX_EXERCISE_SAVE_PROMPT ??
  "把这些题保存到题库，归到 AP Biology Unit 3。";

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
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function waitForReadyPreflight(page, prompt, options = {}) {
  const preflightPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/agent/preflight") &&
      response.request().method() === "POST",
    { timeout: 60000 },
  );
  const chatPromise =
    options.waitForChat === true
      ? page.waitForResponse(
          (response) =>
            response.url().includes("/api/agent/chat") &&
            response.request().method() === "POST" &&
            response.status() >= 200 &&
            response.status() < 300,
          { timeout: 150000 },
        )
      : null;

  const composer = page.getByTestId("agent-composer").first();
  await composer.fill(prompt);
  await composer.press("Enter");

  const preflightResponse = await preflightPromise;
  const preflightBody = await preflightResponse.json().catch(() => null);
  const preflightReady =
    preflightBody?.ready === true ||
    preflightBody?.decision === "ready" ||
    preflightBody?.status === "ready";
  assert(preflightReady, `preflight 未 ready：${JSON.stringify(preflightBody ?? {})}`);
  return {
    preflightBody,
    chatPromise,
  };
}

async function pollQuestionBank(page, keyword, expectedCount, options = {}) {
  const requireClassification = options.requireClassification === true;
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const payload = await page.evaluate(async () => {
      const response = await fetch("/api/question-bank?sourceKind=agent_generated&limit=80", {
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });

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
      return {
        payload,
        matched,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
      `30 秒内未在题库里读到 runTag=${keyword} 的 ${expectedCount} 道${requireClassification ? "已分类" : ""}题`,
  );
}

async function fetchQuestionBankMatches(page, keyword) {
  const payload = await page.evaluate(async () => {
    const response = await fetch("/api/question-bank?sourceKind=agent_generated&limit=80", {
      credentials: "include",
      cache: "no-store",
    });
    return await response.json();
  });

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const matched = items.filter((item) =>
    normalizeText(item?.questionText).includes(keyword),
  );
  return {
    payload,
    matched,
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

    const composer = page.getByTestId("agent-composer").first();
    await composer.waitFor({ state: "visible", timeout: 60000 });

    const resetButton = page.getByTestId("agent-reset-conversation");
    if (await resetButton.count()) {
      await resetButton.click().catch(() => null);
      await composer.waitFor({ state: "visible", timeout: 30000 });
    }

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const { preflightBody: firstPreflightBody, chatPromise: firstChatPromise } =
      await waitForReadyPreflight(page, firstPrompt, { waitForChat: true });
    assert(
      firstPreflightBody?.taskContext?.action === "generate_exercises",
      `首轮 preflight action 异常：${JSON.stringify(firstPreflightBody?.taskContext ?? {})}`,
    );
    assert(
      firstPreflightBody?.taskContext?.savePreference === "temp_only",
      `首轮 savePreference 异常：${JSON.stringify(firstPreflightBody?.taskContext ?? {})}`,
    );

    const firstChatResponse = await firstChatPromise;
    assert(firstChatResponse.ok(), `首轮 /api/agent/chat 失败：${firstChatResponse.status()}`);

    const firstQuestionBlock = page.getByTestId("agent-question-block").filter({
      hasText: expectedKeyword,
    }).first();
    await firstQuestionBlock.waitFor({ state: "visible", timeout: 120000 });

    const firstQuestionText = normalizeText(await firstQuestionBlock.textContent());
    assert(firstQuestionText.includes(expectedKeyword), "首轮生成后页面没有展示预期题块");
    assert(firstQuestionText.includes("答案："), `首轮题块未显示答案：${firstQuestionText}`);
    assert(firstQuestionText.includes("解析："), `首轮题块未显示解析：${firstQuestionText}`);
    const firstAssistantMessage = page
      .getByTestId("agent-assistant-message")
      .filter({ hasText: "本轮先不入库" })
      .last();
    await firstAssistantMessage.waitFor({ state: "visible", timeout: 60000 });

    const firstAssistantText = normalizeText(await firstAssistantMessage.textContent());
    assert(
      firstAssistantText.includes("本轮先不入库"),
      `首轮未出现“先不入库”提示：${firstAssistantText}`,
    );

    const beforeSaveResult = await fetchQuestionBankMatches(page, expectedKeyword);
    assert(
      beforeSaveResult.matched.length === 0,
      `首轮后题目已提前入库，matched=${beforeSaveResult.matched.length}`,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const { preflightBody: secondPreflightBody, chatPromise: secondChatPromise } =
      await waitForReadyPreflight(page, savePrompt, { waitForChat: true });
    assert(
      secondPreflightBody?.taskContext?.action === "save_exercises",
      `保存 follow-up preflight action 异常：${JSON.stringify(secondPreflightBody?.taskContext ?? {})}`,
    );

    const secondChatResponse = await secondChatPromise;
    assert(secondChatResponse.ok(), `保存 follow-up /api/agent/chat 失败：${secondChatResponse.status()}`);

    const saveConfirmation = page
      .getByTestId("agent-assistant-message")
      .filter({ hasText: `已将上一轮生成的 ${expectedSaveCount} 道题真实保存到题库` })
      .last();
    await saveConfirmation.waitFor({ state: "visible", timeout: 60000 });

    const saveConfirmationText = normalizeText(await saveConfirmation.textContent());
    assert(
      saveConfirmationText.includes(`已将上一轮生成的 ${expectedSaveCount} 道题真实保存到题库`),
      `页面未出现保存成功提示：${saveConfirmationText}`,
    );

    const questionBankResult = await pollQuestionBank(page, expectedKeyword, expectedSaveCount, {
      requireClassification: true,
    });
    const firstMatched = questionBankResult.matched[0] ?? null;
    assert(firstMatched?.knowledgeCluster, "follow-up 保存后的题目缺少知识簇分类");
    assert(firstMatched?.knowledgeSubskillLabel, "follow-up 保存后的题目缺少细分知识点分类");
    const questionPrefix = normalizeText(firstMatched?.questionText ?? "").slice(0, 24);
    assert(questionPrefix.length >= 12, "follow-up 保存后的题目题干过短，无法继续做题库交叉验证");

    crossChecks.push({
      apiField: "首轮题块 -> 答案/解析",
      apiValue: "答案 + 解析",
      domValue: firstQuestionText,
      pass:
        firstQuestionText.includes("答案：") &&
        firstQuestionText.includes("解析："),
    });

    crossChecks.push({
      apiField: "首轮 GET /api/question-bank?sourceKind=agent_generated -> 匹配数",
      apiValue: beforeSaveResult.matched.length,
      domValue: firstAssistantText,
      pass:
        beforeSaveResult.matched.length === 0 &&
        firstAssistantText.includes("本轮先不入库"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/preflight(保存 follow-up) -> taskContext.action",
      apiValue: secondPreflightBody?.taskContext?.action ?? null,
      domValue: saveConfirmationText,
      pass:
        secondPreflightBody?.taskContext?.action === "save_exercises" &&
        saveConfirmationText.includes(`已将上一轮生成的 ${expectedSaveCount} 道题真实保存到题库`),
    });

    crossChecks.push({
      apiField: "GET /api/question-bank?sourceKind=agent_generated -> 匹配题干",
      apiValue: normalizeText(firstMatched?.questionText ?? "").slice(0, 120),
      domValue: firstQuestionText.slice(0, 120),
      pass:
        Boolean(firstMatched) &&
        firstQuestionText.includes(expectedKeyword) &&
        normalizeText(firstMatched?.questionText ?? "").includes(expectedKeyword),
    });

    crossChecks.push({
      apiField: "GET /api/question-bank?sourceKind=agent_generated -> taxonomy",
      apiValue: `${firstMatched?.knowledgeClusterLabel ?? firstMatched?.knowledgeCluster ?? ""} / ${firstMatched?.knowledgeSubskillLabel ?? ""}`,
      domValue: saveConfirmationText,
      pass: Boolean(firstMatched?.knowledgeCluster) && Boolean(firstMatched?.knowledgeSubskillLabel),
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

    const questionCard = page
      .locator('[data-testid="question-bank-question-list"] button')
      .filter({ hasText: questionPrefix })
      .first();
    await questionCard.waitFor({ state: "visible", timeout: 30000 });
    await questionCard.click();
    await page.getByTestId("question-bank-detail").waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("question-bank-taxonomy-panel").waitFor({ state: "visible", timeout: 30000 });

    const taxonomyText = normalizeText(
      await page.getByTestId("question-bank-taxonomy-panel").textContent(),
    );
    crossChecks.push({
      apiField: "GET /api/question-bank -> detail taxonomy",
      apiValue: `${firstMatched?.knowledgeClusterLabel ?? firstMatched?.knowledgeCluster ?? ""} / ${firstMatched?.knowledgeSubskillLabel ?? ""}`,
      domValue: taxonomyText,
      pass:
        taxonomyText.includes(firstMatched?.knowledgeClusterLabel ?? firstMatched?.knowledgeCluster ?? "") &&
        taxonomyText.includes(firstMatched?.knowledgeSubskillLabel ?? ""),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      ...networkEvents
        .filter(
          (item) =>
            item.url.includes("/api/agent/preflight") ||
            item.url.includes("/api/agent/chat") ||
            item.url.includes("/api/question-bank"),
        )
        .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (item) =>
          `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domValue}\`: ${item.pass ? "PASS" : "FAIL"}`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      `- 产物目录:\n  - ${path.relative(process.cwd(), artifactDir)}/`,
      "",
    ];

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await fs.writeFile(path.join(artifactDir, "report.md"), `${reportLines.join("\n")}\n`, "utf8");

    const criticalRequests = networkEvents.filter(
      (item) =>
        item.url.includes("/api/agent/preflight") ||
        item.url.includes("/api/agent/chat") ||
        item.url.includes("/api/question-bank"),
    );
    assert(static404s.length === 0, "存在静态资源 404");
    assert(consoleErrors.length === 0, "存在 console error");
    assert(pageErrors.length === 0, "存在 pageerror");
    assert(
      criticalRequests.every(
        (item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000,
      ),
      "关键请求存在失败或耗时超过 30s",
    );
    assert(crossChecks.length >= 4, "数据流交叉验证数量不足");
    assert(crossChecks.every((item) => item.pass), "数据流交叉验证失败");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  console.error(error);
  try {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
      failure: error instanceof Error ? error.message : String(error),
      crossChecks,
    });
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      `## UX 验证报告\n\n- 验证级别: L1\n- 最终结论: FAIL\n- 失败原因: ${
        error instanceof Error ? error.message : String(error)
      }\n- 产物目录:\n  - ${path.relative(process.cwd(), artifactDir)}/\n`,
      "utf8",
    );
  } catch {
    // ignore artifact write failures during hard failures
  }
  process.exitCode = 1;
});
