import { chromium, type Locator, type Request } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type NetworkEntry = {
  sample: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  resourceType: string;
};

type ConsoleErrorEntry = {
  sample: string;
  text: string;
  location?: string;
};

type PageErrorEntry = {
  sample: string;
  message: string;
};

type Static404Entry = {
  sample: string;
  url: string;
  resourceType: string;
  status: number;
};

type CrossValidationEntry = {
  sample: string;
  apiField: string;
  domText: string;
  expected: string;
  pass: boolean;
};

type VerificationSample = {
  name: string;
  filePath: string;
  visualTarget: "image" | "table";
  expectFormula?: boolean;
};

type ScanQuestion = {
  questionNumber?: number;
  content?: string;
  options?: Record<string, string | undefined> | null;
};

type ProcessScanResponse = {
  stats?: { total?: number };
  questions?: ScanQuestion[];
};

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";
const LOGIN_EMAIL =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772881288787@example.com";
const LOGIN_PASSWORD = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const KEY_API_PATHS = ["/api/pdf/upload-scan", "/api/pdf/scan-status/", "/api/pdf/process-scan"];
const KEY_GENERATION_PATHS = ["/api/pdf/upload-scan", "/api/pdf/process-scan"];

const SCAN_SAMPLE_CASES: VerificationSample[] = [
  {
    name: "nso-image",
    filePath: "/Users/martin/Documents/竞赛题目/nso_sample_paper_class-1_2025-26.pdf",
    visualTarget: "image",
  },
  {
    name: "usnco-table",
    filePath: "/Users/martin/Documents/竞赛题目/2025-usnco-local-exam.pdf",
    visualTarget: "table",
    expectFormula: true,
  },
  {
    name: "pb-image",
    filePath: "/Users/martin/Documents/竞赛题目/PB-Exam-25-2.pdf",
    visualTarget: "image",
  },
];

const REQUESTED_SAMPLE_NAME = process.env.UX_SCAN_SAMPLE_NAME?.trim();

