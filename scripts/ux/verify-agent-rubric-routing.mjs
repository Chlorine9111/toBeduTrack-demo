import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const agentUrl = `${baseUrl}/main/agent`;
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const assetTitle =
  process.env.UX_EXISTING_ASSET_TITLE ?? "Chapter_11_Of_Rats_and_Men.pdf";
const rubricPrompt =
  process.env.UX_RUBRIC_PROMPT ??
  "请根据这份 Chapter 11 资料，生成一个简单的 AP Calculus BC rubric。要求：4 个维度、4 档、语言简洁，适合课堂形成性评价。";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readUiStreamResponse(response) {
  const raw = await response.text().catch(() => "");
  const events = raw
    .split("\n")
    .map((line) => line.trim())
    .map((line) => (line.startsWith("data:") ? line.slice(5).trim() : line))
    .filter(Boolean)
    .filter((line) => line !== "[DONE]")
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

  const toolNameByCallId = new Map();
  for (const event of events) {
    if (
      (event?.type === "tool-call" || event?.type === "tool-input-available") &&
      typeof event.toolCallId === "string" &&
      typeof event.toolName === "string"
    ) {
      toolNameByCallId.set(event.toolCallId, event.toolName);
    }
  }

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
          typeof (event.toolName ?? toolNameByCallId.get(event.toolCallId)) ===
            "string",
      )
      .map((event) => event.toolName ?? toolNameByCallId.get(event.toolCallId)),
  };
}

async function ensureLoggedIn(page) {
  await page.goto(agentUrl, { waitUntil: "domcontentloaded" });
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== "/auth/login") {
    return;
  }

  await page
    .locator('form[data-auth-ready="true"]')
    .waitFor({ state: "visible", timeout: 60000 });
  await page.locator("#login-email").fill(loginEmail);
  await page.locator("#login-password").fill(loginPassword);

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/main/"), {
      timeout: 120000,
    }),
    page.getByRole("button", { name: /^登录$/ }).click(),
  ]);

  if (new URL(page.url()).pathname !== "/main/agent") {
    await page.goto(agentUrl, { waitUntil: "domcontentloaded" });
  }
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);

  const requests = [];
  const chatPayloads = [];
  const consoleErrors = [];
  const pageErrors = [];

  page.on("request", (request) => {
    if (
      request.url().includes("/api/agent/preflight") ||
      request.url().includes("/api/agent/chat")
    ) {
      requests.push({
        method: request.method(),
        url: request.url(),
      });
    }
    if (
      request.url().includes("/api/agent/chat") &&
      request.method() === "POST"
    ) {
      try {
        chatPayloads.push(request.postDataJSON());
      } catch {
        chatPayloads.push(null);
      }
    }
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrors.push(message.text());
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  try {
    await ensureLoggedIn(page);

    const newChatButton = page.getByRole("button", { name: /New chat/i }).first();
    if (await newChatButton.isVisible().catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(800);
    }

    await page.getByTestId("agent-open-reference-picker").click();
    const contextSidebar = page.getByTestId("agent-context-sidebar");
    await contextSidebar.waitFor({ state: "visible", timeout: 30000 });
    const searchInput = contextSidebar.getByTestId("agent-context-search-input");
    await searchInput.fill(assetTitle);
    await contextSidebar
      .getByRole("button", { name: new RegExp(assetTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
      .first()
      .click();
    await contextSidebar.getByTestId("agent-context-attach-button").click();
    await page
      .getByTestId("agent-asset-reference-tag")
      .filter({ hasText: assetTitle })
      .waitFor({ state: "visible", timeout: 30000 });

    const composer = page.getByTestId("agent-composer").first();
    const sendStartedAt = Date.now();
    const canvasVisiblePromise = page
      .getByTestId("agent-artifact-canvas")
      .waitFor({ state: "visible", timeout: 60000 })
      .then(() => Date.now());
    const chatResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST",
      { timeout: 240000 },
    );

    await composer.fill(rubricPrompt);
    await composer.press("Enter");

    const canvasVisibleAt = await canvasVisiblePromise;
    const chatResponse = await chatResponsePromise;
    if (!chatResponse.ok()) {
      throw new Error(
        `rubric 请求失败 (${chatResponse.status()}): ${await chatResponse.text()}`,
      );
    }

    const stream = await readUiStreamResponse(chatResponse);
    const canvasTitle = normalizeText(
      await page.getByTestId("agent-canvas-title").textContent(),
    );
    const canvasText = normalizeText(
      await page.getByTestId("agent-artifact-canvas").textContent(),
    );
    const latestPayload = chatPayloads.at(-1);
    const preflightRequests = requests.filter((item) =>
      item.url.includes("/api/agent/preflight"),
    );

    assert(
      preflightRequests.length === 0,
      `检测到不应出现的 preflight 请求：${preflightRequests.length}`,
    );
    assert(
      Array.isArray(latestPayload?.contentAssetIds) &&
        latestPayload.contentAssetIds.length > 0,
      "rubric 请求没有继续携带 contentAssetIds",
    );
    assert(
      stream.toolCalls.includes("generate_rubric"),
      `未命中 generate_rubric：${stream.toolCalls.join(", ") || "none"}`,
    );
    assert(
      !stream.toolCalls.includes("generate_worksheet"),
      `rubric 错误命中 generate_worksheet：${stream.toolCalls.join(", ") || "none"}`,
    );
    assert(
      /rubric|评分|量表|维度|等级/i.test(canvasText),
      `右侧 Canvas 未显示 rubric 结构：${canvasText.slice(0, 200)}`,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-agent-rubric-routing.png"),
      fullPage: true,
    });

    const report = {
      firstCanvasMs: canvasVisibleAt - sendStartedAt,
      toolCalls: stream.toolCalls,
      canvasTitle,
      canvasPreview: canvasText.slice(0, 240),
      requestUrls: requests.map((item) =>
        item.url.replace(/^https?:\/\/[^/]+/, ""),
      ),
      latestPayload,
      consoleErrors,
      pageErrors,
    };

    await writeJson(path.join(artifactDir, "report.json"), report);
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      [
        "## UX 验证报告",
        "",
        "- 验证级别: L1",
        "- 最终结论: PASS",
        `- 复用资料: ${assetTitle}`,
        `- 首个右侧 Canvas 可见时间: ${report.firstCanvasMs}ms`,
        `- 工具调用: ${report.toolCalls.join(", ") || "none"}`,
        `- Canvas 标题: ${report.canvasTitle}`,
        `- console error: ${consoleErrors.length}`,
        `- pageerror: ${pageErrors.length}`,
        "",
      ].join("\n"),
      "utf8",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: FAIL",
      `- 失败原因: ${error instanceof Error ? error.message : String(error)}`,
      "",
    ].join("\n"),
    "utf8",
  );
  console.error(error);
  process.exit(1);
});
