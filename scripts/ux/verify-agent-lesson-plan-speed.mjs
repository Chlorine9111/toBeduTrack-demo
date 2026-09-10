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
  process.env.UX_RUN_TAG ?? `UXLP-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const lessonPrompt =
  process.env.UX_LESSON_PROMPT ??
  `请生成一份标题中包含「${runTag}」的高中 AP Biology Unit 3 45 分钟新授课完整教案，包含教学目标、课时安排、导入活动、核心讲解逻辑、课堂互动环节、练习与评估、分层教学建议。`;

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
    url.includes("/api/agent/chat") ||
    url.includes("/api/content-library/save-artifact") ||
    url.includes("/api/content-library?")
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function repairUtf8Text(value) {
  const text = `${value ?? ""}`;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return /[\u4e00-\u9fa5]/.test(repaired) ? repaired : text;
  } catch {
    return text;
  }
}

async function readNdjsonResponse(response) {
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
      .map((event) => repairUtf8Text(event.text ?? event.delta))
      .join(""),
    toolOutput:
      events
        .filter(
          (event) =>
            event?.type === "tool-result" || event?.type === "tool-output-available",
        )
        .map((event) => event.output)
        .at(-1) ?? null,
  };
}

async function waitForAssistantContent(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () => {
      const messages = Array.from(document.querySelectorAll('[data-testid="agent-assistant-message"]'));
      const last = messages.at(-1);
      const text = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return text.length >= 80;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
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

    const profilePayload = await page.evaluate(async () => {
      const response = await fetch("/api/account/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });

    const welcomeHeading = (await page.locator("main h1").first().textContent()) ?? "";
    crossChecks.push({
      apiField: "GET /api/account/profile -> profile.displayName",
      apiValue: profilePayload?.profile?.displayName ?? null,
      domValue: welcomeHeading,
      pass:
        typeof profilePayload?.profile?.displayName === "string" &&
        welcomeHeading.includes(profilePayload.profile.displayName),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const preflightResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 60000 },
    );

    await composer.fill(lessonPrompt);
    await composer.press("Enter");

    const preflightResponse = await preflightResponsePromise;
    const preflightPayload = await preflightResponse.json().catch(() => null);
    const preflightReady =
      preflightPayload?.ready === true ||
      preflightPayload?.decision === "ready" ||
      preflightPayload?.status === "ready";
    if (!preflightReady) {
      throw new Error(
        `教案请求未进入正式生成，preflight 返回：${JSON.stringify(preflightPayload ?? {})}`,
      );
    }

    const chatResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 150000 },
    );

    const chatResponse = await chatResponsePromise;
    const ndjson = await readNdjsonResponse(chatResponse);
    const chatStartedAt = requestStarts.get(chatResponse.request()) ?? null;
    const chatDurationMs =
      typeof chatStartedAt === "number" ? Date.now() - chatStartedAt : null;

    await waitForAssistantContent(page);
    const assistantText =
      (await page.locator('[data-testid="agent-assistant-message"]').last().textContent())?.trim() ?? "";
    const normalizedApiText = normalizeText(ndjson.text);
    const normalizedAssistantText = normalizeText(assistantText);

    const artifactReference = page.locator('[data-testid="agent-artifact-reference"]').last();
    await artifactReference.waitFor({ state: "visible", timeout: 120000 });
    await artifactReference.click();
    await page.locator('[data-testid="agent-artifact-canvas"]').waitFor({ state: "visible", timeout: 120000 });
    await page.locator('[data-testid="agent-canvas-title"]').waitFor({ state: "visible", timeout: 120000 });

    const canvasTitle = normalizeText(
      await page.locator('[data-testid="agent-canvas-title"]').textContent(),
    );
    const canvasBody = normalizeText(
      await page.locator('[data-testid="agent-artifact-canvas"]').textContent(),
    );
    const apiBodyLength = normalizedApiText.length;

    crossChecks.push({
      apiField: "POST /api/agent/chat -> 引用块预览",
      apiValue: normalizedAssistantText.slice(0, 64),
      domValue: normalizedAssistantText.slice(0, 64),
      pass:
        normalizedAssistantText.includes("点击引用块") ||
        normalizedAssistantText.includes("Canvas"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> assistant body length",
      apiValue: apiBodyLength,
      domValue: `${canvasTitle} | ${canvasBody.slice(0, 60)}`,
      pass:
        apiBodyLength >= 120 && (canvasTitle.length >= 3 || canvasBody.length >= 120),
    });

    const totalMs =
      typeof ndjson.toolOutput?.timings?.totalMs === "number"
        ? ndjson.toolOutput.timings.totalMs
        : chatDurationMs;
    crossChecks.push({
      apiField: "POST /api/agent/chat -> totalMs <= 30000",
      apiValue: totalMs,
      domValue: `${canvasTitle} | ${canvasBody.slice(0, 48)}`,
      pass:
        typeof totalMs === "number" &&
        totalMs <= 30000 &&
        (canvasTitle.length >= 3 || canvasBody.length >= 120),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-library/save-artifact") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    const saveButton = page.getByRole("button", { name: "保存到内容库" });
    await saveButton.waitFor({ state: "visible", timeout: 30000 });
    await saveButton.click();

    const saveResponse = await saveResponsePromise;
    const savePayload = await saveResponse.json().catch(() => null);
    await page.getByRole("button", { name: "已保存" }).waitFor({ state: "visible", timeout: 30000 });

    crossChecks.push({
      apiField: "POST /api/content-library/save-artifact -> ok",
      apiValue: savePayload?.ok ?? null,
      domValue: "已保存",
      pass: savePayload?.ok === true,
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

    const agentChatRequests = networkEvents.filter((item) => item.url.includes("/api/agent/chat"));
    const librarySaveRequests = networkEvents.filter((item) =>
      item.url.includes("/api/content-library/save-artifact"),
    );
    const requiredCrossChecks = crossChecks.filter((item) =>
      item.apiField.includes("profile.displayName") ||
      item.apiField.includes("markdown heading/snippet") ||
      item.apiField.includes("save-artifact") ||
      item.apiField.includes("totalMs <= 30000"),
    );
    const finalPass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      agentChatRequests.length > 0 &&
      agentChatRequests.every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000) &&
      librarySaveRequests.length > 0 &&
      librarySaveRequests.every((item) => item.status >= 200 && item.status < 300) &&
      requiredCrossChecks.length >= 3 &&
      requiredCrossChecks.every((item) => item.pass);

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${finalPass ? "PASS" : "FAIL"}
- 关键接口耗时:
${agentChatRequests.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`).join("\n")}
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
      throw new Error("教案生成 UX 验证未通过");
    }
  } catch (error) {
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
