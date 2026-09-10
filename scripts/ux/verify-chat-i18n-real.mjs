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
    url.includes("/api/agent/chat") ||
    url.includes("/api/content-library") ||
    url.includes("/api/curriculum/options") ||
    url.includes("/auth/v1/token")
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

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
  });
  const page = await context.newPage();

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

  let profilePayload = null;
  let preflightPayload = null;

  try {
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });

    await page.locator('[data-testid="auth-panel-locale-toggle"]').click();
    await page.getByRole("heading", { name: "Welcome back" }).waitFor({ state: "visible" });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await page.waitForURL((url) => url.pathname === "/main/agent");
    await page.waitForLoadState("networkidle");

    profilePayload = await page.evaluate(async () => {
      const response = await fetch("/api/account/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });

    const welcomeHeading = page.getByRole("heading", { level: 1 });
    await welcomeHeading.waitFor({ state: "visible" });
    const welcomeText = (await welcomeHeading.textContent()) ?? "";
    crossChecks.push({
      apiField: "GET /api/account/profile -> profile.displayName",
      apiValue: profilePayload?.profile?.displayName ?? null,
      domValue: welcomeText,
      pass:
        typeof profilePayload?.profile?.displayName === "string" &&
        welcomeText.includes(profilePayload.profile.displayName),
    });

    const sidebar = page.locator("aside").first();
    await sidebar.getByRole("button", { name: "Chat", exact: true }).waitFor({ state: "visible" });
    await sidebar.getByRole("button", { name: "Library", exact: true }).waitFor({ state: "visible" });
    await sidebar.getByRole("button", { name: "Settings", exact: true }).waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const activeChatButton = sidebar.getByRole("button", { name: "Chat", exact: true });
    const networkCountBeforeChatClick = networkEvents.length;
    const urlBeforeChatClick = page.url();
    assert(await activeChatButton.isDisabled(), "当前页的 Chat 按钮未禁用");
    await activeChatButton.click({ force: true });
    await page.waitForTimeout(500);
    const chatRequestCountAfterClick = networkEvents.length;
    interactionChecks.push({
      check: "当前页 Chat 按钮点击不再闪动或重复导航",
      pass: page.url() === urlBeforeChatClick && chatRequestCountAfterClick === networkCountBeforeChatClick,
      detail: `before=${networkCountBeforeChatClick}, after=${chatRequestCountAfterClick}, url=${page.url()}`,
    });

    const quickTag = page.locator('[data-testid="agent-quick-tag-questions"]');
    await quickTag.waitFor({ state: "visible" });
    const trackedBeforeQuickTag = networkEvents.filter(
      (item) => item.url.includes("/api/agent/preflight") || item.url.includes("/api/agent/chat"),
    ).length;
    await quickTag.click();
    await page.waitForTimeout(400);
    const trackedAfterQuickTag = networkEvents.filter(
      (item) => item.url.includes("/api/agent/preflight") || item.url.includes("/api/agent/chat"),
    ).length;
    const composer = page.locator('[data-testid="agent-composer"]').first();
    const quickTagValue = await composer.inputValue();
    const quickTagStyles = await quickTag.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });

    interactionChecks.push({
      check: "快捷按钮点击后仅高亮并填充 prompt，不直接发请求",
      pass:
        trackedBeforeQuickTag === trackedAfterQuickTag &&
        quickTagValue.toLowerCase().includes("generate practice questions") &&
        quickTagStyles.backgroundColor !== "rgba(0, 0, 0, 0)",
      detail: JSON.stringify({
        before: trackedBeforeQuickTag,
        after: trackedAfterQuickTag,
        quickTagValue,
        quickTagStyles,
      }),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await composer.fill("Generate practice questions for my next AP Biology lesson.");

    const preflightResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
    );
    await composer.press("Enter");
    const preflightResponse = await preflightResponsePromise;
    preflightPayload = await preflightResponse.json();

    const clarificationCard = page.locator('[data-testid="agent-clarification-card"]');
    await clarificationCard.waitFor({ state: "visible" });
    const clarificationQuestion = (
      await page.locator('[data-testid="agent-clarification-question"]').textContent()
    )?.trim() ?? "";

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> question.question",
      apiValue: preflightPayload?.question?.question ?? null,
      domValue: clarificationQuestion,
      pass:
        typeof preflightPayload?.question?.question === "string" &&
        preflightPayload.question.question.trim() === clarificationQuestion,
    });

    interactionChecks.push({
      check: "习题前置追问不再固定问数量，而是根据缺失上下文追问",
      pass:
        !/how many questions|多少道题/i.test(clarificationQuestion) &&
        /unit|course|课程|单元/i.test(clarificationQuestion),
      detail: clarificationQuestion,
    });

    await page.locator('[data-testid="agent-reset-conversation"]').click();
    await page.waitForTimeout(400);

    await composer.fill("Generate 5 AP Biology Unit 3 ATP practice questions in markdown.");
    const readyPreflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
    );
    const agentChatResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST",
      { timeout: 35000 },
    );
    await composer.press("Enter");
    const readyPreflightResponse = await readyPreflightPromise;
    const readyPreflightPayload = await readyPreflightResponse.json();
    interactionChecks.push({
      check: "信息足够具体时不再生成 follow question",
      pass: readyPreflightPayload?.status === "ready",
      detail: JSON.stringify({
        status: readyPreflightPayload?.status ?? null,
        summary: readyPreflightPayload?.summary ?? null,
      }),
    });
    await page.waitForTimeout(800);
    assert(
      !(await page.locator('[data-testid="agent-clarification-card"]').isVisible().catch(() => false)),
      "具体习题请求仍然出现了追问卡片",
    );
    await agentChatResponsePromise;

    await page.locator('[data-testid="agent-assistant-message"]').last().waitFor({ state: "visible" });
    await page.waitForTimeout(1500);

    const activeComposer = page.locator("textarea").last();
    await activeComposer.fill(
      "Reply with a Markdown heading, two bullet points, and the formula $E=mc^2$. Keep it concise.",
    );
    const markdownChatResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST",
      { timeout: 35000 },
    );
    await activeComposer.press("Enter");
    await markdownChatResponsePromise;

    const lastAssistantMessage = page.locator('[data-testid="agent-assistant-message"]').last();
    await lastAssistantMessage.locator(".katex").waitFor({ state: "visible", timeout: 35000 });
    await lastAssistantMessage.getByRole("heading", { level: 2 }).waitFor({ state: "visible" });
    const listItems = lastAssistantMessage.locator("li");
    assert((await listItems.count()) >= 2, "Markdown 列表未渲染为可见列表");
    interactionChecks.push({
      check: "assistant 消息支持 Markdown 与 LaTeX 渲染",
      pass: true,
      detail: "检测到 h2、li 和 .katex 元素",
    });

    await sidebar.getByRole("button", { name: "Library", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/main/library");
    await page.getByRole("heading", { name: "Content Library" }).waitFor({ state: "visible" });

    await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/main/settings");
    await page.getByRole("heading", { name: "Account & Security" }).waitFor({ state: "visible" });

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
      (item) =>
        item.url.includes("/api/agent/preflight") ||
        item.url.includes("/api/agent/chat") ||
        item.url.includes("/api/account/profile") ||
        item.url.includes("/api/content-library"),
    );

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      keyRequests.every(isSuccessfulNetworkEvent) &&
      keyRequests
        .filter((item) => item.url.includes("/api/agent/preflight") || item.url.includes("/api/agent/chat"))
        .every((item) => item.durationMs <= 30000) &&
      crossChecks.length > 0 &&
      crossChecks.every((item) => item.pass) &&
      interactionChecks.every((item) => item.pass);

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      `- 最终结论: ${pass ? "PASS" : "FAIL"}`,
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
