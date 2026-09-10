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
const samplePdfPath =
  process.env.UX_SAMPLE_KNOWLEDGE_PDF ??
  path.join(process.cwd(), "tmp", "ux-upload-sample.pdf");
const uploadSubject = process.env.UX_UPLOAD_SUBJECT ?? "AP Calculus AB";
const uploadUnit = process.env.UX_UPLOAD_UNIT ?? "Unit 3";
const autoImportTimeoutMs = Math.max(
  120000,
  Number.parseInt(process.env.UX_AUTO_IMPORT_TIMEOUT_MS ?? "300000", 10) || 300000,
);

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
    url.includes("/api/question-bank") ||
    url.includes("/api/question-bank/materials") ||
    url.includes("/api/knowledge/upload")
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

async function waitForAutoImport(page, fileName) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < autoImportTimeoutMs) {
    const payload = await page.evaluate(async ({ fileName: innerFileName }) => {
      const response = await fetch(
        `/api/question-bank/materials?q=${encodeURIComponent(innerFileName)}&limit=20`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      return await response.json();
    }, { fileName });

    const item = Array.isArray(payload?.items)
      ? payload.items.find((entry) => entry.materialType === "knowledge_document" && entry.title === fileName)
      : null;

    if (
      item &&
      ["saved", "requires_review", "requires_curriculum", "failed", "no_questions", "skipped"].includes(
        item.questionBankStatus ?? "",
      )
    ) {
      return item;
    }

    await page.waitForTimeout(1500);
  }

  throw new Error("等待知识库自动抽题结果超时");
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });
  const pdfBuffer = await fs.readFile(samplePdfPath);
  const uploadFileName = `ux-question-material-${Date.now()}-questions.pdf`;

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

  let uploadBody = null;
  let materialListBody = null;
  let questionListBody = null;
  let questionDetailBody = null;

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

    await page.goto(`${baseUrl}/main/question-bank?tab=materials`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "题目资料整理" }).waitFor({ state: "visible" });
    await page.getByTestId("question-bank-material-list").waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const uploadPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/api/knowledge/upload"),
    );

    await page.evaluate(
      async ({ bytes, fileName, subject, unit }) => {
        const formData = new FormData();
        const file = new File([new Uint8Array(bytes)], fileName, {
          type: "application/pdf",
        });
        formData.append("file", file);
        formData.append("subject", subject);
        formData.append("unit", unit);
        const response = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        return await response.json();
      },
      { bytes: [...pdfBuffer], fileName: uploadFileName, subject: uploadSubject, unit: uploadUnit },
    );

    uploadBody = await (await uploadPromise).json();
    assert(Array.isArray(uploadBody?.documents), "知识库上传接口未返回 documents");
    assert(uploadBody.documents[0]?.filename === uploadFileName, "知识库上传返回文件名不匹配");

    const autoImportedItem = await waitForAutoImport(page, uploadFileName);

    await page.getByTestId("question-bank-search").fill(uploadFileName);
    const materialsResponse = await page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/question-bank/materials") &&
        response.url().includes(encodeURIComponent(uploadFileName)),
    );
    materialListBody = await materialsResponse.json();

    const materialCard = page
      .getByTestId("question-bank-material-card")
      .filter({ hasText: uploadFileName })
      .first();
    await materialCard.waitFor({ state: "visible" });

    crossChecks.push({
      apiField: "POST /api/knowledge/upload -> documents[0].filename",
      apiValue: uploadBody.documents[0]?.filename ?? null,
      domValue: await materialCard.textContent(),
      pass: `${await materialCard.textContent() ?? ""}`.includes(uploadFileName),
    });

    crossChecks.push({
      apiField: "GET /api/question-bank/materials -> questionBankStatus",
      apiValue: autoImportedItem.questionBankStatus ?? null,
      domValue: await materialCard.textContent(),
      pass: `${await materialCard.textContent() ?? ""}`.includes(
        autoImportedItem.questionBankStatus === "saved"
          ? "已自动入题库"
          : autoImportedItem.questionBankStatus === "requires_review"
            ? "部分待审核"
            : autoImportedItem.questionBankStatus === "requires_curriculum"
              ? "待补充课程"
              : autoImportedItem.questionBankStatus === "failed"
                ? "自动抽题失败"
                : autoImportedItem.questionBankStatus === "queued"
                  ? "已加入抽题队列"
                  : autoImportedItem.questionBankStatus === "processing"
                    ? "正在自动抽题"
                    : autoImportedItem.questionBankStatus === "no_questions"
                      ? "未识别到稳定题目"
                      : "保留为资料",
      ),
    });
    crossChecks.push({
      apiField: "GET /api/question-bank/materials -> detectedQuestionCount",
      apiValue: autoImportedItem.detectedQuestionCount ?? null,
      domValue: await materialCard.textContent(),
      pass: `${await materialCard.textContent() ?? ""}`.includes(
        String(autoImportedItem.detectedQuestionCount ?? 0),
      ),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    assert(
      ["saved", "requires_review", "requires_curriculum"].includes(
        autoImportedItem.questionBankStatus ?? "",
      ),
      `自动抽题未进入可用状态：${autoImportedItem.questionBankStatus ?? "unknown"}`,
    );
    if (autoImportedItem.questionBankStatus === "requires_curriculum") {
      assert(
        (autoImportedItem.detectedQuestionCount ?? 0) > 0,
        "自动抽题进入待补充课程，但没有识别到可供后续归档的题目",
      );
    } else {
      assert(
        (autoImportedItem.savedQuestionCount ?? 0) > 0,
        "自动抽题已完成但没有进入题库的题目",
      );
    }

    if (autoImportedItem.questionBankStatus !== "requires_curriculum") {
      await page.goto(`${baseUrl}/main/question-bank`, { waitUntil: "domcontentloaded" });
      questionListBody = await page.evaluate(async () => {
        const response = await fetch(
          "/api/question-bank?limit=120&sourceKind=knowledge_document",
          {
            credentials: "include",
            cache: "no-store",
          },
        );
        return await response.json();
      });

      assert(Array.isArray(questionListBody?.items), "题库列表接口未返回 items");
      const matchedQuestion = questionListBody.items.find(
        (item) => item.sourceFileName === uploadFileName,
      );
      assert(matchedQuestion, "题库里没有找到自动抽题结果");

      const firstQuestion = matchedQuestion;
      await page.getByTestId("question-bank-search").fill("");
      await page.getByTestId("question-bank-search").fill(firstQuestion.title);
      const firstCard = page.getByText(firstQuestion.title, { exact: false }).first();
      await firstCard.waitFor({ state: "visible" });

      await firstCard.click();
      await page.getByTestId("question-bank-source-panel").waitFor({ state: "visible" });
      questionDetailBody = await page.evaluate(async ({ questionId }) => {
        const response = await fetch(`/api/question-bank/${questionId}`, {
          credentials: "include",
          cache: "no-store",
        });
        return await response.json();
      }, { questionId: firstQuestion.id });

      const sourcePanelText = await page.getByTestId("question-bank-source-panel").textContent();
      crossChecks.push({
        apiField: "GET /api/question-bank/:id -> sourceFileName",
        apiValue: questionDetailBody?.sourceFileName ?? null,
        domValue: sourcePanelText,
        pass: `${sourcePanelText ?? ""}`.includes(uploadFileName),
      });
    }

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

    const trackedApis = networkEvents.filter((event) =>
      event.url.includes("/api/knowledge/upload") ||
      event.url.includes("/api/question-bank"),
    );
    const keyApiFailed = trackedApis.some((event) => event.status >= 400);
    const slowApis = trackedApis.filter((event) => event.durationMs > 30000);
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
${trackedApis
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
        `L1 验证失败：404=${static404s.length}, console=${consoleErrors.length}, pageerror=${pageErrors.length}, failedCrossChecks=${failedCrossChecks.length}`,
      );
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
