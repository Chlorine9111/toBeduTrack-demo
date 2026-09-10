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
const longPrompt = "先给我一段很长的复习说明";
const targetPrompt = "帮我生成3道chainrule习题";
const longAssistantText = `这是一段用于复现 preflight 长上下文问题的超长说明。${"链式法则复习重点，".repeat(140)}`;
const finalAssistantText = "已开始生成 3 道 Chain Rule 习题。";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const interactionChecks = [];
const requestStarts = new WeakMap();

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  ["apikey", "access_token", "refresh_token", "token", "conversationId"].forEach(
    (key) => url.searchParams.delete(key),
  );
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

  let preflightCount = 0;
  let chatCount = 0;
  let capturedSecondPreflight = null;

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
    const body = route.request().postDataJSON();
    if (preflightCount === 1) {
      capturedSecondPreflight = body;
    }
    preflightCount += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        status: "ready",
        summary:
          preflightCount === 1
            ? "开始准备第一轮说明。"
            : "已补全关键偏好：生成练习题 · 3 道题。开始执行。",
        collectedAnswers: preflightCount === 1 ? {} : { action: "generate_exercises", count: "3" },
        enrichedPrompt: body?.message ?? "",
      }),
    });
  });

  await page.route("**/api/agent/chat", async (route) => {
    chatCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: chatCount === 1 ? longAssistantText : finalAssistantText,
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

    await composer.fill(longPrompt);
    await composer.press("Enter");
    await waitForLatestAssistantText(page, "这是一段用于复现 preflight 长上下文问题的超长说明", 20000);

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await composer.fill(targetPrompt);
    await composer.press("Enter");
    await waitForLatestAssistantText(page, finalAssistantText, 20000);

    const lastAssistantText =
      (await page.locator('[data-testid="agent-assistant-message"]').last().textContent())?.trim() ?? "";

    const contextLines = Array.isArray(capturedSecondPreflight?.conversationContext)
      ? capturedSecondPreflight.conversationContext
      : [];
    const longestLine = contextLines.reduce(
      (max, line) => Math.max(max, typeof line === "string" ? line.length : 0),
      0,
    );

    interactionChecks.push({
      check: "第二次 preflight 在长历史上下文下仍成功返回",
      pass: preflightCount >= 2,
      detail: JSON.stringify({ preflightCount }),
    });

    interactionChecks.push({
      check: "第二次 preflight 发送的 conversationContext 已截断到 600 字以内",
      pass: contextLines.length > 0 && longestLine <= 600,
      detail: JSON.stringify({ longestLine, lineCount: contextLines.length }),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> mocked text",
      apiValue: finalAssistantText,
      domValue: lastAssistantText,
      pass: lastAssistantText.includes(finalAssistantText),
    });

    assert(contextLines.length > 0, "未捕获第二次 preflight 的 conversationContext");
    assert(longestLine <= 600, `conversationContext 仍然超过 600 字，当前 ${longestLine}`);
    assert(lastAssistantText.includes(finalAssistantText), "页面未显示第二次 chat 的可见结果");

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

  const hasNetworkFailure = networkEvents.some((item) => item.status < 200 || item.status >= 300);
  const pass =
    static404s.length === 0 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    !hasNetworkFailure &&
    crossChecks.every((item) => item.pass) &&
    interactionChecks.every((item) => item.pass);

  const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 关键接口耗时:
${networkEvents
  .map((item) => `  - ${item.method} ${new URL(item.url).pathname}: ${item.durationMs}ms`)
  .join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks
  .map(
    (item) =>
      `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domValue}\`: ${item.pass ? "PASS" : "FAIL"}`,
  )
  .join("\n")}
- 交互检查:
${interactionChecks
  .map((item) => `  - ${item.check}: ${item.pass ? "PASS" : "FAIL"} (${item.detail})`)
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
    process.exit(1);
  }
}

run().catch(async (error) => {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    `## UX 验证报告\n\n- 验证级别: L1\n- 最终结论: FAIL\n- 失败原因: ${error instanceof Error ? error.message : String(error)}\n- 产物目录:\n  - ${artifactDir}\n`,
    "utf8",
  );
  process.exit(1);
});
