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

function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  ["apikey", "access_token", "refresh_token", "token", "token_hash", "code"].forEach((key) =>
    url.searchParams.delete(key),
  );
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedApi(url) {
  return url.includes("/api/content-library") || url.includes("/api/curriculum/options");
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

async function requestJson(page, url) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, {
      cache: "no-store",
      credentials: "include",
    });
    return await response.json();
  }, url);
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

    await page.goto(`${baseUrl}/main/library`, { waitUntil: "domcontentloaded" });
    await initialListPromise;
    await optionsPromise;

    await page.getByRole("heading", { name: "内容库" }).waitFor({ state: "visible" });
    await page.getByTestId("library-search-input").waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const questionListPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/content-library?") &&
        response.url().includes("type=question"),
    );
    await page.getByRole("button", { name: /测评|Assessments/ }).first().click();
    const questionListBody = await (await questionListPromise).json();
    assert(Array.isArray(questionListBody?.items), "题目视图未返回内容库列表");
    assert(questionListBody.items.length > 0, "内容库测评视图为空，无法验证专属 facet");

    const firstQuestion = questionListBody.items[0];
    const firstQuestionCard = page
      .getByTestId("library-item-card")
      .filter({ hasText: firstQuestion.displayTitle ?? firstQuestion.title ?? "" })
      .first();
    await firstQuestionCard.waitFor({ state: "visible" });

    const detailBody = await requestJson(page, `/api/content-library/${firstQuestion.id}`);
    const exercise = detailBody?.snapshot?.kind === "exercise" ? detailBody.snapshot.exercise : null;
    assert(exercise, "首条测评内容缺少 exercise snapshot");
    assert(typeof exercise.difficulty === "number", "首条测评内容缺少难度字段");
    assert(typeof exercise.assessmentStyle === "string", "首条测评内容缺少考法字段");

    crossChecks.push({
      apiField: "GET /api/content-library?type=question -> first.displayTitle",
      apiValue: firstQuestion.displayTitle ?? firstQuestion.title ?? null,
      domValue: await firstQuestionCard.textContent(),
      pass: Boolean(
        (await firstQuestionCard.textContent())?.includes(
          firstQuestion.displayTitle ?? firstQuestion.title ?? "",
        ),
      ),
    });

    const filteredPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/content-library?") &&
        response.url().includes("type=question") &&
        response.url().includes(`difficulty=${exercise.difficulty}`) &&
        response.url().includes(`assessmentStyle=${exercise.assessmentStyle}`),
    );

    await page.locator("select").nth(0).selectOption(String(exercise.difficulty));
    await page.locator("select").nth(1).selectOption(exercise.assessmentStyle);

    const filteredBody = await (await filteredPromise).json();
    assert(Array.isArray(filteredBody?.items), "专属 facet 筛选未返回结果");
    assert(filteredBody.items.length > 0, "专属 facet 筛选结果为空");

    const filteredItem = filteredBody.items[0];
    const filteredDetail = await requestJson(page, `/api/content-library/${filteredItem.id}`);
    const filteredExercise =
      filteredDetail?.snapshot?.kind === "exercise" ? filteredDetail.snapshot.exercise : null;
    assert(filteredExercise, "筛选后的内容缺少 exercise snapshot");
    assert(filteredExercise.difficulty === exercise.difficulty, "难度过滤结果不匹配");
    assert(
      filteredExercise.assessmentStyle === exercise.assessmentStyle,
      "考法过滤结果不匹配",
    );

    const filteredCard = page
      .getByTestId("library-item-card")
      .filter({ hasText: filteredItem.displayTitle ?? filteredItem.title ?? "" })
      .first();
    await filteredCard.waitFor({ state: "visible" });
    await filteredCard.click();
    await page.getByTestId("content-library-detail-title").waitFor({ state: "visible" });
    const detailTitle = await page.getByTestId("content-library-detail-title").textContent();

    crossChecks.push({
      apiField: "GET /api/content-library?type=question&difficulty&assessmentStyle -> first.displayTitle",
      apiValue: filteredItem.displayTitle ?? filteredItem.title ?? null,
      domValue: await filteredCard.textContent(),
      pass: Boolean(
        (await filteredCard.textContent())?.includes(
          filteredItem.displayTitle ?? filteredItem.title ?? "",
        ),
      ),
    });
    crossChecks.push({
      apiField: "GET /api/content-library/:id -> snapshot.exercise filters",
      apiValue: `difficulty=${filteredExercise.difficulty}, assessmentStyle=${filteredExercise.assessmentStyle}`,
      domValue: detailTitle,
      pass:
        filteredExercise.difficulty === exercise.difficulty &&
        filteredExercise.assessmentStyle === exercise.assessmentStyle,
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
      .map(
        (item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(item.durationMs / 1000).toFixed(2)}s`,
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

    assert(static404s.length === 0, "存在静态资源 404");
    assert(consoleErrors.length === 0, "存在 console error");
    assert(pageErrors.length === 0, "存在 pageerror");
    assert(crossChecks.every((item) => item.pass), "存在数据流交叉验证失败");
    assert(
      networkEvents
        .filter((item) => item.url.includes("/api/content-library"))
        .every((item) => item.status === 200 && item.durationMs <= 30000),
      "存在内容库关键接口失败或超过 30 秒",
    );
  } finally {
    await browser.close();
  }
}

run().catch(async (error) => {
  await fs.mkdir(artifactDir, { recursive: true });
  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), {
    consoleErrors,
    pageErrors,
    static404s,
    fatalError: error instanceof Error ? error.message : String(error),
  });

  const report = [
    "## UX 验证报告",
    "",
    "- 验证级别: L1",
    "- 最终结论: FAIL",
    `- 失败原因: ${error instanceof Error ? error.message : String(error)}`,
    "- 关键接口耗时:",
    ...networkEvents.map(
      (item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(item.durationMs / 1000).toFixed(2)}s`,
    ),
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
  await fs.writeFile(path.join(artifactDir, "report.md"), report.join("\n"), "utf8");
  process.exitCode = 1;
});