function createTimestamp() {
  const now = new Date();
  const yyyy = `${now.getFullYear()}`;
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  const hh = `${now.getHours()}`.padStart(2, "0");
  const min = `${now.getMinutes()}`.padStart(2, "0");
  const ss = `${now.getSeconds()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function sanitizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split("?")[0] ?? raw;
  }
}

function normalizeText(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function containsImageMarkup(raw: string) {
  return /!\[[^\]]*]\(([^)]+)\)|\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/.test(raw);
}

function containsTableMarkup(raw: string) {
  return /\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/.test(raw);
}

function containsMathMarkup(raw: string) {
  return /(^|[^\\])\$(?:\\\$|[^$])+\$|\\\(|\\\[|\\(?:frac|sqrt|sum|int|times|cdot|left|right|alpha|beta|gamma|theta|pi)\b|\\begin\{(?:equation|align|aligned|array|matrix|cases|gather)\}/.test(
    raw,
  );
}

function textSnippet(raw: string, maxLength = 24) {
  if (raw.length <= maxLength) return raw;
  return raw.slice(0, maxLength);
}

function isStaticResource(resourceType: string) {
  return resourceType === "stylesheet" || resourceType === "script" || resourceType === "font";
}

function isKeyApi(url: string) {
  return KEY_API_PATHS.some((pathName) => url.includes(pathName));
}

function isKeyGenerationApi(method: string, url: string) {
  return method === "POST" && KEY_GENERATION_PATHS.some((pathName) => url.includes(pathName));
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

async function waitForLoadedImage(locator: Locator, timeoutMs = 30000) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.waitFor({ state: "visible", timeout: timeoutMs });

  return waitForCondition(async () => {
    return locator
      .evaluate((node) => {
        if (!(node instanceof HTMLImageElement)) return false;
        const style = window.getComputedStyle(node);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          node.complete &&
          node.naturalWidth > 0 &&
          node.naturalHeight > 0
        );
      })
      .catch(() => false);
  }, timeoutMs);
}

async function main() {
  const samples = SCAN_SAMPLE_CASES.filter((sample) => {
    if (REQUESTED_SAMPLE_NAME && sample.name !== REQUESTED_SAMPLE_NAME) {
      return false;
    }
    return existsSync(sample.filePath);
  });
  if (samples.length === 0) {
    throw new Error("缺少可用的竞赛 PDF 本地样例，无法执行上传验收。");
  }

  const timestamp = createTimestamp();
  const outputDir = path.join(process.cwd(), "document", "ux-verification", timestamp);
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  const networkEntries: NetworkEntry[] = [];
  const consoleErrors: ConsoleErrorEntry[] = [];
  const pageErrors: PageErrorEntry[] = [];
  const static404: Static404Entry[] = [];
  const crossValidation: CrossValidationEntry[] = [];
  const requestStart = new Map<Request, number>();
  const uploadStatusBySample = new Map<string, number>();
  const processResponseBySample = new Map<string, ProcessScanResponse>();
  let activeSample = "boot";

  page.on("request", (request) => {
    requestStart.set(request, Date.now());
  });

  page.on("response", async (response) => {
    const request = response.request();
    const start = requestStart.get(request) ?? Date.now();
    const durationMs = Math.max(0, Date.now() - start);
    const url = sanitizeUrl(request.url());
    const method = request.method();
    const status = response.status();
    const resourceType = request.resourceType();
    const sampleName = activeSample;

    if (url.includes("/api/")) {
      networkEntries.push({
        sample: sampleName,
        method,
        url,
        status,
        durationMs,
        resourceType,
      });
    }

    if (method === "POST" && url.includes("/api/pdf/upload-scan")) {
      uploadStatusBySample.set(sampleName, status);
    }

    if (method === "POST" && url.includes("/api/pdf/process-scan")) {
      const payload = (await response.json().catch(() => ({}))) as ProcessScanResponse;
      processResponseBySample.set(sampleName, payload);
    }

    if (status === 404 && isStaticResource(resourceType)) {
      static404.push({ sample: sampleName, url, resourceType, status });
    }
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    consoleErrors.push({
      sample: activeSample,
      text: message.text(),
      location:
        location.url && location.lineNumber != null
          ? `${sanitizeUrl(location.url)}:${location.lineNumber}`
          : undefined,
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({ sample: activeSample, message: String(error) });
  });

  activeSample = "auth";
  await page.goto("/auth/login", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#login-email").fill(LOGIN_EMAIL);
  await page.locator("#login-password").fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).click();
  await page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 });
  await page.waitForLoadState("networkidle");

  for (const [index, sample] of samples.entries()) {
    activeSample = sample.name;

    await page.goto("/main/agent", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByTestId("agent-composer").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("agent-scan-upload-trigger").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("agent-material-upload-trigger").waitFor({ state: "visible", timeout: 15000 });

    const loadedShot = index === 0 ? "verify-1-loaded.png" : `${sample.name}-loaded.png`;
    await page.screenshot({
      path: path.join(outputDir, loadedShot),
      fullPage: true,
    });

    await page.getByTestId("agent-reset-conversation").click().catch(() => undefined);
    await page.waitForTimeout(500);
    await page.getByTestId("agent-scan-upload-input").setInputFiles(sample.filePath);
    await page.getByText(path.basename(sample.filePath)).waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("agent-composer").fill("拆解题目");
    const sendButton = page.getByTestId("agent-send-button");
    await sendButton.waitFor({ state: "visible", timeout: 15000 });
    await sendButton.click();

    const actionShot = index === 0 ? "verify-2-after-action.png" : `${sample.name}-after-action.png`;
    await page.screenshot({
      path: path.join(outputDir, actionShot),
      fullPage: true,
    });

    const structuredResult = page.locator('[data-testid="scan-structured-result"]').last();
    await structuredResult.waitFor({ state: "visible", timeout: 240000 });
    const firstQuestionCard = page.locator('[data-testid^="scan-question-"]').first();
    await firstQuestionCard.waitFor({ state: "visible", timeout: 240000 });
    const firstQuestionStem = firstQuestionCard.locator('[data-testid="scan-question-stem"]').first();

    const uploadSeen = await waitForCondition(() => uploadStatusBySample.has(sample.name), 30000);
    if (!uploadSeen) {
      throw new Error(`[${sample.name}] 未捕获到 upload-scan 响应`);
    }
    const processSeen = await waitForCondition(() => processResponseBySample.has(sample.name), 30000);
    if (!processSeen) {
      throw new Error(`[${sample.name}] 未捕获到 process-scan 响应`);
    }

    const uploadStatus = uploadStatusBySample.get(sample.name) ?? 0;
    if (uploadStatus < 200 || uploadStatus >= 300) {
      throw new Error(`[${sample.name}] upload-scan 返回状态异常：${uploadStatus}`);
    }

    const processJson = processResponseBySample.get(sample.name) ?? {};
    const recognizedCount = Number(processJson.stats?.total ?? 0);
    if (recognizedCount <= 0) {
      throw new Error(`[${sample.name}] process-scan 未识别到题目`);
    }

    const expectedSummaryPrefix = `文档解析完成：共 1 个文件，识别 ${recognizedCount} 道题`;
    await page.getByText(new RegExp(expectedSummaryPrefix)).waitFor({ state: "visible", timeout: 30000 });

    const structuredTextRaw = (await structuredResult.textContent()) ?? "";
    const structuredText = normalizeText(structuredTextRaw);
    const summaryMessageTextRaw = (await page.locator('[data-testid="scan-result-message-text"]').last().textContent()) ?? "";
    const summaryMessageText = normalizeText(summaryMessageTextRaw);

    crossValidation.push({
      sample: sample.name,
      apiField: "process-scan.stats.total",
      domText: "结构化结果摘要",
      expected: `${expectedSummaryPrefix}...`,
      pass: structuredText.includes(`识别 ${recognizedCount} 道题`),
    });

    crossValidation.push({
      sample: sample.name,
      apiField: "scanResult.displayText",
      domText: "结构化消息短摘要",
      expected: "消息气泡只显示短摘要，不重复输出拆分题目明细全文",
      pass:
        summaryMessageText.includes("文档解析完成") &&
        !summaryMessageText.includes("拆分题目明细") &&
        !summaryMessageText.includes("【题目 1"),
    });

    const firstQuestion =
      (processJson.questions ?? []).find((item) => normalizeText(String(item.content ?? "")).length > 0) ??
      (processJson.questions ?? [])[0];

    if (firstQuestion) {
      if (firstQuestion.questionNumber != null) {
        crossValidation.push({
          sample: sample.name,
          apiField: "process-scan.questions[0].questionNumber",
          domText: "结构化题号标题",
          expected: `页面包含“第 ${firstQuestion.questionNumber} 题”`,
          pass: structuredText.includes(`第 ${firstQuestion.questionNumber} 题`),
        });
      }

      const stem = normalizeText(String(firstQuestion.content ?? ""));
      if (stem) {
        if (containsImageMarkup(stem)) {
          const imageLoaded = await waitForLoadedImage(firstQuestionCard.locator('[data-testid="scan-rich-image"]').first());
          crossValidation.push({
            sample: sample.name,
            apiField: "process-scan.questions[0].content(image)",
            domText: "结构化题干图片渲染",
            expected: "题干中的图片完成加载并可见",
            pass: imageLoaded,
          });
        } else if (containsTableMarkup(stem)) {
          await firstQuestionCard.locator('[data-testid="scan-rich-table"]').first().waitFor({ state: "visible", timeout: 30000 });
          crossValidation.push({
            sample: sample.name,
            apiField: "process-scan.questions[0].content(tabular)",
            domText: "结构化题干表格渲染",
            expected: "题干中的表格可见",
            pass: (await firstQuestionCard.locator('[data-testid="scan-rich-table"]').count()) > 0,
          });
        } else if (containsMathMarkup(stem)) {
          await firstQuestionCard.locator(".katex").first().waitFor({ state: "visible", timeout: 30000 });
          crossValidation.push({
            sample: sample.name,
            apiField: "process-scan.questions[0].content(math)",
            domText: "结构化题干公式渲染",
            expected: "题干中的公式被 KaTeX 渲染",
            pass: (await firstQuestionCard.locator(".katex").count()) > 0,
          });
        } else {
          const stemSnippet = textSnippet(stem, 28);
          crossValidation.push({
            sample: sample.name,
            apiField: "process-scan.questions[0].content",
            domText: "结构化题干渲染",
            expected: `页面包含题干片段“${stemSnippet}”`,
            pass: structuredText.includes(stemSnippet),
          });
        }
      }

      const firstOptionEntry = firstQuestion.options
        ? Object.entries(firstQuestion.options).find(([, value]) => normalizeText(String(value ?? "")).length > 0)
        : undefined;
      if (firstOptionEntry) {
        const [optionKey, optionValue] = firstOptionEntry;
        const optionText = normalizeText(String(optionValue ?? ""));
        const optionCard = firstQuestionCard.locator(`[data-testid="scan-question-option-${optionKey}"]`).first();

        if (containsImageMarkup(optionText)) {
          const imageLoaded = await waitForLoadedImage(optionCard.locator('[data-testid="scan-rich-image"]').first());
          crossValidation.push({
            sample: sample.name,
            apiField: `process-scan.questions[0].options.${optionKey}(image)`,
            domText: "结构化选项图片渲染",
            expected: `选项 ${optionKey} 中的图片完成加载并可见`,
            pass: imageLoaded,
          });
        } else if (containsTableMarkup(optionText)) {
          await optionCard.locator('[data-testid="scan-rich-table"]').first().waitFor({ state: "visible", timeout: 30000 });
          crossValidation.push({
            sample: sample.name,
            apiField: `process-scan.questions[0].options.${optionKey}(tabular)`,
            domText: "结构化选项表格渲染",
            expected: `选项 ${optionKey} 中的表格可见`,
            pass: (await optionCard.locator('[data-testid="scan-rich-table"]').count()) > 0,
          });
        } else if (containsMathMarkup(optionText)) {
          await optionCard.locator(".katex").first().waitFor({ state: "visible", timeout: 30000 });
          crossValidation.push({
            sample: sample.name,
            apiField: `process-scan.questions[0].options.${optionKey}(math)`,
            domText: "结构化选项公式渲染",
            expected: `选项 ${optionKey} 中的公式被 KaTeX 渲染`,
            pass: (await optionCard.locator(".katex").count()) > 0,
          });
        } else {
          const optionSnippet = textSnippet(optionText, 22);
          crossValidation.push({
            sample: sample.name,
            apiField: `process-scan.questions[0].options.${optionKey}`,
            domText: "结构化选项渲染",
            expected: `页面包含“${optionKey}”及其文本片段“${optionSnippet}”`,
            pass: structuredText.includes(optionKey) && structuredText.includes(optionSnippet),
          });

          const stemText = normalizeText((await firstQuestionStem.textContent()) ?? "");
          crossValidation.push({
            sample: sample.name,
            apiField: `process-scan.questions[0].content(no-option-dup)`,
            domText: "题干不重复选项",
            expected: `题干区域不包含选项 ${optionKey} 的文本片段“${optionSnippet}”`,
            pass: !stemText.includes(optionSnippet),
          });
        }
      }
    }

    if (sample.visualTarget === "image") {
      const imageLocator = structuredResult.locator('[data-testid="scan-rich-image"]').first();
      const imageLoaded =
        (await structuredResult.locator('[data-testid="scan-rich-image"]').count()) > 0 &&
        (await waitForLoadedImage(imageLocator));
      crossValidation.push({
        sample: sample.name,
        apiField: "process-scan.questions[].linkedFigures",
        domText: "图片渲染",
        expected: "页面存在已加载完成的图片",
        pass: imageLoaded,
      });
    }

    if (sample.visualTarget === "table") {
      await structuredResult.locator('[data-testid="scan-rich-table"]').first().waitFor({ state: "visible", timeout: 30000 });
      crossValidation.push({
        sample: sample.name,
        apiField: "process-scan.questions[].content(tabular)",
        domText: "表格渲染",
        expected: "页面存在可见表格",
        pass: (await structuredResult.locator('[data-testid="scan-rich-table"]').count()) > 0,
      });
    }

    if (sample.expectFormula) {
      await structuredResult.locator(".katex").first().waitFor({ state: "visible", timeout: 30000 });
      crossValidation.push({
        sample: sample.name,
        apiField: "process-scan.questions[].content(math)",
        domText: "公式渲染",
        expected: "页面存在 KaTeX 渲染结果",
        pass: (await structuredResult.locator(".katex").count()) > 0,
      });
    }

    if (sample.visualTarget === "image" && (await structuredResult.locator('[data-testid="scan-rich-image"]').count()) > 0) {
      await structuredResult.locator('[data-testid="scan-rich-image"]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    } else if (sample.visualTarget === "table" && (await structuredResult.locator('[data-testid="scan-rich-table"]').count()) > 0) {
      await structuredResult.locator('[data-testid="scan-rich-table"]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    } else {
      await firstQuestionCard.scrollIntoViewIfNeeded().catch(() => undefined);
    }

    const resultShot = index === 0 ? "verify-3-result.png" : `${sample.name}-result.png`;
    await page.screenshot({
      path: path.join(outputDir, resultShot),
      fullPage: true,
    });

  }

  await browser.close();

  const keyApiEntries = networkEntries.filter((entry) => isKeyApi(entry.url));
  const keyGenerationEntries = networkEntries.filter((entry) => isKeyGenerationApi(entry.method, entry.url));
  const agentChatEntries = networkEntries.filter((entry) => entry.url.includes("/api/agent/chat"));
  const noAgentChatForDirectSplit = agentChatEntries.length === 0;

  crossValidation.push({
    sample: "all",
    apiField: "network",
    domText: "分题直出策略",
    expected: "“拆解题目”场景不触发 /api/agent/chat",
    pass: noAgentChatForDirectSplit,
  });

  const static404Count = static404.length;
  const consoleErrorCount = consoleErrors.length;
  const pageErrorCount = pageErrors.length;
  const keyApiSuccess =
    keyApiEntries.length > 0 &&
    keyApiEntries.every((entry) => entry.status >= 200 && entry.status < 300);
  const generationDurationPass =
    keyGenerationEntries.length > 0 &&
    keyGenerationEntries.every((entry) => entry.durationMs <= 30000);
  const dataFlowPassCount = crossValidation.filter((item) => item.pass).length;
  const dataFlowAllPass = crossValidation.length >= 1 && dataFlowPassCount === crossValidation.length;

  const pass =
    static404Count === 0 &&
    consoleErrorCount === 0 &&
    pageErrorCount === 0 &&
    keyApiSuccess &&
    generationDurationPass &&
    dataFlowAllPass &&
    noAgentChatForDirectSplit;

  await writeFile(
    path.join(outputDir, "network.json"),
    JSON.stringify(
      {
        keyRequests: keyApiEntries,
        allApiRequests: networkEntries,
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    path.join(outputDir, "errors.json"),
    JSON.stringify(
      {
        static404,
        consoleErrors,
        pageErrors,
        counts: {
          static404: static404Count,
          consoleErrors: consoleErrorCount,
          pageErrors: pageErrorCount,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const durationLines =
    keyGenerationEntries.length > 0
      ? keyGenerationEntries
          .map(
            (entry) =>
              `  - [${entry.sample}] ${entry.method} ${entry.url}: ${(entry.durationMs / 1000).toFixed(2)}s`,
          )
          .join("\n")
      : "  - 无关键生成接口记录";

  const crossValidationLines = crossValidation
    .map(
      (item) =>
        `  - [${item.sample}] API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domText}\`（期望：${item.expected}）: ${item.pass ? "PASS" : "FAIL"}`,
    )
    .join("\n");

  const extraScreenshots = samples
    .slice(1)
    .flatMap((sample) => [
      `${sample.name}-loaded.png`,
      `${sample.name}-after-action.png`,
      `${sample.name}-result.png`,
    ]);

  const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 样本:
  - ${samples.map((sample) => sample.name).join(" / ")}
- 关键接口耗时:
${durationLines}
- 错误统计:
  - 静态资源 404: ${static404Count}
  - console error: ${consoleErrorCount}
  - pageerror: ${pageErrorCount}
- 数据流交叉验证:
${crossValidationLines}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
${extraScreenshots.map((fileName) => `  - ${fileName}`).join("\n")}
- 产物目录:
  - document/ux-verification/${timestamp}/
`;

  await writeFile(path.join(outputDir, "report.md"), report, "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        outputDir,
        pass,
        sampleNames: samples.map((sample) => sample.name),
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
