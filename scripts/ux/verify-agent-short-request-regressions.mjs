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
const skipLogin = process.env.UX_SKIP_LOGIN === "1";
const firstPrompt = process.env.UX_FIRST_PROMPT ?? "帮我生成一道chainrule习题";
const secondPrompt = process.env.UX_SECOND_PROMPT ?? "中文教案";

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
    url.includes("/api/agent/chat")
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

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseUiStreamEvents(raw) {
  return raw
    .split("\n\n")
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/\r$/, "").trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim(),
    )
    .filter((payload) => payload && payload !== "[DONE]")
    .flatMap((payload) => {
      try {
        return [JSON.parse(payload)];
      } catch {
        return [];
      }
    });
}

function parseNdjsonEvents(raw) {
  return raw
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
}

async function readAgentStreamResponse(response) {
  const raw = await response.text().catch(() => "");
  const headers = response.headers();
  const contentType = headers["content-type"] ?? "";
  const uiStreamVersion = headers["x-vercel-ai-ui-message-stream"] ?? "";
  const events =
    contentType.includes("text/event-stream") || uiStreamVersion === "v1"
      ? parseUiStreamEvents(raw)
      : parseNdjsonEvents(raw);

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
          typeof event.toolName === "string",
      )
      .map((event) => event.toolName),
    toolResults: events
      .filter((event) => event?.type === "tool-result" && typeof event.toolName === "string")
      .map((event) => ({
        toolName: event.toolName,
        output: event.output ?? null,
      })),
  };
}

