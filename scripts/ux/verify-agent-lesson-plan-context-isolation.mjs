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
const seedPrompt =
  process.env.UX_SEED_PROMPT ??
  "帮我生成一道chainrule习题";
const lessonPrompt =
  process.env.UX_LESSON_CONTEXT_PROMPT ??
  "帮我生成一个 enviorment science ap unit1 的教案，45 分钟，聚焦 Earth Systems and Resources，包含教学目标、课时安排、导入活动、核心讲解逻辑、课堂互动环节、练习与评估、分层教学建议。";

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

async function readStreamResponse(response) {
  const raw = await response
    .body()
    .then((buffer) => new TextDecoder("utf-8").decode(buffer))
    .catch(() => "");
  const contentType = (await response.headerValue("content-type")) ?? "";
  const parseNdjsonEvents = (value) =>
    value
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
  const parseSseEvents = (value) =>
    value
      .split("\n\n")
      .flatMap((block) => {
        const payload = block
          .split("\n")
          .map((line) => line.replace(/\r$/, ""))
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
          .trim();
        if (!payload || payload === "[DONE]") return [];
        try {
          return [JSON.parse(payload)];
        } catch {
          return [];
        }
      });

  const events = contentType.includes("text/event-stream")
    ? parseSseEvents(raw)
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
  };
}

async function waitForLatestAssistantText(page, matcher, timeout = 150000) {
  await page.waitForFunction(
    (matcherSource) => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid="agent-assistant-message"]'),
      );
      const last = nodes.at(-1);
      const text = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      // eslint-disable-next-line no-new-func
      const fn = new Function("text", `return (${matcherSource})(text);`);
      return Boolean(fn(text));
    },
    matcher.toString(),
    { timeout },
  );
}

