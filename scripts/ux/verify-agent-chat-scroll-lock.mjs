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
const prompt = "你好，请简单介绍一下你能做什么";
const mockedChatText = "我可以帮你生成教案、习题、评分标准，并整理上传材料。";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const interactionChecks = [];
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

async function captureScrollMetrics(page) {
  return page.evaluate(() => {
    const scrollEl = document.querySelector('[data-testid="agent-message-scroll"]');
    const stackEl = document.querySelector('[data-testid="agent-message-stack"]');
    const latestAssistant = document
      .querySelectorAll('[data-testid="agent-assistant-message"]')
      .item(document.querySelectorAll('[data-testid="agent-assistant-message"]').length - 1);

    const scrollElement =
      scrollEl instanceof HTMLElement
        ? {
            clientHeight: scrollEl.clientHeight,
            scrollHeight: scrollEl.scrollHeight,
            scrollTop: scrollEl.scrollTop,
            rectTop: scrollEl.getBoundingClientRect().top,
            rectBottom: scrollEl.getBoundingClientRect().bottom,
          }
        : null;

    const stackElement =
      stackEl instanceof HTMLElement
        ? {
            clientHeight: stackEl.clientHeight,
            scrollHeight: stackEl.scrollHeight,
            rectTop: stackEl.getBoundingClientRect().top,
            rectBottom: stackEl.getBoundingClientRect().bottom,
          }
        : null;

    const assistantText =
      latestAssistant instanceof HTMLElement
        ? latestAssistant.innerText.replace(/\s+/g, " ").trim()
        : "";

    return {
      windowScrollY: window.scrollY,
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      innerHeight: window.innerHeight,
      scrollElement,
      stackElement,
      assistantText,
    };
  });
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
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        status: "ready",
        summary: "已整理请求，开始回答。",
        enrichedPrompt: prompt,
        taskContext: {
          kind: "general",
          action: "chat",
          mode: "fresh",
          normalizedRequest: prompt,
          retrievalQuery: prompt,
          sourcePriority: ["当前教师输入"],
        },
      }),
    });
  });

  await page.route("**/api/agent/chat", async (route) => {
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
    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const preflightPromise = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST"
      );
    });

    const chatPromise = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST"
      );
    });

    await composer.fill(prompt);
    await composer.press("Enter");

    await preflightPromise;
    await page.locator('[data-testid="agent-message-scroll"]').waitFor({ state: "visible", timeout: 20000 });
    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await chatPromise;
    await page.locator('[data-testid="agent-assistant-message"]').last().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForFunction(
      (text) => {
        const nodes = Array.from(document.querySelectorAll('[data-testid="agent-assistant-message"]'));
        const last = nodes.at(-1);
        const content = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return content.includes(text);
      },
      mockedChatText,
      { timeout: 20000 },
    );

    const beforeScrollAttempt = await captureScrollMetrics(page);

    const scrollContainer = page.locator('[data-testid="agent-message-scroll"]');
    await scrollContainer.hover();
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(600);

    const afterScrollAttempt = await captureScrollMetrics(page);
    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const extraScrollableSpace =
      (afterScrollAttempt.scrollElement?.scrollHeight ?? 0) -
      (afterScrollAttempt.scrollElement?.clientHeight ?? 0);

    interactionChecks.push({
      check: "进入对话态后页面根节点不会出现额外向下滚动",
      pass:
        beforeScrollAttempt.windowScrollY === 0 &&
        afterScrollAttempt.windowScrollY === 0 &&
        afterScrollAttempt.documentScrollHeight <= afterScrollAttempt.innerHeight + 1 &&
        afterScrollAttempt.bodyScrollHeight <= afterScrollAttempt.innerHeight + 1,
      detail: JSON.stringify({
        beforeWindowScrollY: beforeScrollAttempt.windowScrollY,
        afterWindowScrollY: afterScrollAttempt.windowScrollY,
        documentScrollHeight: afterScrollAttempt.documentScrollHeight,
        innerHeight: afterScrollAttempt.innerHeight,
      }),
    });

    interactionChecks.push({
      check: "消息区在短对话场景下不会生成可拖出大片空白的额外滚动高度",
      pass:
        extraScrollableSpace <= 2 &&
        (afterScrollAttempt.scrollElement?.scrollTop ?? 0) === 0,
      detail: JSON.stringify({
        extraScrollableSpace,
        scrollTop: afterScrollAttempt.scrollElement?.scrollTop ?? null,
      }),
    });

    interactionChecks.push({
      check: "结果出现后输入框仍固定在底部可见",
      pass: (afterScrollAttempt.scrollElement?.rectBottom ?? 0) < afterScrollAttempt.innerHeight,
      detail: JSON.stringify({
        scrollBottom: afterScrollAttempt.scrollElement?.rectBottom ?? null,
        innerHeight: afterScrollAttempt.innerHeight,
      }),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> text",
      domText: afterScrollAttempt.assistantText,
      pass: afterScrollAttempt.assistantText.includes(mockedChatText),
    });

    assert(static404s.length === 0, `静态资源 404 不为 0: ${static404s.length}`);
    assert(consoleErrors.length === 0, `console error 不为 0: ${consoleErrors.length}`);
    assert(pageErrors.length === 0, `pageerror 不为 0: ${pageErrors.length}`);

    const criticalApis = networkEvents.filter((event) =>
      event.url.includes("/api/agent/preflight") || event.url.includes("/api/agent/chat"),
    );
    assert(
      criticalApis.length >= 2 && criticalApis.every((event) => event.status >= 200 && event.status < 300),
      "关键 API 未全部成功",
    );
    assert(
      criticalApis.every((event) => event.durationMs <= 30000),
      "关键生成接口超过 30s",
    );
    assert(interactionChecks.every((check) => check.pass), "滚动交互断言失败");
    assert(crossChecks.length >= 1 && crossChecks.every((item) => item.pass), "数据流交叉验证失败");

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: PASS
- 关键接口耗时:
${criticalApis.map((event) => `  - ${event.method} ${new URL(event.url).pathname}: ${event.durationMs}ms`).join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domText}\`: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 交互验证:
${interactionChecks.map((item) => `  - ${item.check}: ${item.pass ? "PASS" : "FAIL"} (${item.detail})`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
  } catch (error) {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents).catch(() => {});
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
