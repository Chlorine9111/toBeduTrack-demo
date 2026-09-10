import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const libraryUrl = `${baseUrl}/main/content-library`;
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();
const crossChecks = [];

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete("apikey");
  url.searchParams.delete("access_token");
  url.searchParams.delete("refresh_token");
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedApi(url) {
  return (
    url.includes("/api/curriculum/options") ||
    url.includes("/api/content-library")
  );
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

function isStatic404(response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  if (resourceType === "stylesheet" || resourceType === "script" || resourceType === "font") {
    return true;
  }
  return /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url());
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

  page.on("console", async (message) => {
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

  let listResponseBody = null;
  let searchResponseBody = null;
  let detailResponseBody = null;

  try {
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);
    await page.waitForLoadState("networkidle");

    const initialListPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-library?") &&
        response.request().method() === "GET",
    );
    const optionsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/curriculum/options") &&
        response.request().method() === "GET",
    );

    await page.goto(libraryUrl, { waitUntil: "domcontentloaded" });

    const initialListResponse = await initialListPromise;
    const optionsResponse = await optionsPromise;
    listResponseBody = await initialListResponse.json();
    const optionsBody = await optionsResponse.json();

    await page.getByRole("heading", { name: "内容库" }).waitFor({ state: "visible" });
    await page.getByTestId("library-search-input").waitFor({ state: "visible" });
    assert(Array.isArray(listResponseBody.items), "内容库列表响应缺少 items");
    assert(listResponseBody.items.length >= 1, "初始内容库条目为空");
    assert(Array.isArray(optionsBody.courses) && optionsBody.courses.length >= 2, "课程筛选数据不足");
    const initialItem = listResponseBody.items[0];
    const initialCard = page
      .getByTestId("library-item-card")
      .filter({ hasText: initialItem.displayTitle ?? initialItem.title ?? "" })
      .first();
    await initialCard.waitFor({ state: "visible" });

    crossChecks.push({
      apiField: "GET /api/content-library -> first.displayTitle",
      apiValue: initialItem.displayTitle ?? initialItem.title ?? null,
      domValue: await initialCard.textContent(),
      pass: Boolean((await initialCard.textContent())?.includes(initialItem.displayTitle ?? initialItem.title ?? "")),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const searchKeyword = `${initialItem.displayTitle ?? initialItem.title ?? ""}`.trim().split(/\s+/)[0] || "AP";
    const searchListPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-library?") &&
        response.url().includes(`q=${encodeURIComponent(searchKeyword)}`) &&
        response.request().method() === "GET",
    );
    await page.getByTestId("library-search-input").fill(searchKeyword);
    const searchListResponse = await searchListPromise;
    searchResponseBody = await searchListResponse.json();
    assert(Array.isArray(searchResponseBody.items) && searchResponseBody.items.length >= 1, "搜索结果为空");
    const searchedItem = searchResponseBody.items[0];
    const searchedCard = page
      .getByTestId("library-item-card")
      .filter({ hasText: searchedItem.displayTitle ?? searchedItem.title ?? "" })
      .first();
    await searchedCard.waitFor({ state: "visible" });
    crossChecks.push({
      apiField: "GET /api/content-library?q=... -> first.displayTitle",
      apiValue: searchedItem.displayTitle ?? searchedItem.title ?? null,
      domValue: await searchedCard.textContent(),
      pass: Boolean((await searchedCard.textContent())?.includes(searchedItem.displayTitle ?? searchedItem.title ?? "")),
    });

    await searchedCard.click();
    const detailRequestPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/content-library/${searchedItem.id}`) &&
        response.request().method() === "GET",
    );
    detailResponseBody = await page.evaluate(async (itemId) => {
      const response = await fetch(`/api/content-library/${itemId}`, { cache: "no-store" });
      return await response.json();
    }, searchedItem.id);
    await detailRequestPromise;

    assert(detailResponseBody?.id === searchedItem.id, "详情接口未返回目标条目");
    await page.getByTestId("content-library-detail-title").waitFor({ state: "visible" });
    const detailTitle = await page.getByTestId("content-library-detail-title").textContent();
    crossChecks.push({
      apiField: "GET /api/content-library/:id -> displayTitle",
      apiValue: detailResponseBody?.displayTitle ?? detailResponseBody?.title ?? null,
      domValue: detailTitle,
      pass: (detailResponseBody?.displayTitle ?? detailResponseBody?.title ?? null) === detailTitle,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
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

    const criticalDurations = networkEvents
      .filter((item) => item.url.includes("/api/content-library"))
      .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`);

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      ...(criticalDurations.length > 0 ? criticalDurations : ["  - 无"]),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (check) => `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${check.pass ? "PASS" : "FAIL"}`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      crossChecks.every((check) => check.pass) &&
      networkEvents
        .filter((item) => item.url.includes("/api/content-library"))
        .every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000);

    if (!pass) {
      throw new Error("L1 验证未通过");
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch(async (error) => {
  await writeJson(path.join(artifactDir, "network.json"), networkEvents).catch(() => {});
  await writeJson(path.join(artifactDir, "errors.json"), {
    consoleErrors,
    pageErrors,
    static404s,
    fatalError: error instanceof Error ? error.message : String(error),
  }).catch(() => {});
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    `## UX 验证报告\n\n- 验证级别: L1\n- 最终结论: FAIL\n- 失败原因: ${error instanceof Error ? error.message : String(error)}\n- 产物目录:\n  - ${artifactDir}\n`,
    "utf8",
  ).catch(() => {});
  console.error(error);
  process.exit(1);
});
