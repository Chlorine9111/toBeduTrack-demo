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
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772881288787@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();
const crossChecks = [];
const navigationChecks = [];

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
    url.includes("/api/chat/conversations")
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
    viewport: { width: 1440, height: 1024 },
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

  let profilePayload = null;

  try {
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "networkidle" });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    await page.getByRole("button", { name: /^登录$/ }).click();
    await page.waitForURL((url) => url.pathname === "/main/agent");
    await page.waitForLoadState("networkidle");
    profilePayload = await page.evaluate(async () => {
      const response = await fetch("/api/account/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const sidebar = page.locator("aside").first();
    await sidebar.locator('a[title="文档库"]').click();
    await page.waitForURL((url) => url.pathname === "/main/library");
    const documentLibraryHeading = page.getByTestId("document-list-heading");
    await documentLibraryHeading.waitFor({ state: "visible" });
    assert(
      (await documentLibraryHeading.textContent())?.trim() === "文档库",
      "文档库页标题未正确渲染",
    );
    navigationChecks.push({
      check: "侧边栏文档库入口可达",
      pass: true,
      detail: "点击折叠图标侧边栏后进入 /main/library，标题显示“文档库”",
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await sidebar.locator('a[href="/main/settings"]').click();
    await page.waitForURL((url) => url.pathname === "/main/settings");
    await page.getByRole("heading", { name: "账户设置" }).waitFor({ state: "visible" });
    navigationChecks.push({
      check: "侧边栏设置入口可达",
      pass: true,
      detail: "从折叠图标侧边栏进入 /main/settings 成功",
    });

    const displayNameValue = await page.locator("#settings-display-name").inputValue();
    crossChecks.push({
      apiField: "GET /api/account/profile -> profile.displayName",
      apiValue: profilePayload?.profile?.displayName ?? null,
      domValue: displayNameValue,
      pass: profilePayload?.profile?.displayName === displayNameValue,
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

    const criticalDurations = networkEvents.map(
      (item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`,
    );

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
        (check) =>
          `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${
            check.pass ? "PASS" : "FAIL"
          }`,
      ),
      "- 导航校验:",
      ...navigationChecks.map(
        (check) => `  - ${check.check}: ${check.pass ? "PASS" : "FAIL"} (${check.detail})`,
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
      networkEvents.every((item) => item.status >= 200 && item.status < 300 && item.durationMs <= 30000);

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
    `## UX 验证报告\n\n- 验证级别: L1\n- 最终结论: FAIL\n- 失败原因: ${
      error instanceof Error ? error.message : String(error)
    }\n- 产物目录:\n  - ${artifactDir}\n`,
    "utf8",
  ).catch(() => {});
  console.error(error);
  process.exit(1);
});
