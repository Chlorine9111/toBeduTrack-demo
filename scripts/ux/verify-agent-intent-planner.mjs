import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3002";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const vaguePrompt = "帮我处理一下 AP Biology 这个单元";
const seededExercisePrompt = "帮我出三道AP Biology习题";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();
const crossChecks = [];
const interactionChecks = [];

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  [
    "apikey",
    "access_token",
    "refresh_token",
    "token",
    "token_hash",
    "code",
    "redirect_to",
    "next",
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

function isSuccessfulNetworkEvent(item) {
  return item.status >= 200 && item.status < 300;
}

function recordNetwork(response) {
  const request = response.request();
  const url = request.url();
  if (!isTrackedApi(url)) return;

  const startedAt = requestStarts.get(request) ?? Date.now();
  networkEvents.push({
    method: request.method(),
    url: sanitizeUrl(url),
    status: response.status(),
    durationMs: Date.now() - startedAt,
  });
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForAssistantContent(page, minLength = 40, timeoutMs = 35000) {
  await page.waitForFunction(
    (expectedLength) => {
      const messages = Array.from(document.querySelectorAll('[data-testid="agent-assistant-message"]'));
      const last = messages.at(-1);
      const text = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return text.length >= expectedLength;
    },
    minLength,
    { timeout: timeoutMs },
  );
}

async function readLatestAssistantText(page) {
  return (
    await page.locator('[data-testid="agent-assistant-message"]').last().textContent()
  )?.trim() ?? "";
}

function hasClarificationCard(page) {
  return page
    .locator('[data-testid="agent-clarification-card"]')
    .isVisible()
    .catch(() => false);
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
    toolOutput:
      events
        .filter((event) => event?.type === "tool-result")
        .map((event) => event.output)
        .at(-1) ?? null,
  };
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
  });

  page.on("response", (response) => {
    recordNetwork(response);
    if (isStatic404(response)) {
      static404s.push({
        url: sanitizeUrl(response.url()),
        status: response.status(),
        resourceType: response.request().resourceType(),
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
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible", timeout: 60000 });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1200);
    console.log("[ux] loaded /main/agent");

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const vaguePreflightPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent/preflight")) return false;
      if (response.request().method() !== "POST") return false;
      const payload = response.request().postDataJSON?.();
      return payload?.message === vaguePrompt;
    }, { timeout: 120000 });
    console.log("[ux] send vague curriculum prompt");
    await composer.fill(vaguePrompt);
    await composer.press("Enter");
    const vaguePreflightResponse = await vaguePreflightPromise;
    const vaguePreflightPayload = await vaguePreflightResponse.json();
    console.log("[ux] vague preflight received");

    const clarificationCard = page.locator('[data-testid="agent-clarification-card"]');
    const clarificationQuestionNode = page.locator('[data-testid="agent-clarification-question"]');
    await clarificationCard.waitFor({ state: "visible", timeout: 15000 });
    const clarificationQuestion = (await clarificationQuestionNode.textContent())?.trim() ?? "";

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> question.question",
      apiValue: vaguePreflightPayload?.question?.question ?? null,
      domValue: clarificationQuestion,
      pass:
        typeof vaguePreflightPayload?.question?.question === "string" &&
        vaguePreflightPayload.question.question.trim() === clarificationQuestion,
    });

    interactionChecks.push({
      check: "课程上下文不完整时先追问 action，而不是回退去问学科",
      pass:
        vaguePreflightPayload?.status === "needs_info" &&
        vaguePreflightPayload?.question?.field === "action" &&
        !/学科|subject/i.test(clarificationQuestion),
      detail: JSON.stringify({
        status: vaguePreflightPayload?.status ?? null,
        field: vaguePreflightPayload?.question?.field ?? null,
        question: clarificationQuestion,
      }),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await page.locator('[data-testid="agent-reset-conversation"]').click();
    await page.waitForTimeout(800);
    await composer.waitFor({ state: "visible", timeout: 15000 });

    const seededPreflightPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent/preflight")) return false;
      if (response.request().method() !== "POST") return false;
      const payload = response.request().postDataJSON?.();
      return payload?.message === seededExercisePrompt;
    }, { timeout: 120000 });
    const seededChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST",
      { timeout: 90000 },
    );
    console.log("[ux] send seeded exercise prompt");
    await composer.fill(seededExercisePrompt);
    await composer.press("Enter");
    const seededPreflightResponse = await seededPreflightPromise;
    const seededPreflightPayload = await seededPreflightResponse.json();
    console.log("[ux] seeded exercise preflight received");
    const seededChatResponse = await seededChatPromise;
    console.log("[ux] seeded exercise chat response received");
    const seededResult = await readNdjsonResponse(seededChatResponse);
    const seededChatText = seededResult.text;
    const seededToolOutput = seededResult.toolOutput;
    await page.waitForFunction(
      () => {
        const messages = Array.from(document.querySelectorAll('[data-testid="agent-assistant-message"]'));
        const last = messages.at(-1);
        const text = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return text.includes("真实保存") || text.includes("请求/通过：3/3") || text.includes("单元：Unit 3");
      },
      null,
      { timeout: 90000 },
    );
    await page.waitForTimeout(1200);
    const seededAssistantText = await readLatestAssistantText(page);

    interactionChecks.push({
      check: "AP Biology 习题请求会沿用本地 seed 自动补全到唯一 Unit，并直接生成 3 道题",
      pass:
        seededPreflightPayload?.status === "ready" &&
        !(await hasClarificationCard(page)) &&
        !/哪门 AP 课程|哪个 Unit|希望题目落在哪个 Unit/i.test(seededChatText) &&
        !/哪门 AP 课程|哪个 Unit|希望题目落在哪个 Unit/i.test(seededAssistantText) &&
        /课程：AP Biology/i.test(seededAssistantText) &&
        /单元：Unit 3/i.test(seededAssistantText) &&
        /已.*真实保存 3 道题到数据库/i.test(seededAssistantText) &&
        /请求\/通过：3\/3/i.test(seededAssistantText) &&
        !/待补齐/i.test(seededAssistantText),
      detail: JSON.stringify({
        preflightStatus: seededPreflightPayload?.status ?? null,
        chatSnippet: seededChatText.slice(0, 220),
        toolMetrics: seededToolOutput?.metrics ?? null,
      }),
    });

    const apiUnitOrTopic = /课程：AP Biology/i.test(seededChatText)
      ? "课程：AP Biology"
      : /单元：Unit 3/i.test(seededChatText)
        ? "单元：Unit 3"
        : null;
    crossChecks.push({
      apiField: "POST /api/agent/chat -> response text contains inferred curriculum",
      apiValue: apiUnitOrTopic,
      domValue: seededAssistantText,
      pass:
        Boolean(apiUnitOrTopic) &&
        seededAssistantText.includes(apiUnitOrTopic),
    });

    const metrics = seededToolOutput?.metrics ?? null;
    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolOutput.metrics",
      apiValue: metrics ? `${metrics.passed}/${metrics.requested}` : null,
      domValue: seededAssistantText,
      pass:
        metrics?.requested === 3 &&
        metrics?.passed === 3 &&
        metrics?.shortfall === 0 &&
        /请求\/通过：3\/3/i.test(chainRuleAssistantText),
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

    const keyRequests = networkEvents.filter(
      (item) => item.url.includes("/api/agent/preflight") || item.url.includes("/api/agent/chat"),
    );

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      keyRequests.length > 0 &&
      keyRequests.every(isSuccessfulNetworkEvent) &&
      keyRequests.every((item) => item.durationMs <= 30000) &&
      crossChecks.length > 0 &&
      crossChecks.every((item) => item.pass) &&
      interactionChecks.every((item) => item.pass);

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      `- 最终结论: ${pass ? "PASS" : "FAIL"}`,
      "- 验证方式: Playwright 浏览器真实联调（DevTools MCP 本机 Transport closed，按项目规则切到稳定替代路径）",
      "- 关键接口耗时:",
      ...keyRequests.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (check) =>
          `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${
            check.pass ? "PASS" : "FAIL"
          }`,
      ),
      "- 交互校验:",
      ...interactionChecks.map(
        (check) => `  - ${check.check}: ${check.pass ? "PASS" : "FAIL"} (${check.detail})`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");

    if (!pass) {
      throw new Error("UX 验证未通过");
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
