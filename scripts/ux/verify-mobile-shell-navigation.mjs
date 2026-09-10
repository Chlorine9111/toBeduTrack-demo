import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";

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

function sanitizePreviewText(value, imageLabel) {
  if (!value) return "";

  return String(value)
    .replace(/!\[[^\]]*]\([^)]*\)/g, imageLabel)
    .replace(/!\[[^\]]*]\([^)]*$/g, imageLabel)
    .replace(/!\[[^\]]*]/g, imageLabel)
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\/api\/pdf\/scan-image\?[^\s)]+/g, "")
    .replace(/[()]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTrackedApi(url) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/content-library") ||
    url.includes("/api/wechat-editor/templates")
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

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13 Pro"],
    locale: "zh-CN",
  });
  const page = await context.newPage();

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
    console.log("[verify-mobile-shell] open login page");
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });

    if (new URL(page.url()).pathname === "/auth/login") {
      console.log("[verify-mobile-shell] submit login form");
      await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
      await page.locator("#login-email").fill(loginEmail);
      await page.locator("#login-password").fill(loginPassword);
      await page.getByRole("button", { name: /^登录$/ }).click();
    }

    console.log("[verify-mobile-shell] wait for /main/agent");
    await page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 60000 });
    await page.getByRole("button", { name: "打开导航菜单" }).waitFor({ state: "visible" });
    await page.locator('[data-testid="agent-composer"]').waitFor({ state: "visible" });

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

    console.log("[verify-mobile-shell] open mobile drawer");
    await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: "收起导航" }).waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    console.log("[verify-mobile-shell] navigate to wechat editor");
    const wechatTemplatesResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/wechat-editor/templates") &&
        response.request().method() === "GET" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 60000 },
    );

    await page.locator('aside nav [data-testid="sidebar-nav-wechat-editor"]').click();

    await page.waitForURL((url) => url.pathname === "/main/wechat-editor", { timeout: 60000 });
    await wechatTemplatesResponse;
    await page.locator('[data-testid="wechat-editor-title"]').waitFor({ state: "visible" });
    await page.getByRole("button", { name: "智能导入" }).waitFor({ state: "visible" });
    await page.locator("textarea").waitFor({ state: "visible" });
    await page.locator("textarea").click();
    await page.getByRole("button", { name: "继续配置导入" }).click();
    const smartDialog = page.locator('[data-testid="smart-import-dialog"]');
    await smartDialog.getByText("方式一：文本输入").waitFor({ state: "visible" });
    await smartDialog.locator("textarea").fill("家长会后教学反馈");
    await smartDialog.getByRole("button", { name: "确定" }).waitFor({ state: "visible" });

    const sectionTitle = (await page.locator('[data-testid="wechat-editor-title"]').textContent()) ?? "";
    crossChecks.push({
      apiField: "GET /api/wechat-editor/templates -> status",
      apiValue: 200,
      domValue: sectionTitle,
      pass: sectionTitle.includes("公众号文章编辑器"),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });
    await smartDialog.getByRole("button", { name: "取消" }).click();

    console.log("[verify-mobile-shell] navigate to content library");
    const contentLibraryResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/content-library") &&
        response.request().method() === "GET" &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 60000 },
    );

    await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.locator('aside nav [data-testid="sidebar-nav-library"]').click();

    await page.waitForURL((url) => url.pathname === "/main/library", { timeout: 60000 });
    await contentLibraryResponse;
    await page.locator('[data-testid="library-search-input"]').waitFor({ state: "visible" });
    const firstLibraryCard = page.locator('[data-testid="library-item-card"]').first();
    await firstLibraryCard.waitFor({ state: "visible" });
    console.log("[verify-mobile-shell] content library ready");

    const libraryPayload = await page.evaluate(async () => {
      const response = await fetch("/api/content-library?type=all", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });

    const totalLabel = (await page.locator("text=/条内容$/").first().textContent()) ?? "";
    crossChecks.push({
      apiField: "GET /api/content-library -> total",
      apiValue: libraryPayload?.total ?? null,
      domValue: totalLabel,
      pass:
        typeof libraryPayload?.total === "number" &&
        totalLabel.includes(String(libraryPayload.total)),
    });

    const detailItemId = await firstLibraryCard.getAttribute("data-item-id");
    assert(detailItemId, "内容卡片缺少可验证的 itemId");

    await firstLibraryCard.click();
    await page.locator('[data-testid="content-library-detail-sheet"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="content-library-detail-title"]').waitFor({ state: "visible" });
    await page.getByRole("button", { name: "保存详情信息" }).waitFor({ state: "visible" });

    const detailPayload = await page.evaluate(async (itemId) => {
      const response = await fetch(`/api/content-library/${itemId}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    }, detailItemId);

    const detailTitle =
      (await page.locator('[data-testid="content-library-detail-title"]').textContent()) ?? "";
    const normalizedDetailTitle = sanitizePreviewText(
      detailPayload?.displayTitle ?? detailPayload?.title ?? "",
      "（附图）",
    );
    crossChecks.push({
      apiField: "GET /api/content-library/[itemId] -> displayTitle",
      apiValue: normalizedDetailTitle || null,
      domValue: detailTitle,
      pass:
        typeof normalizedDetailTitle === "string" &&
        normalizedDetailTitle.length > 0 &&
        detailTitle.includes(normalizedDetailTitle),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-4-library.png"),
      fullPage: true,
    });
    console.log("[verify-mobile-shell] write artifacts");

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });

    const trackedLines = networkEvents.map(
      (item) =>
        `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.status} / ${item.durationMs}ms`,
    );

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      networkEvents.every((item) => item.status >= 200 && item.status < 300) &&
      networkEvents.every((item) => item.durationMs <= 30000) &&
      crossChecks.length > 0 &&
      crossChecks.every((item) => item.pass);

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      `- 最终结论: ${pass ? "PASS" : "FAIL"}`,
      "- 关键接口耗时:",
      ...(trackedLines.length > 0 ? trackedLines : ["  - 无"]),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (item) =>
          `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domValue}\`: ${
            item.pass ? "PASS" : "FAIL"
          }`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "  - verify-4-library.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");

    if (!pass) {
      throw new Error("移动端主壳与公众号编辑器 UX 验证未通过");
    }
  } finally {
    await browser.close();
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
