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
  `UXSTREAM-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const exercisePrompt =
  process.env.UX_EXERCISE_STREAMING_PROMPT ??
  `请为 AP Biology Unit 3 Cellular Respiration 生成 3 道 AP 风格选择题。每道题题干第一行都以「${runTag}」开头。先逐题流式展示完整题块，再直接保存到题库。`;

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

async function readNdjsonResponse(response) {
  const raw = await response.text().catch(() => "");
  const events = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
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
    phases: events.filter((event) => event?.type === "phase"),
    questionBlocks: events.filter((event) => event?.type === "question-ready"),
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
    await page
      .locator('form[data-auth-ready="true"]')
      .waitFor({ state: "visible", timeout: 60000 });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", {
        timeout: 120000,
      }),
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
    const chatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 150000 },
    );

    await composer.fill(exercisePrompt);
    await composer.press("Enter");

    const progressPanel = page.getByTestId("agent-progress-panel");
    await progressPanel.waitFor({ state: "visible", timeout: 15000 });
    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const preflightResponse = await preflightPromise;
    const preflightBody = await preflightResponse.json().catch(() => null);
    const preflightReady =
      preflightBody?.ready === true ||
      preflightBody?.decision === "ready" ||
      preflightBody?.status === "ready";
    assert(
      preflightReady,
      `习题请求未进入正式生成，preflight 返回：${JSON.stringify(
        preflightBody ?? {},
      )}`,
    );

    const chatResponse = await chatPromise;
    const chatNdjson = await readNdjsonResponse(chatResponse);

    const questionBlocks = page.locator('[data-testid="agent-question-block"]');
    await questionBlocks.first().waitFor({ state: "visible", timeout: 120000 });
    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const questionBlockCount = await questionBlocks.count();
    const assistantText = normalizeText(
      await page.locator('[data-testid="agent-assistant-message"]').last().textContent(),
    );

    const phaseNames = chatNdjson.phases.map((event) => event.phase);
    const questionReadyCount = chatNdjson.questionBlocks.length;
    const firstQuestionStem = normalizeText(
      chatNdjson.questionBlocks[0]?.question?.stem ?? "",
    );
    const questionPrefix = firstQuestionStem.slice(0, 24);

    assert(
      preflightBody?.taskContext?.action === "generate_exercises",
      `preflight action 不正确：${preflightBody?.taskContext?.action ?? "unknown"}`,
    );
    assert(
      phaseNames.includes("candidate_generating"),
      "缺少 candidate_generating 阶段事件",
    );
    assert(
      phaseNames.includes("question_packaging"),
      "缺少 question_packaging 阶段事件",
    );
    assert(questionReadyCount > 0, "缺少 question-ready 题块事件");
    assert(questionBlockCount >= questionReadyCount, "页面题块数量少于流式题块数量");
    assert(
      questionPrefix.length >= 12,
      "流式返回的首题题干过短，无法做后续交叉验证",
    );

    const generatedQuestionBankPayload = await page.evaluate(async ({ keyword }) => {
      const response = await fetch(
        `/api/question-bank?q=${encodeURIComponent(keyword)}&sourceKind=agent_generated&limit=20`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      return await response.json();
    }, { keyword: runTag });

    const savedItems = Array.isArray(generatedQuestionBankPayload?.items)
      ? generatedQuestionBankPayload.items
      : [];
    assert(savedItems.length > 0, "题库中未找到本轮新生成习题");

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> taskContext.action",
      apiValue: preflightBody?.taskContext?.action ?? null,
      domValue: phaseNames.join(", "),
      pass:
        preflightBody?.taskContext?.action === "generate_exercises" &&
        phaseNames.includes("candidate_generating"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> question-ready 数量",
      apiValue: questionReadyCount,
      domValue: questionBlockCount,
      pass: questionBlockCount >= questionReadyCount && questionReadyCount > 0,
    });

    crossChecks.push({
      apiField: "GET /api/question-bank?q=runTag -> 命中条目",
      apiValue: savedItems.length,
      domValue: assistantText.slice(0, 120),
      pass: savedItems.length > 0 && assistantText.includes(runTag),
    });

    await page.goto(`${baseUrl}/main/question-bank`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByTestId("question-bank-search")
      .waitFor({ state: "visible", timeout: 60000 });
    await page.getByTestId("question-bank-search").fill(questionPrefix);
    await page.waitForFunction(
      (prefix) =>
        Array.from(
          document.querySelectorAll('[data-testid="question-bank-question-list"] button'),
        ).some((node) => node.textContent?.includes(prefix)),
      questionPrefix,
      { timeout: 30000 },
    );

    const questionCard = page
      .locator('[data-testid="question-bank-question-list"] button')
      .filter({ hasText: questionPrefix })
      .first();
    await questionCard.waitFor({ state: "visible", timeout: 30000 });
    await questionCard.click();
    await page.getByTestId("question-bank-detail").waitFor({
      state: "visible",
      timeout: 30000,
    });
    await page.waitForFunction(
      (prefix) => {
        const text =
          document
            .querySelector('[data-testid="question-bank-detail"]')
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? "";
        return text.includes(prefix) && !text.includes("正在读取详情...");
      },
      questionPrefix,
      { timeout: 30000 },
    );

    const detailText = normalizeText(
      await page.getByTestId("question-bank-detail").textContent(),
    );
    crossChecks.push({
      apiField: "GET /api/question-bank -> detail questionText",
      apiValue: questionPrefix,
      domValue: detailText,
      pass: detailText.includes(questionPrefix),
    });

    const preflightEvent = networkEvents.find(
      (item) => item.method === "POST" && item.url.includes("/api/agent/preflight"),
    );
    const chatEvent = networkEvents.find(
      (item) => item.method === "POST" && item.url.includes("/api/agent/chat"),
    );

    assert(static404s.length === 0, "存在静态资源 404");
    assert(consoleErrors.length === 0, "存在 console error");
    assert(pageErrors.length === 0, "存在 pageerror");
    assert(
      preflightEvent &&
        preflightEvent.status >= 200 &&
        preflightEvent.status < 300 &&
        preflightEvent.durationMs <= 30000,
      "preflight 请求失败或超过 30s",
    );
    assert(
      chatEvent &&
        chatEvent.status >= 200 &&
        chatEvent.status < 300 &&
        chatEvent.durationMs <= 30000,
      "chat 请求失败或超过 30s",
    );
    assert(crossChecks.every((item) => item.pass), "数据流交叉验证失败");

    const report = [
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
          `  - API 字段 ${item.apiField} -> DOM 文本 ${String(item.domValue)}: ${item.pass ? "PASS" : "FAIL"}`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ].join("\n");

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
      phases: phaseNames,
      questionReadyCount,
    });
    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
  } catch (error) {
    await fs.mkdir(artifactDir, { recursive: true });
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
      crossChecks,
    });
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      [
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
              `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(item.durationMs / 1000).toFixed(2)}s`,
          ),
        "- 错误统计:",
        `  - 静态资源 404: ${static404s.length}`,
        `  - console error: ${consoleErrors.length}`,
        `  - pageerror: ${pageErrors.length}`,
        "- 数据流交叉验证:",
        ...crossChecks.map(
          (item) =>
            `  - API 字段 ${item.apiField} -> DOM 文本 ${String(item.domValue)}: ${item.pass ? "PASS" : "FAIL"}`,
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
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
