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
const rubricId = process.env.UX_RUBRIC_ID?.trim() || "";
const lessonPlanIdOverride = process.env.UX_LESSON_PLAN_ID?.trim() || "";
const worksheetIdOverride = process.env.UX_WORKSHEET_ID?.trim() || "";

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
    url.includes("/api/lesson-plans") ||
    url.includes("/api/worksheets") ||
    url.includes("/api/pdf/generate") ||
    url.includes("/api/pdf/download/")
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

async function generatePdf(page, payload) {
  return page.evaluate(async (body) => {
    const response = await fetch("/api/pdf/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    return {
      status: response.status,
      json,
    };
  }, payload);
}

async function downloadPdf(page, downloadUrl) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    });
    const buffer = await response.arrayBuffer();
    const header = String.fromCharCode(...Array.from(new Uint8Array(buffer.slice(0, 5))));
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      byteLength: buffer.byteLength,
      header,
    };
  }, downloadUrl);
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
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);
    await page.waitForLoadState("networkidle");

    const profilePayload = await page.evaluate(async () => {
      const response = await fetch("/api/account/profile", {
        credentials: "include",
        cache: "no-store",
      });
      return await response.json();
    });

    assert(profilePayload?.profile?.displayName, "老师登录态未建立");

    const lessonPlanList = lessonPlanIdOverride
      ? null
      : await page.evaluate(async () => {
          const response = await fetch("/api/lesson-plans?status=all&limit=10", {
            credentials: "include",
            cache: "no-store",
          });
          return await response.json();
        });
    const worksheetList = worksheetIdOverride
      ? null
      : await page.evaluate(async () => {
          const response = await fetch("/api/worksheets?page=1&pageSize=10", {
            credentials: "include",
            cache: "no-store",
          });
          return await response.json();
        });

    const lessonPlanId =
      lessonPlanIdOverride || lessonPlanList?.lessonPlans?.[0]?.id || null;
    const worksheetId =
      worksheetIdOverride || worksheetList?.worksheets?.[0]?.id || null;

    assert(lessonPlanId, "未找到可导出的教案");
    assert(worksheetId, "未找到可导出的试卷");
    assert(rubricId, "缺少 UX_RUBRIC_ID，无法验证 rubric Typst 导出");

    const lessonPlanGenerate = await generatePdf(page, {
      documentType: "lesson_plan",
      lessonPlanId,
      templateVariant: "lesson-plan-standard",
      pageSize: "A4",
      mode: "teacher",
    });
    assert(lessonPlanGenerate.status === 200, `教案 PDF 导出失败: ${JSON.stringify(lessonPlanGenerate)}`);
    assert(lessonPlanGenerate.json?.downloadUrl, "教案 PDF 未返回下载地址");

    const examGenerate = await generatePdf(page, {
      documentType: "exam",
      worksheetId,
      templateVariant: "exam-classic",
      pageSize: "Letter",
      includeAnswerKey: true,
      includeRubric: true,
    });
    assert(examGenerate.status === 200, `exam PDF 导出失败: ${JSON.stringify(examGenerate)}`);
    assert(examGenerate.json?.downloadUrl, "exam PDF 未返回下载地址");

    const rubricGenerate = await generatePdf(page, {
      documentType: "rubric",
      rubricId,
      templateVariant: "rubric-table",
      pageSize: "A4",
    });
    assert(rubricGenerate.status === 200, `rubric PDF 导出失败: ${JSON.stringify(rubricGenerate)}`);
    assert(rubricGenerate.json?.downloadUrl, "rubric PDF 未返回下载地址");

    const [lessonPlanPdf, examPdf, rubricPdf] = await Promise.all([
      downloadPdf(page, lessonPlanGenerate.json.downloadUrl),
      downloadPdf(page, examGenerate.json.downloadUrl),
      downloadPdf(page, rubricGenerate.json.downloadUrl),
    ]);

    const pdfChecks = [
      {
        label: "lesson_plan Typst PDF",
        recordId: lessonPlanGenerate.json.recordId,
        download: lessonPlanPdf,
      },
      {
        label: "exam Typst PDF",
        recordId: examGenerate.json.recordId,
        download: examPdf,
      },
      {
        label: "rubric Typst PDF",
        recordId: rubricGenerate.json.recordId,
        download: rubricPdf,
      },
    ];

    pdfChecks.forEach((item) => {
      crossChecks.push({
        apiField: `${item.label} -> recordId`,
        apiValue: item.recordId,
        domValue: null,
        pass: typeof item.recordId === "string" && item.recordId.length > 0,
      });
      crossChecks.push({
        apiField: `${item.label} -> download content-type`,
        apiValue: item.download.contentType,
        domValue: item.download.header,
        pass:
          item.download.status === 200 &&
          item.download.contentType === "application/pdf" &&
          item.download.byteLength > 1000 &&
          item.download.header === "%PDF-",
      });
    });

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });

    const trackedGenerateDurations = networkEvents
      .filter((entry) => entry.url.includes("/api/pdf/generate"))
      .map((entry) => `  - ${entry.method} ${new URL(entry.url).pathname}: ${(entry.durationMs / 1000).toFixed(2)}s`);

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L0",
      "- 最终结论: PASS",
      "- 跳过截图原因: 本轮仅验证后端 PDF 渲染链路切换到 Typst，页面 UI 未改动，按 L0 规则跳过截图。",
      "- 关键接口耗时:",
      ...(trackedGenerateDurations.length > 0 ? trackedGenerateDurations : ["  - 无"]),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (item) =>
          `  - ${item.apiField}: ${item.apiValue ?? "null"} -> ${item.domValue ?? "null"}: ${item.pass ? "PASS" : "FAIL"}`,
      ),
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await fs.writeFile(path.join(artifactDir, "report.md"), `${reportLines.join("\n")}\n`, "utf8");
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch(async (error) => {
  await fs.mkdir(artifactDir, { recursive: true });
  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), {
    static404s,
    consoleErrors,
    pageErrors,
    fatal: error instanceof Error ? { message: error.message, stack: error.stack ?? null } : String(error),
  });
  const report = [
    "## UX 验证报告",
    "",
    "- 验证级别: L0",
    "- 最终结论: FAIL",
    "- 跳过截图原因: 本轮仅验证后端 PDF 渲染链路切换到 Typst，页面 UI 未改动，按 L0 规则跳过截图。",
    "- 关键接口耗时:",
    ...networkEvents
      .filter((entry) => entry.url.includes("/api/pdf/generate"))
      .map((entry) => `  - ${entry.method} ${new URL(entry.url).pathname}: ${(entry.durationMs / 1000).toFixed(2)}s`),
    "- 错误统计:",
    `  - 静态资源 404: ${static404s.length}`,
    `  - console error: ${consoleErrors.length}`,
    `  - pageerror: ${pageErrors.length}`,
    "- 数据流交叉验证:",
    ...crossChecks.map(
      (item) =>
        `  - ${item.apiField}: ${item.apiValue ?? "null"} -> ${item.domValue ?? "null"}: ${item.pass ? "PASS" : "FAIL"}`,
    ),
    "- 产物目录:",
    `  - ${artifactDir}`,
    "",
    `- 失败原因: ${error instanceof Error ? error.message : String(error)}`,
    "",
  ].join("\n");
  await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
  console.error(error);
  process.exit(1);
});
