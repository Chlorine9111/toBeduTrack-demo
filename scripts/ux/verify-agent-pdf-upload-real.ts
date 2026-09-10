import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Request, type Response } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3003";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const samplePdfPath =
  process.env.UX_UPLOAD_FILE ??
  "/tmp/toBeduTrack-main-verify-20260309/tmp/ux-upload-sample.pdf";
const injectEventName = "deskmate-agent-inject-scan-file";

type NetworkEntry = {
  method: string;
  url: string;
  status: number;
  durationMs: number;
};

type Static404Entry = {
  url: string;
  resourceType: string;
  status: number;
};

type ConsoleErrorEntry = {
  text: string;
  location?: string;
};

type PageErrorEntry = {
  message: string;
};

type ProcessScanPayload = {
  stats?: { total?: number };
  questions?: Array<{ content?: string }>;
};

function sanitizeUrl(rawUrl: string) {
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

function isTrackedApi(url: string) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/pdf/upload-scan") ||
    url.includes("/api/pdf/scan-status/") ||
    url.includes("/api/pdf/process-scan") ||
    url.includes("/api/pdf/save-scan-questions")
  );
}

function isStatic404(response: Response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  if (resourceType === "stylesheet" || resourceType === "script" || resourceType === "font") {
    return true;
  }
  return /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url());
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function injectFileIntoInput(page: import("@playwright/test").Page, filePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString("base64");
  const fileName = path.basename(filePath);

  await page.evaluate(
    ({ eventName, payload }) => {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        }),
      );
    },
    {
      eventName: injectEventName,
      payload: {
        base64,
        fileName,
        mimeType: "application/pdf",
      },
    },
  );
}

