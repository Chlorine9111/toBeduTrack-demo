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

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();
const crossChecks = [];
const routeChecks = [];

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
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedRequest(url) {
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/auth-code-error") ||
    url.includes("/main/feedback") ||
    url.includes("/main/grading") ||
    url.includes("/main/scheduler") ||
    url.includes("/main/pbl") ||
    url.includes("/api/account/profile") ||
    url.includes("/auth/v1/token")
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    const request = response.request();
    const url = request.url();
    if (isTrackedRequest(url)) {
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
        url: sanitizeUrl(url),
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
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="auth-panel-locale-toggle"]').click();
    await page.getByRole("heading", { name: "Welcome back" }).waitFor({ state: "visible" });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/main/agent");
    await page.waitForLoadState("networkidle");

    const profilePayload = await page.evaluate(async () => {
      const response = await fetch("/api/account/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });

    crossChecks.push({
      apiField: "GET /api/account/profile -> profile.displayName",
      apiValue: profilePayload?.profile?.displayName ?? null,
      domValue: await page.getByRole("heading", { level: 1 }).textContent(),
      pass:
        typeof profilePayload?.profile?.displayName === "string" &&
        ((await page.getByRole("heading", { level: 1 }).textContent()) ?? "").includes(
          profilePayload.profile.displayName,
        ),
    });

    await page.goto(`${baseUrl}/main/feedback`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Feedback Center" }).waitFor({ state: "visible" });
    await page.getByPlaceholder("Search similar feedback").waitFor({ state: "visible" });
    routeChecks.push({
      route: "/main/feedback",
      heading: "Feedback Center",
      pass: true,
      detail: "placeholder=Search similar feedback",
    });
    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    await page.goto(`${baseUrl}/main/grading`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "AI Grading" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Create session" }).waitFor({ state: "visible" });
    routeChecks.push({
      route: "/main/grading",
      heading: "AI Grading",
      pass: true,
      detail: "button=Create session",
    });

    await page.goto(`${baseUrl}/main/scheduler`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Smart Scheduling (Simulated Annealing)" }).waitFor({
      state: "visible",
    });
    await page.getByRole("button", { name: "Run scheduler" }).waitFor({ state: "visible" });
    routeChecks.push({
      route: "/main/scheduler",
      heading: "Smart Scheduling (Simulated Annealing)",
      pass: true,
      detail: "button=Run scheduler",
    });
    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await page.goto(`${baseUrl}/main/pbl`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "PBL Projects" }).waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Create project" }).waitFor({ state: "visible" });
    routeChecks.push({
      route: "/main/pbl",
      heading: "PBL Projects",
      pass: true,
      detail: "link=Create project",
    });

    await page.goto(`${baseUrl}/main/pbl/create`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Create a PBL project" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Generate 2-3 overviews" }).waitFor({ state: "visible" });
    routeChecks.push({
      route: "/main/pbl/create",
      heading: "Create a PBL project",
      pass: true,
      detail: "button=Generate 2-3 overviews",
    });

    await page.goto(`${baseUrl}/auth/auth-code-error`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Verification link is unavailable" }).waitFor({
      state: "visible",
    });
    routeChecks.push({
      route: "/auth/auth-code-error",
      heading: "Verification link is unavailable",
      pass: true,
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

    const keyRequests = networkEvents.filter((item) => item.status >= 200 && item.status < 400);
    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      routeChecks.every((item) => item.pass) &&
      crossChecks.every((item) => item.pass) &&
      keyRequests.length > 0;

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      `- 最终结论: ${pass ? "PASS" : "FAIL"}`,
      "- 关键接口耗时:",
      ...networkEvents.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`),
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
      "- 路由可见性校验:",
      ...routeChecks.map(
        (item) =>
          `  - ${item.route} -> ${item.heading}: ${item.pass ? "PASS" : "FAIL"}${
            item.detail ? ` (${item.detail})` : ""
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

    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");

    if (!pass) {
      throw new Error("UX 验证未通过");
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
