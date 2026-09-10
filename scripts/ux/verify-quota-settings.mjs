import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();
const crossChecks = [];

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

function isTrackedUrl(url) {
  return url.includes("/main/settings") || url.includes("/api/quota");
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
    const request = response.request();
    const url = request.url();
    if (isTrackedUrl(url)) {
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
    await page.goto(`${baseUrl}/main/settings`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "个人资料", exact: true }).waitFor({
      state: "visible",
      timeout: 10000,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
      caret: "initial",
    });

    await page.getByRole("button", { name: "使用量", exact: true }).click({ force: true });
    await page.waitForFunction(
      () => document.body.innerText.includes("测试期使用量"),
      undefined,
      { timeout: 15000 },
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
      caret: "initial",
    });

    const quotaResponse = await page.evaluate(async () => {
      const startedAt = performance.now();
      const response = await fetch("/api/quota", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json();
      return {
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        body: {
          plan: payload.summary?.plan,
          status: payload.summary?.status,
          quotaTotal: payload.summary?.quotaTotal,
          quotaUsed: payload.summary?.quotaUsed,
          quotaRemaining: payload.summary?.quotaRemaining,
          periodDays: payload.summary?.periodDays,
          usageRatio: payload.summary?.usageRatio,
          periodEnd: payload.summary?.periodEnd,
        },
      };
    });

    const usagePercent = Math.min(
      100,
      Math.round(Number(quotaResponse.body.usageRatio ?? 0) * 100),
    );
    const badgeText = (
      await page.locator("section").first().locator("span").first().innerText()
    ).trim();
    const usageText = (await page.getByText(/本周期已使用/).first().innerText()).trim();
    const resetText = (await page.getByText(/预计重置时间/).first().innerText()).trim();
    const remainingCardText = (
      await page.getByText("剩余额度", { exact: true }).locator("xpath=..").innerText()
    ).trim();
    const periodDaysCardText = (
      await page.getByText("周期长度", { exact: true }).locator("xpath=..").innerText()
    ).trim();

    crossChecks.push({
      apiField: "GET /api/quota -> quotaRemaining",
      apiValue: quotaResponse.body.quotaRemaining,
      domValue: remainingCardText,
      pass: remainingCardText.includes(String(quotaResponse.body.quotaRemaining)),
    });
    crossChecks.push({
      apiField: "GET /api/quota -> usageRatio",
      apiValue: usagePercent,
      domValue: usageText,
      pass: usageText.includes(`${usagePercent}%`),
    });
    crossChecks.push({
      apiField: "GET /api/quota -> periodDays",
      apiValue: quotaResponse.body.periodDays,
      domValue: periodDaysCardText,
      pass: periodDaysCardText.includes(String(quotaResponse.body.periodDays)),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
      caret: "initial",
    });

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });

    const quotaEvents = networkEvents.filter((item) => item.url.includes("/api/quota"));
    const keyDurations = quotaEvents.map(
      (item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`,
    );
    const allCrossChecksPass = crossChecks.every((item) => item.pass);
    const allQuotaRequestsPass = quotaEvents.length > 0 && quotaEvents.every((item) => item.status === 200);
    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      allQuotaRequestsPass &&
      quotaEvents.every((item) => item.durationMs <= 30000) &&
      allCrossChecksPass;

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      `- 最终结论: ${pass ? "PASS" : "FAIL"}`,
      "- 关键接口耗时:",
      ...(keyDurations.length > 0 ? keyDurations : ["  - 无"]),
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
      "- 额外观察:",
      `  - 徽标文案: ${badgeText}`,
      `  - 使用量文案: ${usageText}`,
      `  - 重置文案: ${resetText}`,
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");

    assert(pass, "额度设置页 UX 验证未通过");
    console.log(`quota settings UX verification: PASS`);
    console.log(`report: ${artifactDir}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error("quota settings UX verification: FAIL");
  console.error(error);
  process.exitCode = 1;
});
