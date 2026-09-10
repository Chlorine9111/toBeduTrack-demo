import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3003";
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
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedApi(url) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/curriculum/options") ||
    url.includes("/api/question-bank")
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

  let questionListBody = null;
  let questionDetailBody = null;
  let filteredListBody = null;

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

    const listPromise = page.waitForResponse((response) => {
      const url = response.url();
      return (
        response.request().method() === "GET" &&
        (url.includes("/api/question-bank?") || url.endsWith("/api/question-bank"))
      );
    });
    const curriculumPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/curriculum/options") &&
        response.request().method() === "GET",
    );

    await page.goto(`${baseUrl}/main/question-bank`, { waitUntil: "domcontentloaded" });
    questionListBody = await (await listPromise).json();
    await curriculumPromise;

    await page.getByRole("heading", { name: "题目资料整理" }).waitFor({ state: "visible" });
    await page.getByTestId("question-bank-search").waitFor({ state: "visible" });
    await page.getByTestId("question-bank-question-list").waitFor({ state: "visible" });

    assert(Array.isArray(questionListBody?.items), "题库列表接口未返回 items");
    assert(questionListBody.items.length > 0, "题库列表为空，无法验证题目整理流程");

    const totalText = await page.getByTestId("question-bank-total").textContent();
    crossChecks.push({
      apiField: "GET /api/question-bank -> total",
      apiValue: questionListBody.total,
      domValue: totalText,
      pass: typeof totalText === "string" && totalText.includes(String(questionListBody.total)),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const firstQuestion =
      questionListBody.items.find((item) => item.knowledgeSubskillLabel) ??
      questionListBody.items[0];
    assert(firstQuestion.knowledgeCluster, "首条题目缺少知识簇，无法验证自动分类");
    assert(firstQuestion.assessmentStyle, "首条题目缺少考察方式，无法验证自动分类");
    assert(firstQuestion.knowledgeSubskillLabel, "首条题目缺少细分知识点，无法验证 AI 小类分类");

    const filteredPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/question-bank?") &&
        response.url().includes(`knowledgeCluster=${firstQuestion.knowledgeCluster}`),
    );
    await page
      .getByTestId("question-bank-knowledge-cluster-filter")
      .selectOption(firstQuestion.knowledgeCluster);
    filteredListBody = await (await filteredPromise).json();

    assert(Array.isArray(filteredListBody?.items), "知识簇筛选后未返回题库列表");
    assert(filteredListBody.items.length > 0, "知识簇筛选后没有题目，无法验证分类结果");
    assert(
      filteredListBody.items.every(
        (item) => item.knowledgeCluster === firstQuestion.knowledgeCluster,
      ),
      "知识簇筛选结果包含不匹配的题目",
    );
    assert(
      filteredListBody.items.some((item) => item.knowledgeSubskillLabel),
      "知识簇筛选后没有可见的细分知识点，无法验证 AI 小类分类",
    );
    const filteredTarget =
      filteredListBody.items.find((item) => item.knowledgeSubskillLabel) ??
      filteredListBody.items[0];
    const detailTarget = filteredTarget;
    const selectedBeforeClick =
      await page.getByTestId("question-bank-selected-item").count().catch(() => 0);
    const detailResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url().includes(`/api/question-bank/${detailTarget.id}`),
        { timeout: 10000 },
      )
      .then((response) => response.json())
      .catch(() => null);

    await page.getByText(filteredTarget.title, { exact: false }).first().click();

    questionDetailBody = await detailResponsePromise;
    if (!questionDetailBody) {
      if (selectedBeforeClick === 0) {
        await page.getByTestId("question-bank-selected-item").waitFor({ state: "visible" });
      }
      questionDetailBody = await page.evaluate(async ({ id }) => {
        const response = await fetch(`/api/question-bank/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        return await response.json();
      }, { id: detailTarget.id });
    }

    const selectedCard = page.getByTestId("question-bank-selected-item");
    await selectedCard.waitFor({ state: "visible" });
    const selectedCardText = await selectedCard.textContent();
    crossChecks.push({
      apiField: "GET /api/question-bank?knowledgeCluster -> first.knowledgeClusterLabel",
      apiValue: filteredTarget.knowledgeClusterLabel,
      domValue: selectedCardText,
      pass: `${selectedCardText ?? ""}`.includes(filteredTarget.knowledgeClusterLabel),
    });
    const selectedSubskillText = await page
      .getByTestId("question-bank-selected-subskill")
      .textContent();
    crossChecks.push({
      apiField: "GET /api/question-bank?knowledgeCluster -> first.knowledgeSubskillLabel",
      apiValue: filteredTarget.knowledgeSubskillLabel ?? null,
      domValue: selectedSubskillText,
      pass: Boolean(filteredTarget.knowledgeSubskillLabel) &&
        `${selectedSubskillText ?? ""}`.includes(filteredTarget.knowledgeSubskillLabel),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await page.getByTestId("question-bank-source-panel").waitFor({ state: "visible" });
    await page.getByTestId("question-bank-taxonomy-panel").waitFor({ state: "visible" });

    const detailTitle = await page
      .locator('[data-testid="question-bank-detail"] h2')
      .first()
      .textContent();
    crossChecks.push({
      apiField: "GET /api/question-bank/:id -> title",
      apiValue: questionDetailBody?.title ?? null,
      domValue: detailTitle,
      pass: questionDetailBody?.title === detailTitle,
    });

    const sourcePanelText = await page.getByTestId("question-bank-source-panel").textContent();
    crossChecks.push({
      apiField: "GET /api/question-bank/:id -> sourceFileName",
      apiValue: questionDetailBody?.sourceFileName ?? null,
      domValue: sourcePanelText,
      pass: questionDetailBody?.sourceFileName
        ? `${sourcePanelText ?? ""}`.includes(questionDetailBody.sourceFileName)
        : `${sourcePanelText ?? ""}`.includes("暂无文件名"),
    });

    const taxonomyPanelText = await page.getByTestId("question-bank-taxonomy-panel").textContent();
    crossChecks.push({
      apiField: "GET /api/question-bank/:id -> knowledgeClusterLabel",
      apiValue: questionDetailBody?.knowledgeClusterLabel ?? null,
      domValue: taxonomyPanelText,
      pass: questionDetailBody?.knowledgeClusterLabel
        ? `${taxonomyPanelText ?? ""}`.includes(questionDetailBody.knowledgeClusterLabel)
        : false,
    });
    crossChecks.push({
      apiField: "GET /api/question-bank/:id -> assessmentStyleLabel",
      apiValue: questionDetailBody?.assessmentStyleLabel ?? null,
      domValue: taxonomyPanelText,
      pass: questionDetailBody?.assessmentStyleLabel
        ? `${taxonomyPanelText ?? ""}`.includes(questionDetailBody.assessmentStyleLabel)
        : false,
    });
    const detailSubskillText = await page
      .getByTestId("question-bank-subskill-label")
      .textContent();
    crossChecks.push({
      apiField: "GET /api/question-bank/:id -> knowledgeSubskillLabel",
      apiValue: questionDetailBody?.knowledgeSubskillLabel ?? null,
      domValue: detailSubskillText,
      pass: questionDetailBody?.knowledgeSubskillLabel
        ? `${detailSubskillText ?? ""}`.includes(questionDetailBody.knowledgeSubskillLabel)
        : `${detailSubskillText ?? ""}`.includes("当前还没有稳定细分知识点"),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });

    const trackedGeneration = networkEvents.filter((event) =>
      event.url.includes("/api/question-bank") ||
      event.url.includes("/api/question-bank/materials"),
    );
    const keyApiFailed = trackedGeneration.some((event) => event.status >= 400);
    const slowApis = trackedGeneration.filter((event) => event.durationMs > 30000);
    const failedCrossChecks = crossChecks.filter((item) => !item.pass);
    const passed =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      !keyApiFailed &&
      slowApis.length === 0 &&
      failedCrossChecks.length === 0;

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${passed ? "PASS" : "FAIL"}
- 关键接口耗时:
${trackedGeneration
  .map((event) => `  - ${event.method} ${event.url.replace(baseUrl, "")}: ${(event.durationMs / 1000).toFixed(2)}s`)
  .join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks
  .map(
    (item) =>
      `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${String(item.apiValue ?? "")}\`: ${
        item.pass ? "PASS" : "FAIL"
      }`,
  )
  .join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");

    if (!passed) {
      throw new Error(
        [
          static404s.length ? `静态资源 404=${static404s.length}` : "",
          consoleErrors.length ? `console error=${consoleErrors.length}` : "",
          pageErrors.length ? `pageerror=${pageErrors.length}` : "",
          keyApiFailed ? "关键 API 失败" : "",
          slowApis.length ? "关键 API 超过 30 秒" : "",
          failedCrossChecks.length ? "数据流交叉验证失败" : "",
        ]
          .filter(Boolean)
          .join("；"),
      );
    }
  } finally {
    await browser.close();
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
