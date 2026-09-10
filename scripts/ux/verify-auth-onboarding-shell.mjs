import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const mailpitUrl = process.env.UX_MAILPIT_URL ?? "http://127.0.0.1:54324";
const timestamp = Date.now();
const email = `teacher.onboarding.${timestamp}@example.com`;
const password = "Teacher123A";
const originalName = "自动化老师";
const updatedName = "自动化老师-已更新";
const updatedRole = "AP Biology 教师";
const updatedSchool = "North Star Academy";

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

function isTrackedApi(url) {
  return (
    url.includes("/api/account/onboarding") ||
    url.includes("/api/account/profile") ||
    url.includes("/api/content-library") ||
    url.includes("/api/curriculum/options") ||
    url.includes("/auth/v1/token") ||
    url.includes("/auth/v1/verify") ||
    url.includes("/auth/v1/logout")
  );
}

function isSuccessfulNetworkEvent(item) {
  if (item.url.includes("/auth/v1/verify")) {
    return item.status === 303;
  }

  return item.status >= 200 && item.status < 300;
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

async function waitForMailMessage(targetEmail, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const listResponse = await fetch(`${mailpitUrl}/api/v1/messages`);
    const listPayload = await listResponse.json();
    const matched = listPayload.messages?.find((item) =>
      Array.isArray(item.To) && item.To.some((entry) => entry.Address === targetEmail),
    );

    if (matched?.ID) {
      const detailResponse = await fetch(`${mailpitUrl}/api/v1/message/${matched.ID}`);
      const detailPayload = await detailResponse.json();
      const text = detailPayload.Text ?? "";
      const verifyUrlMatch = text.match(/https?:\/\/[^\s)]+/);
      if (verifyUrlMatch?.[0]) {
        return verifyUrlMatch[0];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("未能在 Mailpit 中拿到验证邮件");
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

  let profilePatchBody = null;

  try {
    await page.goto(`${baseUrl}/auth/register`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator("#register-full-name").fill(originalName);
    await page.locator("#register-email").fill(email);
    await page.locator("#register-password").fill(password);
    await page.locator("#register-confirm-password").fill(password);
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForFunction(
      ([nextName, nextEmail]) => {
        const nameInput = document.querySelector("#register-full-name");
        const emailInput = document.querySelector("#register-email");
        const checkbox = document.querySelector('input[type="checkbox"]');
        return (
          nameInput instanceof HTMLInputElement &&
          emailInput instanceof HTMLInputElement &&
          checkbox instanceof HTMLInputElement &&
          nameInput.value === nextName &&
          emailInput.value === nextEmail &&
          checkbox.checked
        );
      },
      [originalName, email],
    );

    await page.getByRole("button", { name: "创建账户" }).click();

    const registerOutcome = await Promise.race([
      page
        .getByText("验证邮件已发送到")
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "notice"),
      page
        .waitForURL((url) => url.pathname.startsWith("/onboarding") || url.pathname.startsWith("/main"), {
          timeout: 15000,
        })
        .then(() => "redirect"),
    ]).catch(() => "unknown");

    if (registerOutcome === "notice") {
      const verifyUrl = await waitForMailMessage(email);
      await page.goto(verifyUrl, { waitUntil: "domcontentloaded" });
    } else if (registerOutcome === "unknown") {
      throw new Error("注册后既没有看到验证提示，也没有进入工作台/引导页");
    }

    await page.waitForURL(
      (url) =>
        url.pathname === "/onboarding/basic-info" ||
        url.pathname === "/auth/login" ||
        url.pathname === "/main",
      { timeout: 30000 },
    );

    if (new URL(page.url()).pathname === "/auth/login") {
      await page.waitForLoadState("networkidle");
      await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill(password);
      await page.getByRole("button", { name: "登录" }).click();
    }

    await page.waitForURL((url) => url.pathname === "/onboarding/basic-info");
    await page.getByRole("heading", { name: "完善你的教师资料" }).waitFor({ state: "visible" });
    await page.waitForFunction((nextName) => {
      const nameInput = document.querySelector("#onboarding-full-name");
      return nameInput instanceof HTMLInputElement && nameInput.value === nextName;
    }, originalName);
    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const onboardingNameValue = await page.locator("#onboarding-full-name").inputValue();
    assert(onboardingNameValue === originalName, "注册后的基础资料没有预填教师姓名");

    await page.locator("#onboarding-full-name").fill(updatedName);
    await page.locator("#onboarding-role-title").fill(updatedRole);
    await page.locator("#onboarding-school-name").fill(updatedSchool);

    const basicInfoPatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/account/onboarding") &&
        response.request().method() === "PATCH" &&
        response.request().postData()?.includes("\"action\":\"basic_info\""),
    );
    await page.getByRole("button", { name: "继续下一步" }).click();
    await basicInfoPatchPromise;

    await page.waitForURL((url) => url.pathname === "/onboarding/subjects");
    await page.getByRole("button", { name: "AP Biology" }).click();

    const subjectsPatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/account/onboarding") &&
        response.request().method() === "PATCH" &&
        response.request().postData()?.includes("\"action\":\"subjects\""),
    );
    await page.getByRole("button", { name: "继续下一步" }).click();
    await subjectsPatchPromise;

    await page.waitForURL((url) => url.pathname === "/onboarding/get-started");
    await page.getByRole("button", { name: "进入自主 Agent" }).waitFor({ state: "visible" });

    const completePatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/account/onboarding") &&
        response.request().method() === "PATCH" &&
        response.request().postData()?.includes("\"action\":\"complete\""),
    );
    await page.getByRole("button", { name: "进入自主 Agent" }).click();
    await completePatchPromise;

    await page.waitForURL((url) => url.pathname === "/main/agent");
    await page.getByText("欢迎回来，").waitFor({ state: "visible" });

    const sidebar = page.locator("aside").first();
    await sidebar.getByRole("button", { name: "内容库", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/main/library");
    await page.getByRole("heading", { name: "Content Library" }).waitFor({ state: "visible" });
    await page.getByText("暂时没有匹配内容").waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await sidebar.getByRole("button", { name: "设置", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/main/settings");
    await page.getByRole("heading", { name: "账户与安全" }).waitFor({ state: "visible" });

    await page.locator("#account-full-name").fill(updatedName);
    await page.locator("#account-role-title").fill("Lead AP Biology Teacher");
    await page.locator("#account-school-name").fill("North Star Academy");

    const profilePatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/account/profile") &&
        response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "保存账户资料" }).click();
    const profilePatchResponse = await profilePatchPromise;
    profilePatchBody = await profilePatchResponse.json();
    await page.getByText("账户资料已更新。").waitFor({ state: "visible" });

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/auth/login", {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      }),
      page.getByRole("button", { name: "退出登录", exact: true }).click(),
    ]);
    await page.getByText("你已安全退出").waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/auth/login?next=${encodeURIComponent("/main/settings")}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "登录" }).click();

    await page.waitForURL((url) => url.pathname === "/main/settings");
    await page.getByRole("heading", { name: "账户与安全" }).waitFor({ state: "visible" });
    const persistedRoleValue = await page.locator("#account-role-title").inputValue();

    crossChecks.push({
      apiField: "PATCH /api/account/profile -> profile.roleTitle",
      apiValue: profilePatchBody?.profile?.roleTitle ?? null,
      domValue: persistedRoleValue,
      pass: profilePatchBody?.profile?.roleTitle === persistedRoleValue,
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
          `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${check.pass ? "PASS" : "FAIL"}`,
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
      networkEvents.every((item) => isSuccessfulNetworkEvent(item) && item.durationMs <= 30000);

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