function assert(condition: unknown, message: string): asserts condition {
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
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  const requestStarts = new WeakMap<Request, number>();
  const networkEntries: NetworkEntry[] = [];
  const consoleErrors: ConsoleErrorEntry[] = [];
  const pageErrors: PageErrorEntry[] = [];
  const static404s: Static404Entry[] = [];

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
  });

  let processScanPayload: ProcessScanPayload | null = null;
  let uploadScanStatus: number | null = null;
  let saveScanStatus: number | null = null;

  page.on("response", (response) => {
    const request = response.request();
    if (isTrackedApi(request.url())) {
      const startedAt = requestStarts.get(request) ?? Date.now();
      networkEntries.push({
        method: request.method(),
        url: sanitizeUrl(request.url()),
        status: response.status(),
        durationMs: Date.now() - startedAt,
      });
    }

    if (isStatic404(response)) {
      static404s.push({
        url: sanitizeUrl(response.url()),
        resourceType: request.resourceType(),
        status: response.status(),
      });
    }

    if (request.method() === "POST" && request.url().includes("/api/pdf/upload-scan")) {
      uploadScanStatus = response.status();
    }

    if (request.method() === "POST" && request.url().includes("/api/pdf/save-scan-questions")) {
      saveScanStatus = response.status();
    }

    if (request.method() === "POST" && request.url().includes("/api/pdf/process-scan")) {
      response
        .json()
        .then((payload) => {
          processScanPayload = payload as ProcessScanPayload;
        })
        .catch(() => {
          processScanPayload = null;
        });
    }
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    consoleErrors.push({
      text: message.text(),
      location:
        location.url && location.lineNumber != null
          ? `${sanitizeUrl(location.url)}:${location.lineNumber}`
          : undefined,
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({ message: error.message });
  });

  page.on("crash", () => {
    pageErrors.push({ message: "页面崩溃: Playwright page crash" });
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

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1200);

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
    });

    const initialArtifactCount = await page
      .locator('[data-testid="agent-artifact-reference"]')
      .count();

    await injectFileIntoInput(page, samplePdfPath);

    await page.locator('[data-testid="agent-composer"]').first().waitFor({
      state: "visible",
      timeout: 30000,
    });
    await page.waitForFunction(() => {
      const composer = document.querySelector('[data-testid="agent-composer"]') as HTMLTextAreaElement | null;
      return Boolean(composer && composer.value.includes("拆解题目"));
    }, { timeout: 30000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
    });

    const composerContainer = composer.locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
    await composerContainer.locator("button").last().click();

    const uploadSeen = await waitForCondition(() => uploadScanStatus != null, 120000);
    assert(uploadSeen, "未捕获到 /api/pdf/upload-scan 响应");

    await page.locator("text=正在上传").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => null);

    const processSeen = await waitForCondition(() => processScanPayload != null, 120000);
    assert(processSeen, "未捕获到 /api/pdf/process-scan 响应");

    const saveSeen = await waitForCondition(() => saveScanStatus != null, 120000);
    assert(saveSeen, "未捕获到 /api/pdf/save-scan-questions 响应");

    if (!processScanPayload) {
      throw new Error("process-scan 响应体为空");
    }
    const processPayload: ProcessScanPayload = processScanPayload;

    await page.waitForFunction(
      (arg) => {
        const selector = String(arg.selector);
        const expectedCount = Number(arg.expectedCount);
        return document.querySelectorAll(selector).length > expectedCount;
      },
      { selector: '[data-testid="agent-artifact-reference"]', expectedCount: initialArtifactCount },
      { timeout: 120000 },
    );

    const artifactReference = page.locator('[data-testid="agent-artifact-reference"]').last();
    await artifactReference.waitFor({ state: "visible", timeout: 30000 });
    await artifactReference.click();

    const artifactCanvas = page.locator('[data-testid="agent-artifact-canvas"]').first();
    await artifactCanvas.waitFor({ state: "visible", timeout: 30000 });

    const resultCard = artifactCanvas.locator('[data-testid="scan-structured-result"]').first();
    await resultCard.waitFor({ state: "visible", timeout: 120000 });

    const firstStem = artifactCanvas.locator('[data-testid="scan-question-stem"]').first();
    await firstStem.waitFor({ state: "visible", timeout: 30000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
    });

    const summaryText = (await resultCard.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    const stemText = (await firstStem.textContent())?.replace(/\s+/g, " ").trim() ?? "";

    const totalQuestions =
      typeof processPayload.stats?.total === "number"
        ? processPayload.stats.total
        : null;

    const firstQuestionContent =
      Array.isArray(processPayload.questions) &&
      processPayload.questions.length > 0 &&
      typeof processPayload.questions[0]?.content === "string"
        ? (processPayload.questions[0].content ?? "").replace(/\s+/g, " ").trim()
        : "";

    const crossValidation = [
      {
        apiField: "stats.total",
        expected: totalQuestions != null ? `${totalQuestions}` : "N/A",
        domText: summaryText,
        pass: totalQuestions != null ? summaryText.includes(`识别 ${totalQuestions} 道题`) : false,
      },
      {
        apiField: "questions[0].content",
        expected: firstQuestionContent.slice(0, 30),
        domText: stemText,
        pass: firstQuestionContent
          ? stemText.includes(firstQuestionContent.slice(0, 16))
          : false,
      },
    ];

    const trackedGeneration = networkEntries.filter((item) =>
      item.url.includes("/api/pdf/upload-scan") ||
      item.url.includes("/api/pdf/scan-status/") ||
      item.url.includes("/api/pdf/process-scan") ||
      item.url.includes("/api/pdf/save-scan-questions"),
    );

    const failedNetwork = trackedGeneration.filter((item) => item.status < 200 || item.status >= 300);
    const tooSlow = trackedGeneration.filter((item) => item.durationMs > 30000);

    assert(uploadScanStatus != null && uploadScanStatus >= 200 && uploadScanStatus < 300, `upload-scan 返回异常状态: ${uploadScanStatus}`);
    assert(saveScanStatus != null && saveScanStatus >= 200 && saveScanStatus < 300, `save-scan-questions 返回异常状态: ${saveScanStatus}`);
    assert(static404s.length === 0, `存在静态资源 404: ${static404s.map((item) => item.url).join(", ")}`);
    assert(consoleErrors.length === 0, `存在 console error: ${consoleErrors[0]?.text ?? ""}`);
    assert(pageErrors.length === 0, `存在 pageerror: ${pageErrors[0]?.message ?? ""}`);
    assert(failedNetwork.length === 0, `关键接口失败: ${failedNetwork.map((item) => `${item.method} ${item.url} ${item.status}`).join("; ")}`);
    assert(tooSlow.length === 0, `关键生成接口超过 30s: ${tooSlow.map((item) => `${item.url} ${item.durationMs}ms`).join("; ")}`);
    assert(crossValidation.every((item) => item.pass), "数据流交叉验证未全部通过");

    await writeJson(path.join(artifactDir, "network.json"), trackedGeneration);
    await writeJson(
      path.join(artifactDir, "errors.json"),
      {
        static404: static404s,
        consoleErrors,
        pageErrors,
      },
    );

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: PASS
- 关键接口耗时:
${trackedGeneration.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(item.durationMs / 1000).toFixed(2)}s`).join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossValidation.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.expected}\`: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
    console.log(report);
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
