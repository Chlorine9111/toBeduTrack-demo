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
const runTag =
  process.env.UX_RUN_TAG ?? `UXASSET-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const lessonPrompt =
  process.env.UX_LESSON_PROMPT ??
  `请生成一份标题中包含「${runTag}」的 AP Biology Unit 2 45 分钟教案，包含教学目标、导入、核心活动、练习、评估和分层建议。`;

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const requestStarts = new WeakMap();
const chatPayloads = [];

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

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isTrackedApi(url) {
  return (
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat") ||
    url.includes("/api/content-library/save-artifact") ||
    url.includes("/api/content-assets")
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

async function ensureLoggedIn(page) {
  await page.goto(agentUrl, { waitUntil: "domcontentloaded" });
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== "/auth/login") {
    return;
  }

  await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
  await page.locator("#login-email").fill(loginEmail);
  await page.locator("#login-password").fill(loginPassword);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
    page.getByRole("button", { name: /^登录$/ }).click(),
  ]);
}

async function waitForAssistantContent(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () => {
      const messages = Array.from(
        document.querySelectorAll('[data-testid="agent-assistant-message"]'),
      );
      const last = messages.at(-1);
      const text = last?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return text.length >= 40;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function fetchBootstrap(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/content-assets/bootstrap", {
      cache: "no-store",
    });
    return await response.json();
  });
}

async function waitForSavedAsset(page, title) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const payload = await fetchBootstrap(page);
    const assets = Array.isArray(payload?.assets) ? payload.assets : [];
    const matched = assets.find(
      (asset) =>
        asset.assetSource === "reference" &&
        normalizeText(asset.title) === normalizeText(title),
    );
    if (matched) {
      return matched;
    }
  }
  throw new Error(`未在 assets bootstrap 中找到已保存内容: ${title}`);
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
    const url = request.url();
    if (!url.includes("/api/agent/chat") || request.method() !== "POST") {
      return;
    }

    try {
      chatPayloads.push(request.postDataJSON());
    } catch {
      chatPayloads.push(null);
    }
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
    await ensureLoggedIn(page);
    if (new URL(page.url()).pathname !== "/main/agent") {
      await page.goto(agentUrl, { waitUntil: "domcontentloaded" });
    }

    await page.getByTestId("agent-welcome-heading").waitFor({ state: "visible" });
    await page.getByTestId("agent-composer").waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const preflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );

    await page.getByTestId("agent-composer").fill(lessonPrompt);
    await page.getByTestId("agent-composer").press("Enter");

    const preflightResponse = await preflightPromise;
    const preflightPayload = await preflightResponse.json().catch(() => null);
    assert(
      preflightPayload?.status === "ready" || preflightPayload?.ready === true,
      `生成前置校验未进入 ready: ${JSON.stringify(preflightPayload ?? {})}`,
    );

    const generationChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 150000 },
    );
    const generationChatResponse = await generationChatPromise;
    assert(generationChatResponse.status() === 200, "首次生成 /api/agent/chat 失败");

    const artifactReference = page.locator('[data-testid="agent-artifact-reference"]').last();
    await artifactReference.waitFor({ state: "visible", timeout: 120000 });
    await artifactReference.click();

    await page.getByTestId("agent-artifact-canvas").waitFor({ state: "visible" });
    await page.getByTestId("agent-canvas-title").waitFor({ state: "visible" });
    const canvasTitle = normalizeText(
      await page.getByTestId("agent-canvas-title").textContent(),
    );
    assert(canvasTitle.includes(runTag), `生成标题未包含 runTag: ${canvasTitle}`);

    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-library/save-artifact") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.getByRole("button", { name: "保存到内容库" }).click();
    const saveResponse = await savePromise;
    const savePayload = await saveResponse.json().catch(() => null);
    assert(saveResponse.status() === 200, `保存失败: ${saveResponse.status()}`);
    assert(savePayload?.ok === true, "保存接口未返回 ok=true");
    await page.getByRole("button", { name: "已保存" }).waitFor({ state: "visible" });

    const savedAsset = await waitForSavedAsset(page, canvasTitle);
    crossChecks.push({
      apiField: "POST /api/content-library/save-artifact -> saved title",
      apiValue: canvasTitle,
      domValue: savedAsset.title,
      pass: normalizeText(savedAsset.title) === normalizeText(canvasTitle),
    });

    await page.goto(
      `${baseUrl}/main/content-assets?assetId=${encodeURIComponent(savedAsset.id)}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.getByTestId("content-asset-viewer-title").waitFor({ state: "visible" });
    await page.getByTestId("content-asset-reference-view").waitFor({ state: "visible" });
    const assetsViewerTitle = normalizeText(
      await page.getByTestId("content-asset-viewer-title").textContent(),
    );
    crossChecks.push({
      apiField: "GET /api/content-assets/bootstrap -> reference asset title",
      apiValue: savedAsset.title,
      domValue: assetsViewerTitle,
      pass: assetsViewerTitle.includes(savedAsset.title),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await page.goto(agentUrl, { waitUntil: "domcontentloaded" });
    await page.getByTestId("agent-open-reference-picker").waitFor({ state: "visible" });
    await page.getByTestId("agent-open-reference-picker").click();
    await page.getByTestId("agent-asset-reference-picker").waitFor({ state: "visible" });

    await page.getByPlaceholder("搜索标题、课程或单元...").fill(canvasTitle);
    const referenceItem = page.getByTestId(`agent-asset-reference-item-${savedAsset.id}`);
    await referenceItem.waitFor({ state: "visible", timeout: 15000 });
    await referenceItem.click();
    await page.getByRole("button", { name: "确认引用" }).click();

    const selectedTag = page.getByTestId("agent-asset-reference-tag").filter({
      hasText: canvasTitle,
    });
    await selectedTag.waitFor({ state: "visible" });

    const followupPreflightPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/preflight") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    const followupChatPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") &&
        response.request().method() === "POST" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 120000 },
    );

    await page.getByTestId("agent-composer").fill("请基于这份已保存内容给我一句话摘要。");
    await page.getByTestId("agent-composer").press("Enter");

    const followupPreflight = await followupPreflightPromise;
    const followupPreflightPayload = await followupPreflight.json().catch(() => null);
    assert(
      followupPreflightPayload?.status === "ready" || followupPreflightPayload?.ready === true,
      `引用前置校验未进入 ready: ${JSON.stringify(followupPreflightPayload ?? {})}`,
    );
    const followupChat = await followupChatPromise;
    assert(followupChat.status() === 200, "引用内容后的聊天调用失败");
    await waitForAssistantContent(page, 120000);

    const latestChatPayload = chatPayloads.at(-1);
    assert(latestChatPayload, "未捕获到引用内容后的 /api/agent/chat 请求体");
    const referencedAssetIds = Array.isArray(latestChatPayload.contentAssetIds)
      ? latestChatPayload.contentAssetIds
      : [];
    const legacyReferenceIds = Array.isArray(latestChatPayload.contentReferenceIds)
      ? latestChatPayload.contentReferenceIds
      : [];

    crossChecks.push({
      apiField: "POST /api/agent/chat -> contentAssetIds",
      apiValue: referencedAssetIds.join(","),
      domValue: canvasTitle,
      pass:
        referencedAssetIds.includes(savedAsset.id) &&
        legacyReferenceIds.length === 0,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }

  const failedCrossChecks = crossChecks.filter((item) => !item.pass);
  const failedApis = networkEvents.filter((item) => item.status >= 400);

  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), {
    static404s,
    consoleErrors,
    pageErrors,
  });

  const finalPass =
    static404s.length === 0 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    failedApis.length === 0 &&
    failedCrossChecks.length === 0 &&
    networkEvents
      .filter((item) => item.url.includes("/api/agent/chat"))
      .every((item) => item.durationMs <= 30000);

  const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${finalPass ? "PASS" : "FAIL"}
- 关键接口耗时:
${networkEvents.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`).join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${String(item.domValue)}\`: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

  await fs.writeFile(path.join(artifactDir, "report.md"), `${report}\n`, "utf8");

  if (!finalPass) {
    process.exit(1);
  }
}

run().catch(async (error) => {
  await fs.mkdir(artifactDir, { recursive: true }).catch(() => {});
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    `## UX 验证报告\n\n- 验证级别: L1\n- 最终结论: FAIL\n- 失败原因: ${error instanceof Error ? error.message : String(error)}\n- 产物目录:\n  - ${artifactDir}\n`,
    "utf8",
  );
  console.error(error);
  process.exit(1);
});
