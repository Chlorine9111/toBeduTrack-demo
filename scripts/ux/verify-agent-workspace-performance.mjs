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
  `UXAGENTPERF-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const lessonPrompt =
  process.env.UX_AGENT_PERF_PROMPT ??
  `请生成一份标题中包含「${runTag}」的 AP Biology Unit 3 45 分钟新授课教案，必须包含教学目标、导入、核心讲解、互动活动、练习与评估。`;

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

function repairUtf8Text(value) {
  const text = `${value ?? ""}`;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return /[\u4e00-\u9fa5]/.test(repaired) ? repaired : text;
  } catch {
    return text;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible", timeout: 60000 });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    const agentLoadStartedAt = Date.now();
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);

    const welcomeHeading = page.getByTestId("agent-welcome-heading").first();
    await welcomeHeading.waitFor({ state: "visible", timeout: 60000 });
    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });

    const welcomeVisibleMs = Date.now() - agentLoadStartedAt;
    const profilePayload = await page.evaluate(async () => {
      const response = await fetch("/api/account/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });
    const welcomeText = (await welcomeHeading.textContent()) ?? "";

    crossChecks.push({
      apiField: "GET /api/account/profile -> profile.displayName",
      apiValue: profilePayload?.profile?.displayName ?? null,
      domValue: welcomeText,
      pass:
        typeof profilePayload?.profile?.displayName === "string" &&
        welcomeText.includes(profilePayload.profile.displayName),
    });

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

    await composer.fill(lessonPrompt);
    const actionStartedAt = Date.now();
    await composer.press("Enter");

    const progressPanel = page.getByTestId("agent-progress-panel");
    await progressPanel.waitFor({ state: "visible", timeout: 15000 });
    const progressVisibleMs = Date.now() - actionStartedAt;

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const preflightResponse = await preflightPromise;
    const preflightPayload = await preflightResponse.json().catch(() => null);
    const preflightReady =
      preflightPayload?.ready === true ||
      preflightPayload?.decision === "ready" ||
      preflightPayload?.status === "ready";
    assert(preflightReady, `preflight 未进入 ready：${JSON.stringify(preflightPayload ?? {})}`);

    const artifactReference = page.locator('[data-testid="agent-artifact-reference"]').last();
    await artifactReference.waitFor({ state: "visible", timeout: 120000 });
    const artifactReferenceVisibleMs = Date.now() - actionStartedAt;

    await artifactReference.click();
    const canvas = page.locator('[data-testid="agent-artifact-canvas"]');
    await canvas.waitFor({ state: "visible", timeout: 15000 });
    const canvasVisibleMs = Date.now() - actionStartedAt;

    const canvasTitle = normalizeText(
      await page.locator('[data-testid="agent-canvas-title"]').textContent(),
    );
    const canvasBody = normalizeText(await canvas.textContent());

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const chatResponse = await chatPromise;
    const chatNdjson = await readNdjsonResponse(chatResponse);
    const apiBodyLength = normalizeText(chatNdjson.text).length;
    crossChecks.push({
      apiField: "POST /api/agent/chat -> assistant body length",
      apiValue: apiBodyLength,
      domValue: `${canvasTitle} | ${canvasBody.slice(0, 60)}`,
      pass: apiBodyLength >= 120 && (canvasTitle.length >= 3 || canvasBody.length >= 120),
    });

    const toolTotalMs =
      typeof chatNdjson.toolOutput?.timings?.totalMs === "number"
        ? chatNdjson.toolOutput.timings.totalMs
        : null;
    const metrics = {
      welcomeVisibleMs,
      progressVisibleMs,
      artifactReferenceVisibleMs,
      canvasVisibleMs,
      preflightReady,
      toolTotalMs,
      apiBodyLength,
      canvasTitle,
    };

    await writeJson(path.join(artifactDir, "metrics.json"), metrics);
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });

    const preflightRequests = networkEvents.filter((item) => item.url.includes("/api/agent/preflight"));
    const chatRequests = networkEvents.filter((item) => item.url.includes("/api/agent/chat"));
    const optimizationFindings = [
      welcomeVisibleMs > 2000
        ? `欢迎语可见时间 ${welcomeVisibleMs}ms，超过 2s 目标。`
        : null,
      progressVisibleMs > 2000
        ? `进度面板可见时间 ${progressVisibleMs}ms，超过 2s 目标。`
        : null,
      artifactReferenceVisibleMs > 30000
        ? `引用块可见时间 ${artifactReferenceVisibleMs}ms，超过 30s 预算。`
        : null,
      canvasVisibleMs > 30000
        ? `Canvas 可见时间 ${canvasVisibleMs}ms，超过 30s 预算。`
        : null,
    ].filter(Boolean);
    const finalPass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      preflightRequests.length > 0 &&
      preflightRequests.every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 15000) &&
      chatRequests.length > 0 &&
      chatRequests.every((item) => item.status >= 200 && item.status < 300) &&
      typeof canvasVisibleMs === "number" &&
      canvasVisibleMs <= 45000 &&
      (toolTotalMs === null || toolTotalMs <= 30000) &&
      crossChecks.length >= 2 &&
      crossChecks.every((item) => item.pass);

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${finalPass ? "PASS" : "FAIL"}
- 关键接口耗时:
  - ${preflightRequests.map((item) => `${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`).join("\n  - ")}
  - ${chatRequests.map((item) => `${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`).join("\n  - ")}
- 前端可见性时间:
  - 欢迎语可见: ${welcomeVisibleMs}ms
  - 进度面板可见: ${progressVisibleMs}ms
  - 引用块可见: ${artifactReferenceVisibleMs}ms
  - Canvas 可见: ${canvasVisibleMs}ms
  - Agent tool totalMs: ${toolTotalMs ?? "unknown"}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${String(item.domValue)}\`: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 优化观察:
${optimizationFindings.length > 0 ? optimizationFindings.map((item) => `  - ${item}`).join("\n") : "  - 无明显超预算观察"}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");

    if (!finalPass) {
      throw new Error("主工作台性能 UX 验证未通过");
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
