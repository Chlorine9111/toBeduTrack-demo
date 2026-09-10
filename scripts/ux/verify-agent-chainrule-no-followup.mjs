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
const prompt = process.env.UX_CHAINRULE_PROMPT ?? "帮我生成三道chainrule习题";

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
      .filter(
        (event) =>
          (event?.type === "tool-result" || event?.type === "tool-output-available") &&
          typeof event.toolName === "string",
      )
      .map((event) => ({
        toolName: event.toolName,
        output: event.output ?? null,
        durationMs: typeof event.durationMs === "number" ? event.durationMs : null,
      })),
  };
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

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

    await composer.fill(prompt);
    await composer.press("Enter");

    const preflightResponse = await preflightPromise;
    const preflightBody = await preflightResponse.json().catch(() => null);
    const preflightReady =
      preflightBody?.ready === true ||
      preflightBody?.decision === "ready" ||
      preflightBody?.status === "ready";
    assert(preflightReady, `preflight 未进入 ready：${JSON.stringify(preflightBody ?? {})}`);

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const chatResponse = await chatPromise;
    const chatStream = await readAgentStreamResponse(chatResponse);
    const toolResult = chatStream.toolResults.find(
      (item) => item.toolName === "generate_ap_exercises_pipeline",
    );
    const saveMode = toolResult?.output?.saveMode ?? null;

    await page.waitForFunction(
      () => {
        const nodes = Array.from(
          document.querySelectorAll('[data-testid="agent-assistant-message"]'),
        );
        const last = nodes.at(-1);
        const content = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return content.includes("第 1 题") || content.includes("已完成习题生成");
      },
      { timeout: 120000 },
    );

    const assistantText = normalizeText(
      await page.locator('[data-testid="agent-assistant-message"]').last().textContent(),
    );
    const artifactReference = page.locator('[data-testid="agent-artifact-reference"]').last();
    let canvasText = "";
    if (await artifactReference.isVisible().catch(() => false)) {
      await artifactReference.click();
      await page.locator('[data-testid="agent-artifact-canvas"]').waitFor({
        state: "visible",
        timeout: 120000,
      });
      canvasText = normalizeText(
        await page.locator('[data-testid="agent-artifact-canvas"]').textContent(),
      );
    }
    const finalVisibleText = normalizeText(`${assistantText}\n${canvasText}`);

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> taskContext.action",
      apiValue: preflightBody?.taskContext?.action ?? null,
      domValue: JSON.stringify(chatStream.toolCalls),
      pass:
        preflightBody?.taskContext?.action === "generate_exercises" &&
        chatStream.toolCalls.includes("generate_ap_exercises_pipeline"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> text",
      apiValue: normalizeText(chatStream.text).slice(0, 80),
      domValue: finalVisibleText.slice(0, 80),
      pass:
        finalVisibleText.includes("第 1 题") &&
        finalVisibleText.includes(normalizeText(chatStream.text).slice(0, 20)),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> 无误入库/无降级污染",
      apiValue: String(saveMode),
      domValue: finalVisibleText,
      pass:
        saveMode === "save_now"
          ? finalVisibleText.includes("真实保存")
          : !finalVisibleText.includes("真实保存") &&
            !finalVisibleText.includes("AP Calculus BC Unit 3") &&
            !finalVisibleText.includes("interactive_low_latency"),
    });

    assert(
      !assistantText.includes("这套题对应哪门 AP 课程和哪个 Unit"),
      "页面仍然出现旧的课程/Unit 追问",
    );
    assert(
      !assistantText.includes("请告诉我对应的 AP 课程和 Unit"),
      "页面仍然出现旧的 AP 课程/Unit 追问",
    );
    assert(finalVisibleText.includes("第 1 题"), "页面没有展示生成后的习题结果");
    assert(finalVisibleText.includes("答案"), "页面没有展示答案");
    assert(finalVisibleText.includes("解析"), "页面没有展示解析");
    assert(
      chatStream.toolCalls.includes("generate_ap_exercises_pipeline"),
      "未捕获 generate_ap_exercises_pipeline 调用",
    );

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

    const chatRequests = networkEvents.filter((item) => item.url.includes("/api/agent/chat"));
    const report = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      ...networkEvents.map(
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
    assert(chatRequests.length > 0, "未记录到 /api/agent/chat 请求");
    assert(
      chatRequests.every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000),
      "关键生成接口失败或耗时超过 30s",
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
