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

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const requestStarts = new WeakMap();
const chatPayloads = [];

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete("apikey");
  url.searchParams.delete("access_token");
  url.searchParams.delete("refresh_token");
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
  return url.includes("/api/content-assets") || url.includes("/api/agent/");
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

function pickReferenceSummary(assets) {
  return (
    assets.find(
      (asset) =>
        asset.assetSource === "reference" &&
        typeof asset.contentLibraryItemId === "string" &&
        asset.contentLibraryItemId &&
        typeof asset.rendererType === "string" &&
        asset.rendererType,
    ) ?? null
  );
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
    page.waitForURL((url) => url.pathname.startsWith("/main/"), { timeout: 120000 }),
    page.getByRole("button", { name: /^登录$/ }).click(),
  ]);
}

async function fetchBootstrap(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/content-assets/bootstrap", {
      cache: "no-store",
    });
    return await response.json();
  });
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();

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
    await page.getByTestId("agent-open-reference-picker").waitFor({ state: "visible" });
    assert(
      (await page.locator('[data-testid="agent-open-content-reference-picker"]').count()) === 0,
      "旧内容库引用按钮仍然存在",
    );
    assert(
      (await page.locator('[data-testid="agent-open-asset-reference-picker"]').count()) === 0,
      "旧文件引用按钮仍然存在",
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const bootstrapBody = await fetchBootstrap(page);
    assert(Array.isArray(bootstrapBody?.assets), "bootstrap 未返回 assets");
    const referenceSummary = pickReferenceSummary(bootstrapBody.assets);
    assert(referenceSummary, "未找到可验证的 reference 资产");

    await page.getByTestId("agent-open-reference-picker").click();
    await page.getByTestId("agent-asset-reference-picker").waitFor({ state: "visible" });

    const pickerSearchInput = page.getByPlaceholder("搜索标题、课程或单元...");
    await pickerSearchInput.fill(referenceSummary.title);
    const pickerItem = page.getByTestId(`agent-asset-reference-item-${referenceSummary.id}`);
    await pickerItem.waitFor({ state: "visible", timeout: 10000 });
    await pickerItem.click();
    await page.getByRole("button", { name: "确认引用" }).click();

    const referenceTag = page.getByTestId("agent-asset-reference-tag").filter({
      hasText: referenceSummary.title,
    });
    await referenceTag.waitFor({ state: "visible" });
    const referenceTagText = normalizeText(await referenceTag.textContent());
    crossChecks.push({
      apiField: "GET /api/content-assets/bootstrap -> reference.title",
      apiValue: referenceSummary.title,
      domValue: referenceTagText,
      pass: referenceTagText.includes(referenceSummary.title),
    });

    await page.getByTestId("agent-composer").fill("请基于这份内容给我一句话摘要");
    const chatResponsePromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes("/api/agent/chat") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByTestId("agent-composer").press("Enter");
    const chatResponse = await chatResponsePromise;
    assert(chatResponse.status() === 200, `Agent Chat 状态异常: ${chatResponse.status()}`);

    await referenceTag.waitFor({ state: "hidden", timeout: 10000 });
    await page.getByText(`已引用内容：${referenceSummary.title}`).waitFor({
      state: "visible",
      timeout: 15000,
    });

    const latestChatPayload = chatPayloads.at(-1);
    assert(latestChatPayload, "未捕获到 /api/agent/chat 请求体");
    const referencedAssetIds = Array.isArray(latestChatPayload.contentAssetIds)
      ? latestChatPayload.contentAssetIds
      : [];
    const legacyReferenceIds = Array.isArray(latestChatPayload.contentReferenceIds)
      ? latestChatPayload.contentReferenceIds
      : [];
    assert(
      referencedAssetIds.includes(referenceSummary.id),
      "Agent Chat 未携带统一 contentAssetIds",
    );
    assert(
      legacyReferenceIds.length === 0,
      "Agent Chat 仍然携带旧 contentReferenceIds",
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const compatUrl = `${baseUrl}/main/content-library?itemId=${encodeURIComponent(referenceSummary.contentLibraryItemId)}`;
    const detailResponsePromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/content-assets/${referenceSummary.id}`) &&
        response.request().method() === "GET",
      { timeout: 15000 },
    );
    await page.goto(compatUrl, { waitUntil: "domcontentloaded" });
    await page.waitForURL(
      (url) =>
        url.pathname === "/main/content-assets" &&
        url.searchParams.get("itemId") === referenceSummary.contentLibraryItemId,
      { timeout: 15000 },
    );
    const detailResponse = await detailResponsePromise;
    const detailBody = await detailResponse.json();

    await page.getByTestId("content-asset-viewer-title").waitFor({ state: "visible" });
    await page.getByTestId("content-asset-reference-view").waitFor({ state: "visible" });
    const viewerTitle = normalizeText(
      await page.getByTestId("content-asset-viewer-title").textContent(),
    );
    const apiTitle = normalizeText(
      detailBody?.contentLibraryItem?.displayTitle ??
      detailBody?.asset?.title ??
      referenceSummary.title,
    );
    crossChecks.push({
      apiField: "GET /api/content-assets/:id -> contentLibraryItem.displayTitle",
      apiValue: apiTitle,
      domValue: viewerTitle,
      pass: viewerTitle.includes(apiTitle),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }

  const failedCrossChecks = crossChecks.filter((item) => !item.pass);
  const failedApis = networkEvents.filter(
    (event) =>
      (event.url.includes("/api/content-assets") || event.url.includes("/api/agent/")) &&
      event.status >= 400,
  );

  const errors = {
    static404s,
    consoleErrors,
    pageErrors,
  };

  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), errors);

  const reportLines = [
    "## UX 验证报告",
    "",
    "- 验证级别: L1",
    `- 最终结论: ${
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      failedApis.length === 0 &&
      failedCrossChecks.length === 0
        ? "PASS"
        : "FAIL"
    }`,
    "- 关键接口耗时:",
    ...networkEvents.map(
      (event) => `  - ${event.method} ${event.url}: ${event.durationMs}ms (${event.status})`,
    ),
    "- 错误统计:",
    `  - 静态资源 404: ${static404s.length}`,
    `  - console error: ${consoleErrors.length}`,
    `  - pageerror: ${pageErrors.length}`,
    "- 数据流交叉验证:",
    ...crossChecks.map(
      (check) =>
        `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${
          check.pass ? "PASS" : "FAIL"
        }`,
    ),
    "- 截图:",
    "  - verify-1-loaded.png",
    "  - verify-2-after-action.png",
    "  - verify-3-result.png",
    "- 产物目录:",
    `  - ${artifactDir}`,
    "",
  ];

  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    `${reportLines.join("\n")}\n`,
    "utf8",
  );

  if (
    static404s.length > 0 ||
    consoleErrors.length > 0 ||
    pageErrors.length > 0 ||
    failedApis.length > 0 ||
    failedCrossChecks.length > 0
  ) {
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