async function waitForLatestAssistant(page, predicate, timeout = 120000) {
  await page.waitForFunction(
    ({ text }) => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid="agent-assistant-message"]'),
      );
      const last = nodes.at(-1);
      const content = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return content.includes(text);
    },
    { text: predicate },
    { timeout },
  );
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });
  console.log("[verify] start");

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
    if (skipLogin) {
      await page.goto(`${baseUrl}/main/agent`, { waitUntil: "domcontentloaded" });
    } else {
      await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
      await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible", timeout: 60000 });
      await page.locator("#login-email").fill(loginEmail);
      await page.locator("#login-password").fill(loginPassword);

      await Promise.all([
        page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
        page.getByRole("button", { name: /^登录$/ }).click(),
      ]);
    }

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });
    console.log("[verify] composer-ready");

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const firstPreflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );
    const firstChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 150000 },
    );

    await composer.fill(firstPrompt);
    await composer.press("Enter");

    const firstPreflightResponse = await firstPreflightPromise;
    const firstPreflightBody = await firstPreflightResponse.json().catch(() => null);
    assert(
      firstPreflightBody?.status === "ready",
      `首轮 preflight 未 ready：${JSON.stringify(firstPreflightBody ?? {})}`,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const firstChatResponse = await firstChatPromise;
    const firstChatStream = await readAgentStreamResponse(firstChatResponse);
    const firstQuestionBlock = page.locator('[data-testid="agent-question-block"]').first();
    await firstQuestionBlock.waitFor({ state: "visible", timeout: 120000 });
    console.log("[verify] first-question-visible");
    const firstQuestionText = normalizeText(await firstQuestionBlock.textContent());
    const firstAssistantText = normalizeText(
      await page.locator('[data-testid="agent-assistant-message"]').last().textContent(),
    );

    assert(
      !firstAssistantText.includes('data: {"type"'),
      "首轮 assistant 消息仍显示了原始 SSE data 行",
    );
    assert(
      firstQuestionText.includes("第 1 题"),
      `首轮页面未正常展示习题题块：${firstQuestionText}`,
    );

    const secondPreflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );
    await composer.fill(secondPrompt);
    await composer.press("Enter");

    const secondPreflightResponse = await secondPreflightPromise;
    const secondPreflightBody = await secondPreflightResponse.json().catch(() => null);
    console.log("[verify] second-preflight-needs-info");
    assert(
      secondPreflightBody?.status === "needs_info",
      `第二轮中文教案应先追问具体主题：${JSON.stringify(secondPreflightBody ?? {})}`,
    );
    assert(
      secondPreflightBody?.question?.field === "topic",
      `第二轮追问字段应为 topic：${JSON.stringify(secondPreflightBody ?? {})}`,
    );
    const optionLabels = (secondPreflightBody?.question?.options ?? []).map((option) =>
      normalizeText(option.label),
    );
    assert(
      optionLabels.includes("古诗词鉴赏") &&
        optionLabels.includes("现代文阅读") &&
        optionLabels.includes("议论文写作"),
      `第二轮追问选项不够具体：${JSON.stringify(optionLabels)}`,
    );
    assert(
      optionLabels.every(
        (label) =>
          !["中文", "语文", "当前章节重点", "课堂小测重点"].includes(label),
      ),
      `第二轮追问仍包含会导致循环的泛选项：${JSON.stringify(optionLabels)}`,
    );

    const clarificationQuestion = page
      .locator('[data-testid="agent-clarification-question"]')
      .last();
    await clarificationQuestion.waitFor({ state: "visible", timeout: 30000 });
    const clarificationText = normalizeText(await clarificationQuestion.textContent());
    assert(
      /哪篇课文|哪个主题|能力点/.test(clarificationText),
      `第二轮页面追问文案不正确：${clarificationText}`,
    );

    const followupPreflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );
    const secondChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 150000 },
    );
    await page.locator('[data-testid="agent-clarification-option-A"]').click();
    console.log("[verify] clarification-option-clicked");

    const followupPreflightResponse = await followupPreflightPromise;
    const followupPreflightBody = await followupPreflightResponse.json().catch(() => null);
    console.log("[verify] followup-preflight-ready");
    assert(
      followupPreflightBody?.status === "ready",
      `第二轮补充具体主题后应 ready：${JSON.stringify(followupPreflightBody ?? {})}`,
    );
    assert(
      followupPreflightBody?.taskContext?.action === "lesson_plan",
      `第二轮 taskContext.action 不是 lesson_plan：${JSON.stringify(followupPreflightBody ?? {})}`,
    );

    const secondChatResponse = await secondChatPromise;
    const secondChatStream = await readAgentStreamResponse(secondChatResponse);
    await waitForLatestAssistant(page, "教学目标", 120000);
    console.log("[verify] lesson-visible");
    const secondAssistantText = normalizeText(
      await page.locator('[data-testid="agent-assistant-message"]').last().textContent(),
    );

    assert(
      !secondAssistantText.includes('data: {"type"'),
      "第二轮 assistant 消息仍显示了原始 SSE data 行",
    );
    assert(
      !/chain\s*rule|AP Calculus|微积分/i.test(secondAssistantText),
      `第二轮教案结果仍混入上一轮 chain rule/微积分 上下文：${secondAssistantText.slice(0, 160)}`,
    );
    assert(
      secondAssistantText.includes("教案"),
      "第二轮页面未展示教案结果",
    );

    crossChecks.push({
      apiField: "POST /api/agent/chat 首轮 -> toolResult.output.passed",
      apiValue:
        firstChatStream.toolResults.find(
          (item) => item.toolName === "generate_ap_exercises_pipeline",
        )?.output?.passed ?? null,
      domValue: firstQuestionText.slice(0, 80),
      pass:
        firstChatStream.toolResults.find(
          (item) => item.toolName === "generate_ap_exercises_pipeline",
        )?.output?.passed === 1 && firstQuestionText.includes("第 1 题"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/preflight(补充主题后) -> taskContext.action",
      apiValue: followupPreflightBody?.taskContext?.action ?? null,
      domValue: secondAssistantText.slice(0, 120),
      pass:
        followupPreflightBody?.taskContext?.action === "lesson_plan" &&
        !/chain\s*rule|AP Calculus|微积分/i.test(secondAssistantText),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat 第二轮 -> text",
      apiValue: normalizeText(secondChatStream.text).slice(0, 120),
      domValue: secondAssistantText.slice(0, 120),
      pass:
        secondAssistantText.includes("教案") &&
        !secondAssistantText.includes('data: {"type"'),
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

    const trackedRequests = networkEvents.filter(
      (item) =>
        item.url.includes("/api/agent/preflight") || item.url.includes("/api/agent/chat"),
    );
    const report = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      ...trackedRequests.map(
        (entry) => `  - ${entry.method} ${entry.url.replace(baseUrl, "")}: ${(entry.durationMs / 1000).toFixed(2)}s`,
      ),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (item) =>
          `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${String(item.domValue).slice(0, 120)}\`: ${item.pass ? "PASS" : "FAIL"}`,
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
    assert(
      trackedRequests.length >= 4 &&
        trackedRequests.every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000),
      "关键接口失败或耗时超过 30s",
    );
    assert(crossChecks.every((item) => item.pass), "数据流交叉验证失败");
  } catch (error) {
    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    }).catch(() => {});
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
            `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${String(item.domValue).slice(0, 120)}\`: ${item.pass ? "PASS" : "FAIL"}`,
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
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
