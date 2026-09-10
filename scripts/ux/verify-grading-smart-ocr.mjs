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
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedRequest(url) {
  return (
    url.includes("/api/grading/sessions") ||
    url.includes("/api/grading/jobs/") ||
    url.includes("/api/account/profile") ||
    url.includes("/auth/v1/token") ||
    url.includes("/main/grading")
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

async function createRenderedPng(context, filePath, html) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1240, height: 1700 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({
    path: filePath,
    fullPage: true,
  });
  await page.close();
}

async function createQuestionPaperImage(context, filePath) {
  const html = `
    <html>
      <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
        <main style="width:1000px;margin:48px auto;background:white;padding:56px 64px;color:#111;line-height:1.7;">
          <h1 style="font-size:42px;margin:0 0 24px;">AP Calculus Mini Quiz</h1>
          <p style="font-size:24px;margin:0 0 24px;">Name: ____________</p>
          <section style="font-size:30px;margin-bottom:44px;">
            <p style="margin:0 0 12px;font-weight:700;">1. Multiple Choice</p>
            <p style="margin:0 0 16px;">What is the derivative of x^3 ?</p>
            <p style="margin:0;">A. x^2</p>
            <p style="margin:0;">B. 3x^2</p>
            <p style="margin:0;">C. 3x</p>
            <p style="margin:0;">D. x^3</p>
          </section>
          <section style="font-size:30px;">
            <p style="margin:0 0 12px;font-weight:700;">2. Free Response</p>
            <p style="margin:0 0 12px;">Find the derivative of y = sin(x^2).</p>
            <p style="margin:0;">Briefly explain how the chain rule is used.</p>
          </section>
        </main>
      </body>
    </html>
  `;
  await createRenderedPng(context, filePath, html);
}

async function createStudentSubmissionImage(context, filePath) {
  const html = `
    <html>
      <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
        <main style="width:1000px;margin:48px auto;background:white;padding:56px 64px;color:#111;line-height:1.8;">
          <h1 style="font-size:42px;margin:0 0 24px;">Student Submission</h1>
          <p style="font-size:24px;margin:0 0 24px;">Student: Demo Student</p>
          <section style="font-size:30px;margin-bottom:44px;">
            <p style="margin:0 0 12px;font-weight:700;">1.</p>
            <p style="margin:0;">B</p>
          </section>
          <section style="font-size:30px;">
            <p style="margin:0 0 12px;font-weight:700;">2.</p>
            <p style="margin:0;">y' = cos(x^2) * 2x.</p>
            <p style="margin:0;">Use the outer derivative cos(u) and multiply by the inner derivative 2x.</p>
          </section>
        </main>
      </body>
    </html>
  `;
  await createRenderedPng(context, filePath, html);
}

async function waitForGradingJob(requestContext, baseUrl, jobId, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await requestContext.get(`${baseUrl}/api/grading/jobs/${jobId}`);
    const payload = {
      ok: response.ok(),
      status: response.status(),
      body: await response.json(),
    };

    if (!payload.ok) {
      throw new Error(`查询判卷任务失败（job=${jobId}, status=${payload.status}）`);
    }

    const job = payload.body?.job;
    if (job?.status === "completed") {
      return job.result ?? {};
    }

    if (job?.status === "failed") {
      throw new Error(job?.errorMessage || `判卷任务失败（job=${jobId}）`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`等待判卷任务超时（job=${jobId}）`);
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1120 },
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
    const questionPaperPath = path.join(artifactDir, "question-paper.png");
    const studentSubmissionPath = path.join(artifactDir, "student-submission.png");
    await createQuestionPaperImage(context, questionPaperPath);
    await createStudentSubmissionImage(context, studentSubmissionPath);

    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname.startsWith("/main/"), { timeout: 30000 });
    await page.waitForLoadState("networkidle");

    await page.goto(`${baseUrl}/main/grading`, { waitUntil: "networkidle" });
    await page.locator("h1").filter({ hasText: /AI 判卷系统|AI Grading/ }).waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: /新建判卷任务|Create session/ })
      .waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const sessionTitle = `OCR 智能判卷 ${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const sessionCreatePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/grading/sessions") &&
        response.request().method() === "POST" &&
        !response.url().includes("/answer-key"),
    );
    await page.locator("aside input").first().fill(sessionTitle);
    await page.getByRole("button", { name: /新建判卷任务|Create session/ }).click();
    const sessionCreateResponse = await sessionCreatePromise;
    const sessionCreatePayload = await sessionCreateResponse.json();
    const sessionId = sessionCreatePayload?.session?.id;
    if (!sessionId) {
      throw new Error("创建判卷任务后未返回 sessionId");
    }
    await page.locator("h2").filter({ hasText: sessionTitle }).waitFor({ state: "visible" });

    const fileInputs = page.locator('input[type="file"]');
    const inferStartedAt = Date.now();
    const inferPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/grading/sessions/${sessionId}/answer-key/infer`) &&
        response.request().method() === "POST",
      { timeout: 120000 },
    );
    await fileInputs.nth(0).setInputFiles(questionPaperPath);
    const inferResponse = await inferPromise;
    const inferPayload = await inferResponse.json();
    const inferResult =
      inferPayload?.async && inferPayload?.job?.id
        ? await waitForGradingJob(context.request, baseUrl, inferPayload.job.id)
        : inferPayload;
    await page.locator("textarea").waitFor({ state: "visible" });
    await page.getByTestId("grading-metric-total-questions").waitFor({ state: "visible" });
    await page.waitForFunction(
      ({ expectedTotalQuestions, expectedReviewCount }) => {
        const totalQuestions =
          document.querySelector('[data-testid="grading-metric-total-questions"]')?.textContent?.trim() ?? "";
        const reviewCount =
          document.querySelector('[data-testid="grading-metric-review-count"]')?.textContent?.trim() ?? "";
        return (
          totalQuestions === String(expectedTotalQuestions) &&
          reviewCount === String(expectedReviewCount)
        );
      },
      {
        expectedTotalQuestions: inferResult?.analysis?.totalQuestions ?? 0,
        expectedReviewCount: inferResult?.analysis?.reviewRecommendedCount ?? 0,
      },
      { timeout: 30000 },
    );
    await page.locator("textarea").evaluate((node) => node.scrollTop = 0);
    const questionCountText =
      (await page.getByTestId("grading-metric-total-questions").textContent())?.trim() ?? "";
    const reviewCountText =
      (await page.getByTestId("grading-metric-review-count").textContent())?.trim() ?? "";
    const inferReadyMs = Date.now() - inferStartedAt;

    crossChecks.push({
      apiField: "POST /api/grading/sessions/:id/answer-key/infer -> analysis.totalQuestions",
      apiValue: inferResult?.analysis?.totalQuestions ?? null,
      domValue: questionCountText,
      pass: Number(questionCountText) === Number(inferResult?.analysis?.totalQuestions ?? -1),
    });
    crossChecks.push({
      apiField: "POST /api/grading/sessions/:id/answer-key/infer -> analysis.reviewRecommendedCount",
      apiValue: inferResult?.analysis?.reviewRecommendedCount ?? null,
      domValue: reviewCountText,
      pass: Number(reviewCountText) === Number(inferResult?.analysis?.reviewRecommendedCount ?? -1),
    });
    if (inferResult?.analysis?.qualityGate?.status) {
      const qualityGateText =
        (await page.getByTestId("grading-quality-status").textContent())?.trim() ?? "";
      crossChecks.push({
        apiField: "POST /api/grading/sessions/:id/answer-key/infer -> analysis.qualityGate.status",
        apiValue: inferResult.analysis.qualityGate.status,
        domValue: qualityGateText,
        pass: qualityGateText.length > 0,
      });
    }

    const generatingButton = page.getByRole("button", { name: /生成中|Generating/i }).first();
    if (await generatingButton.isVisible().catch(() => false)) {
      await generatingButton.waitFor({ state: "hidden", timeout: 120000 });
    }

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const studentName = "Demo Student";
    await page
      .locator('input[placeholder*="学生姓名"], input[placeholder*="Student name"]')
      .fill(studentName);

    const uploadSubmissionPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/grading/sessions/${sessionId}/submissions`) &&
        response.request().method() === "POST" &&
        !response.url().includes("/auto-grade"),
    );
    await fileInputs.nth(1).setInputFiles(studentSubmissionPath);
    await uploadSubmissionPromise;

    const submissionRow = page.locator("tr").filter({ hasText: studentName }).first();
    await submissionRow.waitFor({ state: "visible" });
    await submissionRow
      .getByRole("button", { name: /一键智能判卷|Auto grade/ })
      .waitFor({ state: "visible", timeout: 30000 });

    const autoGradeStartedAt = Date.now();
    const autoGradePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/grading/sessions/${sessionId}/submissions/`) &&
        response.url().includes("/auto-grade") &&
        response.request().method() === "POST",
      { timeout: 120000 },
    );
    await submissionRow.getByRole("button", { name: /一键智能判卷|Auto grade/ }).click();
    const autoGradeResponse = await autoGradePromise;
    const autoGradePayload = await autoGradeResponse.json();
    const autoGradeResult =
      autoGradePayload?.async && autoGradePayload?.job?.id
        ? await waitForGradingJob(context.request, baseUrl, autoGradePayload.job.id)
        : autoGradePayload;
    const expectedScoreText = `${autoGradeResult?.submission?.totalScore}/${autoGradeResult?.submission?.maxScore}`;

    await submissionRow.locator("td").nth(2).getByText(expectedScoreText, { exact: true }).waitFor({
      state: "visible",
      timeout: 30000,
    });
    const autoGradeReadyMs = Date.now() - autoGradeStartedAt;

    await page
      .locator("h3")
      .filter({ hasText: /题目明细|Question breakdown/ })
      .waitFor({ state: "visible" });

    const scoreText = await submissionRow.textContent();
    crossChecks.push({
      apiField: "POST /api/grading/sessions/:id/submissions/:id/auto-grade -> submission.totalScore/maxScore",
      apiValue: expectedScoreText,
      domValue: scoreText ?? "",
      pass: Boolean(scoreText?.includes(expectedScoreText)),
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

    const keyRequests = networkEvents.filter(
      (item) =>
        item.url.includes("/api/grading/sessions") &&
        item.method === "POST" &&
        item.status >= 200 &&
        item.status < 400,
    );
    const keyGenerationRequests = networkEvents.filter(
      (item) =>
        item.url.includes("/answer-key/infer") || item.url.includes("/auto-grade"),
    );
    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      keyRequests.length >= 3 &&
      keyRequests.every((item) => item.status >= 200 && item.status < 400) &&
      keyGenerationRequests.every((item) => item.durationMs <= 30000) &&
      inferReadyMs <= 30000 &&
      autoGradeReadyMs <= 30000 &&
      crossChecks.length >= 1 &&
      crossChecks.every((item) => item.pass);

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      `- 最终结论: ${pass ? "PASS" : "FAIL"}`,
      "- 关键接口耗时:",
      ...networkEvents.map(
        (item) =>
          `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`,
      ),
      `  - infer 结果可见耗时: ${inferReadyMs}ms`,
      `  - auto-grade 结果可见耗时: ${autoGradeReadyMs}ms`,
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
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
      "### 结论说明",
      ...(!pass
        ? [
            `- 关键生成接口超时检查: ${
              keyGenerationRequests.every((item) => item.durationMs <= 30000) &&
              inferReadyMs <= 30000 &&
              autoGradeReadyMs <= 30000
                ? "PASS"
                : "FAIL"
            }`,
            `- 关键 API 成功率: ${
              keyRequests.length >= 3 &&
              keyRequests.every((item) => item.status >= 200 && item.status < 400)
                ? "PASS"
                : "FAIL"
            }`,
          ]
        : ["- 全部硬性阈值均通过。"]),
      "",
    ];
    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");

    if (!pass) {
      throw new Error("UX 验证未通过，请查看 report.md");
    }
  } finally {
    await browser.close();
  }
}

void run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