async function waitForLessonResultVisible(page, timeout = 150000) {
  await page.waitForFunction(
    () => {
      const lastMessage = Array.from(
        document.querySelectorAll('[data-testid="agent-assistant-message"]'),
      ).at(-1);
      const assistantText =
        lastMessage?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const hasLessonKeywords = /教学目标|课时安排|导入活动/.test(assistantText);
      const hasArtifactReference = Array.from(
        document.querySelectorAll('[data-testid="agent-artifact-reference"]'),
      ).some((node) => {
        const element = node;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      return hasLessonKeywords || hasArtifactReference;
    },
    { timeout },
  );
}

async function runPrompt(page, prompt, options = {}) {
  const composer = page.locator('[data-testid="agent-composer"]').first();
  const expectedPrompt = options.matchPrompt ?? prompt;
  const preflightPromise = page.waitForResponse((response) => {
    if (!response.url().includes("/api/agent/preflight")) return false;
    if (response.request().method() !== "POST") return false;
    const payload = response.request().postDataJSON?.();
    return payload?.message === expectedPrompt;
  }, { timeout: 120000 });
  const chatPromise = page.waitForResponse((response) => {
    if (!response.url().includes("/api/agent/chat")) return false;
    if (response.request().method() !== "POST") return false;
    const payload = response.request().postDataJSON?.();
    return payload?.message?.includes(expectedPrompt);
  }, { timeout: 180000 });

  await composer.fill(prompt);
  await composer.press("Enter");

  const preflightResponse = await preflightPromise;
  const preflightPayload = await preflightResponse.json().catch(() => null);
  const chatResponse = await chatPromise;
  const stream = await readStreamResponse(chatResponse);
  return { preflightPayload, chatResponse, stream };
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(150000);
  page.setDefaultNavigationTimeout(150000);

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

    const seedRun = await runPrompt(page, seedPrompt);
    assert(
      seedRun.preflightPayload?.status === "ready",
      `首轮习题 preflight 非 ready：${JSON.stringify(seedRun.preflightPayload ?? {})}`,
    );
    await waitForLatestAssistantText(
      page,
      (text) =>
        text.includes("chain rule") ||
        text.includes("第 1 题") ||
        text.includes("已完成习题生成"),
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const lessonRun = await runPrompt(page, lessonPrompt);
    assert(
      lessonRun.preflightPayload?.status === "ready",
      `教案 preflight 非 ready：${JSON.stringify(lessonRun.preflightPayload ?? {})}`,
    );
    assert(
      lessonRun.stream.toolCalls.includes("generate_lesson_plan_workflow"),
      `教案请求未触发 generate_lesson_plan_workflow：${JSON.stringify(lessonRun.stream.toolCalls)}`,
    );

    await waitForLessonResultVisible(page);

    const assistantText = normalizeText(
      (await page.locator('[data-testid="agent-assistant-message"]').last().textContent()) ?? "",
    );
    const artifactReference = page.locator('[data-testid="agent-artifact-reference"]').last();
    let canvasText = "";
    if (await artifactReference.isVisible().catch(() => false)) {
      await artifactReference.click();
      await page.locator('[data-testid="agent-artifact-canvas"]').waitFor({ state: "visible", timeout: 120000 });
      canvasText = normalizeText(
        (await page.locator('[data-testid="agent-artifact-canvas"]').textContent()) ?? "",
      );
    }

    const normalizedApiText = normalizeText(lessonRun.stream.text);
    const finalVisibleText = normalizeText(`${assistantText}\n${canvasText}`);
    const stalePattern = /chain rule|链式法则|微积分|calculus/i;

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> status",
      apiValue: lessonRun.preflightPayload?.status ?? null,
      domValue: "教案已进入生成链",
      pass: lessonRun.preflightPayload?.status === "ready",
    });
    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolCalls",
      apiValue: lessonRun.stream.toolCalls.join(", "),
      domValue: assistantText.slice(0, 80),
      pass: lessonRun.stream.toolCalls.includes("generate_lesson_plan_workflow"),
    });
    crossChecks.push({
      apiField: "POST /api/agent/chat -> API 正文不含旧 topic",
      apiValue: normalizedApiText.slice(0, 200),
      domValue: finalVisibleText.slice(0, 200),
      pass: !stalePattern.test(normalizedApiText),
    });
    crossChecks.push({
      apiField: "DOM -> 最终可见教案不含旧 topic",
      apiValue: assistantText.slice(0, 200),
      domValue: finalVisibleText.slice(0, 200),
      pass: !stalePattern.test(finalVisibleText),
    });
    crossChecks.push({
      apiField: "DOM -> 教案不泄露前置补充说明",
      apiValue: normalizedApiText.slice(0, 200),
      domValue: finalVisibleText.slice(0, 200),
      pass:
        !/前置补充说明|任务目标：|主题范围：|处理范围：/.test(finalVisibleText),
    });
    crossChecks.push({
      apiField: "DOM -> 教案结构可见",
      apiValue: normalizedApiText.slice(0, 120),
      domValue: finalVisibleText.slice(0, 120),
      pass:
        /教学目标|课时安排|导入活动/.test(finalVisibleText) ||
        /教学目标|课时安排|导入活动/.test(normalizedApiText),
    });

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

    const trackedAgentRequests = networkEvents.filter((item) =>
      item.url.includes("/api/agent/preflight") || item.url.includes("/api/agent/chat"),
    );
    const finalPass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      trackedAgentRequests.length >= 4 &&
      trackedAgentRequests.every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000) &&
      crossChecks.length >= 5 &&
      crossChecks.every((item) => item.pass);

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${finalPass ? "PASS" : "FAIL"}
- 关键接口耗时:
${trackedAgentRequests.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`).join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM \`${String(item.domValue)}\`: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");

    if (!finalPass) {
      throw new Error("教案上下文隔离 UX 验证未通过");
    }
  } catch (error) {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      [
        "## UX 验证报告",
        "",
        "- 验证级别: L1",
        "- 最终结论: FAIL",
        `- 失败原因: ${error instanceof Error ? error.message : "未知错误"}`,
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
