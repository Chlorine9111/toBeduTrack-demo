import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3003";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const prompt = "帮我出 3 道 AP Biology Unit 3 习题";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const interactionChecks = [];
const requestStarts = new WeakMap();

let capturedChatPayload = null;
let mockedPreflightTaskContext = null;
let mockedChatText = "";

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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function waitForLatestAssistantText(page, expectedText, timeout = 15000) {
  await page.waitForFunction(
    (text) => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid="agent-assistant-message"]'),
      );
      const last = nodes.at(-1);
      const content = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return content.includes(text);
    },
    expectedText,
    { timeout },
  );
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
    const request = response.request();
    const url = request.url();
    if (isTrackedApi(url)) {
      const startedAt = requestStarts.get(request) ?? Date.now();
      networkEvents.push({
        method: request.method(),
        url: sanitizeUrl(url),
        status: response.status(),
        durationMs: Date.now() - startedAt,
      });
    }
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

  await page.route("**/api/agent/preflight", async (route) => {
    mockedPreflightTaskContext = {
      kind: "exercise",
      action: "generate_exercises",
      mode: "fresh",
      normalizedRequest:
        "任务类型：习题；任务目标：生成练习题；课程/单元：AP Biology Unit 3；数量：3；教师原话：帮我出 3 道 AP Biology Unit 3 习题",
      retrievalQuery: "AP Biology Unit 3 generate exercises 3 questions",
      sourcePriority: ["当前教师输入", "教师知识库与长期记忆", "最近对话上下文"],
      curriculum: "AP Biology Unit 3",
      topic: "",
      scope: "",
      count: "3",
      duration: "",
      attachmentsSummary: "",
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        status: "ready",
        summary: "已补全关键偏好：生成练习题 · 3 道题 · AP Biology Unit 3。开始执行。",
        collectedAnswers: {
          action: "generate_exercises",
          count: "3",
          curriculum: "AP Biology Unit 3",
        },
        enrichedPrompt:
          `${prompt}\n\n【前置补充说明】\n- 任务目标：生成练习题\n- 输出数量：3 道\n- 课程 / 单元：AP Biology Unit 3`,
        taskContext: mockedPreflightTaskContext,
      }),
    });
  });

  await page.route("**/api/agent/chat", async (route) => {
    capturedChatPayload = route.request().postDataJSON?.() ?? null;
    mockedChatText = "已按标准化请求开始生成 AP Biology Unit 3 的 3 道习题。";
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: mockedChatText,
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
    await page.waitForTimeout(1200);

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const preflightPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent/preflight")) return false;
      if (response.request().method() !== "POST") return false;
      const payload = response.request().postDataJSON?.();
      return payload?.message === prompt;
    }, { timeout: 120000 });

    const chatPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent/chat")) return false;
      return response.request().method() === "POST";
    }, { timeout: 120000 });

    await composer.fill(prompt);
    await composer.press("Enter");

    await preflightPromise;
    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await chatPromise;
    await waitForLatestAssistantText(page, mockedChatText, 20000);
    const latestAssistantText =
      (await page.locator('[data-testid="agent-assistant-message"]').last().textContent())?.trim() ?? "";

    interactionChecks.push({
      check: "preflight 产出的 taskContext 已随正式 chat 请求带入后端",
      pass:
        Boolean(capturedChatPayload?.taskContext) &&
        capturedChatPayload.taskContext?.kind === mockedPreflightTaskContext?.kind &&
        capturedChatPayload.taskContext?.action === mockedPreflightTaskContext?.action &&
        capturedChatPayload.taskContext?.normalizedRequest === mockedPreflightTaskContext?.normalizedRequest,
      detail: JSON.stringify({
        carriedKind: capturedChatPayload?.taskContext?.kind ?? null,
        carriedAction: capturedChatPayload?.taskContext?.action ?? null,
      }),
    });

    interactionChecks.push({
      check: "chat 请求继续保留原始教师输入和结构化任务快照，不会只剩 enriched prompt",
      pass:
        capturedChatPayload?.displayMessage === prompt &&
        typeof capturedChatPayload?.message === "string" &&
        capturedChatPayload.message.includes("【前置补充说明】"),
      detail: JSON.stringify({
        displayMessage: capturedChatPayload?.displayMessage ?? null,
        hasEnrichedPrompt:
          typeof capturedChatPayload?.message === "string" &&
          capturedChatPayload.message.includes("【前置补充说明】"),
      }),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> mocked text",
      apiValue: mockedChatText,
      domValue: latestAssistantText,
      pass: latestAssistantText.includes(mockedChatText),
    });

    assert(capturedChatPayload?.taskContext, "未捕获 chat 请求里的 taskContext");
    assert(
      capturedChatPayload.taskContext.normalizedRequest === mockedPreflightTaskContext.normalizedRequest,
      "chat 请求未正确携带标准化任务描述",
    );
    assert(latestAssistantText.includes(mockedChatText), "页面未显示最终返回结果");

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }

  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), {
    static404s,
    consoleErrors,
    pageErrors,
  });

  const keyRequests = networkEvents.filter(
    (item) =>
      item.url.includes("/api/agent/preflight") ||
      item.url.includes("/api/agent/chat") ||
      item.url.includes("/api/account/profile") ||
      item.url.includes("/api/chat/conversations"),
  );

  const pass =
    static404s.length === 0 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    keyRequests.length > 0 &&
    keyRequests.every((item) => item.status >= 200 && item.status < 300) &&
    keyRequests.every((item) => item.durationMs <= 30000) &&
    crossChecks.length > 0 &&
    crossChecks.every((item) => item.pass) &&
    interactionChecks.every((item) => item.pass);

  const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 关键接口耗时:
${keyRequests
  .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`)
  .join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks
  .map(
    (check) =>
      `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${
        check.pass ? "PASS" : "FAIL"
      }`,
  )
  .join("\n")}
- 交互校验:
${interactionChecks
  .map(
    (check) =>
      `  - ${check.check}: ${check.pass ? "PASS" : "FAIL"} (${check.detail})`,
  )
  .join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

  await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");

  if (!pass) {
    throw new Error("UX 验证未通过");
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
