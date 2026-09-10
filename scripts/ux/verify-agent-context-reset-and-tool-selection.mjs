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
const seedPrompt = "请先帮我总结 AP Calculus Chain Rule 的课堂易错点";
const researchPrompt = "重新开始，帮我查一下 AP History DBQ 最新评分趋势并给来源";

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
    toolCalls: events
      .filter(
        (event) =>
          (event?.type === "tool-call" ||
            event?.type === "tool-input-available" ||
            event?.type === "tool-output-available") &&
          typeof event.toolName === "string",
      )
      .map((event) => event.toolName),
  };
}

async function waitForLatestAssistantText(page, predicate, timeout = 90000) {
  await page.waitForFunction(
    (matcherSource) => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid="agent-assistant-message"]'),
      );
      const last = nodes.at(-1);
      const text = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      // eslint-disable-next-line no-new-func
      const matcher = new Function("text", `return (${matcherSource})(text);`);
      return Boolean(matcher(text));
    },
    predicate.toString(),
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
    preflightCount += 1;
    if (preflightCount === 1) {
      const payload = route.request().postDataJSON?.() ?? {};
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          status: "ready",
          summary: "已识别为同一话题总结请求，开始整理课堂易错点。",
          enrichedPrompt: payload.message ?? seedPrompt,
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/agent/chat", async (route) => {
    chatCount += 1;
    if (chatCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: "Chain Rule 的常见误区是只求外层导数、忘记乘以内层导数，以及把复合函数当成普通乘法来处理。",
      });
      return;
    }

    await route.continue();
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

    const seedChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST",
      { timeout: 120000 },
    );

    await composer.fill(seedPrompt);
    await composer.press("Enter");
    await seedChatPromise;
    await waitForLatestAssistantText(
      page,
      (text) => text.includes("Chain Rule") || text.includes("链式法则") || text.length >= 80,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const researchPreflightPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent/preflight")) return false;
      if (response.request().method() !== "POST") return false;
      const payload = response.request().postDataJSON?.();
      return payload?.message === researchPrompt;
    }, { timeout: 120000 });

    const researchChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST",
      { timeout: 120000 },
    );

    await composer.fill(researchPrompt);
    await composer.press("Enter");
    const researchPreflightResponse = await researchPreflightPromise;
    const researchPreflightPayload = await researchPreflightResponse.json().catch(() => ({}));
    const researchChatResponse = await researchChatPromise;
    const researchResult = await readNdjsonResponse(researchChatResponse);

    await waitForLatestAssistantText(
      page,
      (text) =>
        (text.includes("DBQ") || text.includes("评分趋势")) &&
        (text.includes("参考来源") || text.includes("http")),
    );

    const latestAssistantText =
      (await page.locator('[data-testid="agent-assistant-message"]').last().textContent())?.trim() ?? "";
    const toolCalls = researchResult.toolCalls;
    const keyRequests = networkEvents.filter(
      (item) =>
        item.url.includes("/api/agent/preflight") ||
        item.url.includes("/api/agent/chat") ||
        item.url.includes("/api/account/profile") ||
        item.url.includes("/api/chat/conversations"),
    );

    interactionChecks.push({
      check: "重置后研究任务只走研究工具，不再误用习题或教案工具",
      pass:
        toolCalls.includes("web_search") &&
        !toolCalls.includes("generate_ap_exercises_pipeline") &&
        !toolCalls.includes("generate_lesson_plan_workflow"),
      detail: JSON.stringify({ toolCalls }),
    });

    interactionChecks.push({
      check: "研究回复不再被上一轮 Chain Rule 上下文污染",
      pass:
        !/chain rule|链式法则|calculus/i.test(researchResult.text) &&
        !/chain rule|链式法则|calculus/i.test(latestAssistantText),
      detail: JSON.stringify({
        apiSnippet: researchResult.text.slice(0, 180),
        domSnippet: latestAssistantText.slice(0, 180),
      }),
    });

    interactionChecks.push({
      check: "研究型请求 preflight 直接 ready，不再追问旧任务参数",
      pass: researchPreflightPayload?.status === "ready",
      detail: JSON.stringify({
        status: researchPreflightPayload?.status ?? null,
        summary: researchPreflightPayload?.summary ?? null,
      }),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> NDJSON text",
      apiValue: researchResult.text.includes("参考来源") ? "参考来源" : "DBQ",
      domValue: latestAssistantText,
      pass:
        (researchResult.text.includes("参考来源") && latestAssistantText.includes("参考来源")) ||
        (researchResult.text.includes("DBQ") && latestAssistantText.includes("DBQ")),
    });

    assert(keyRequests.length > 0, "未捕获关键 API 请求");
    assert(researchPreflightPayload?.status === "ready", "研究请求 preflight 未返回 ready");
    assert(toolCalls.includes("web_search"), "研究请求未触发 web_search");
    assert(!toolCalls.includes("generate_ap_exercises_pipeline"), "研究请求误触发了习题工具");
    assert(!/chain rule|链式法则|calculus/i.test(latestAssistantText), "最终可见结果仍残留旧话题");

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      keyRequests.every((item) => item.status >= 200 && item.status < 300) &&
      keyRequests.every((item) => item.durationMs <= 30000) &&
      crossChecks.length > 0 &&
      crossChecks.every((item) => item.pass) &&
      interactionChecks.every((item) => item.pass);

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 验证方式: Playwright 浏览器真实联调
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
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
