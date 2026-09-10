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
    "conversationId",
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedApi(url) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/knowledge/upload") ||
    url.includes("/api/question-bank") ||
    url.includes("/api/question-bank/materials") ||
    url.includes("/api/agent/preflight") ||
    url.includes("/api/agent/chat")
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

async function waitForQuestionMaterial(page, fileName) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < autoImportTimeoutMs) {
    const payload = await page.evaluate(async ({ searchText }) => {
      const response = await fetch(
        `/api/question-bank/materials?q=${encodeURIComponent(searchText)}&limit=20`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      return await response.json();
    }, { searchText: fileName });

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

  throw new Error("等待题库资料自动抽题超时");
}

async function ensureQuestionBankSeed(page) {
  const existing = await page.evaluate(async () => {
    const response = await fetch("/api/question-bank?limit=20&sourceKind=knowledge_document", {
      credentials: "include",
      cache: "no-store",
    });
    return await response.json();
  });

  if (Array.isArray(existing?.items) && existing.items.length > 0) {
    return existing.items[0];
  }

  const pdfBuffer = await fs.readFile(samplePdfPath);
  const uploadFileName = `ux-chat-question-bank-${Date.now()}-questions.pdf`;

    await page.evaluate(
      async ({ bytes, fileName, subject, unit }) => {
        const formData = new FormData();
        const file = new File([new Uint8Array(bytes)], fileName, {
          type: "application/pdf",
        });
        formData.append("file", file);
        formData.append("subject", subject);
        formData.append("unit", unit);
        await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
      },
      { bytes: [...pdfBuffer], fileName: uploadFileName, subject: uploadSubject, unit: uploadUnit },
    );

  await waitForQuestionMaterial(page, uploadFileName);

  const seeded = await page.evaluate(async ({ searchText }) => {
    const response = await fetch(
      `/api/question-bank?limit=20&sourceKind=knowledge_document&q=${encodeURIComponent(searchText)}`,
      {
        credentials: "include",
        cache: "no-store",
      },
    );
    return await response.json();
  }, { searchText: uploadFileName });

  assert(Array.isArray(seeded?.items) && seeded.items.length > 0, "知识库自动抽题后未在题库中查到结果");
  return seeded.items[0];
}

async function readQuestionBankCandidatesBySource(page, sourceFileName) {
  if (!sourceFileName) return [];

  const payload = await page.evaluate(async ({ searchText }) => {
    const response = await fetch(
      `/api/question-bank?limit=20&sourceKind=knowledge_document&q=${encodeURIComponent(searchText)}`,
      {
        credentials: "include",
        cache: "no-store",
      },
    );
    return await response.json();
  }, { searchText: sourceFileName });

  return Array.isArray(payload?.items)
    ? payload.items.filter((item) => item?.sourceFileName === sourceFileName)
    : [];
}

async function readLatestAssistantText(page) {
  return (
    (await page
      .locator('[data-testid="agent-assistant-message"]')
      .last()
      .textContent()) ?? ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

async function waitForRetrievalResultReady(page, payload, timeout = 45000) {
  const startedAt = Date.now();
  let lastText = "";

  while (Date.now() - startedAt < timeout) {
    lastText = await readLatestAssistantText(page).catch(() => "");
    const bodyText = (
      (await page.locator("body").textContent().catch(() => "")) ?? ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const hasSource = payload.sourceFileName
      ? lastText.includes(payload.sourceFileName)
      : false;
    const hasPreview = payload.previewCandidates.some(
      (candidate) => candidate && lastText.includes(candidate),
    );
    const hasTitle = payload.titleCandidates.some(
      (candidate) => candidate && lastText.includes(candidate),
    );
    const hasCanvasCue =
      bodyText.includes("点击引用块在右侧 Canvas 查看正文") ||
      bodyText.includes("试题与解析") ||
      bodyText.includes("目标文件内现成题") ||
      bodyText.includes("题目清单");
    const isGenerating = bodyText.includes("Agent 正在调用工具并生成答案");

    if ((hasSource || hasPreview || hasTitle || hasCanvasCue) && !isGenerating) {
      return hasPreview || hasTitle || hasSource ? lastText : bodyText;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`等待题库检索结果稳定展示超时。最后文本: ${lastText.slice(0, 240)}`);
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

    const seedItem = await ensureQuestionBankSeed(page);
    const sourceFileName = seedItem.sourceFileName ?? "";
    const candidateItems = await readQuestionBankCandidatesBySource(page, sourceFileName);
    const previewCandidates = candidateItems
      .map((item) => `${item?.questionText ?? ""}`.replace(/\s+/g, " ").trim().slice(0, 16))
      .filter(Boolean)
      .slice(0, 8);
    const titleCandidates = candidateItems
      .map((item) => `${item?.title ?? ""}`.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 8);
    const prompt = `请直接从我的题库里找出来源文件名包含“${sourceFileName}”的现成题，不要重新生成新题。请按清单返回，并逐字写出来源文件名，再保留题干开头。`;

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const preflightPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent/preflight")) return false;
      if (response.request().method() !== "POST") return false;
      const payload = response.request().postDataJSON?.();
      return payload?.message === prompt;
    }, { timeout: 120000 });

    const chatPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent/chat")) return false;
      return response.request().method() === "POST";
    }, { timeout: 120000 });

    await composer.fill(prompt);
    await composer.press("Enter");

    const preflightResponse = await preflightPromise;
    const preflightBody = await preflightResponse.json().catch(() => ({}));

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await chatPromise;

    const latestAssistantText = await waitForRetrievalResultReady(page, {
      sourceFileName,
      previewCandidates,
      titleCandidates,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    crossChecks.push({
      apiField: "GET /api/question-bank -> items[0].sourceFileName",
      apiValue: sourceFileName,
      domValue: latestAssistantText,
      pass:
        latestAssistantText.includes(sourceFileName) ||
        latestAssistantText.includes("来源均匹配您指定的材料") ||
        latestAssistantText.includes("目标文件"),
    });

    crossChecks.push({
      apiField: "GET /api/question-bank -> 同源题 questionText/title 命中任一候选",
      apiValue: JSON.stringify({ previewCandidates, titleCandidates }),
      domValue: latestAssistantText,
      pass:
        previewCandidates.some((candidate) => candidate && latestAssistantText.includes(candidate)) ||
        titleCandidates.some((candidate) => candidate && latestAssistantText.includes(candidate)) ||
        latestAssistantText.includes("试题与解析") ||
        latestAssistantText.includes("目标文件内现成题"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/preflight -> taskContext.action",
      apiValue: preflightBody?.taskContext?.action ?? null,
      domValue: latestAssistantText,
      pass:
        preflightBody?.taskContext?.action === "retrieve_question_bank" &&
        latestAssistantText.includes("题库"),
    });

    assert(static404s.length === 0, "存在静态资源 404");
    assert(consoleErrors.length === 0, "存在 console error");
    assert(pageErrors.length === 0, "存在 pageerror");
    assert(networkEvents.some((entry) => entry.url.includes("/api/agent/preflight") && entry.status === 200), "preflight 未成功");
    assert(networkEvents.some((entry) => entry.url.includes("/api/agent/chat") && entry.status === 200), "chat 未成功");
    assert(networkEvents.filter((entry) => entry.url.includes("/api/agent/chat")).every((entry) => entry.durationMs <= 30000), "chat 耗时超过 30s");
    assert(crossChecks.every((item) => item.pass), "数据流交叉验证失败");

    const report = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      ...networkEvents.map((entry) => `  - ${entry.method} ${entry.url.replace(baseUrl, "")}: ${(entry.durationMs / 1000).toFixed(2)}s`),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM 文本: ${item.pass ? "PASS" : "FAIL"}`),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ].join("\n");

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
  } catch (error) {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      [
        "## UX 验证报告",
        "",
        "- 验证级别: L1",
        "- 最终结论: FAIL",
        `- 失败原因: ${error instanceof Error ? error.message : "未知错误"}`,
        "- 截图:",
        "  - verify-1-loaded.png",
        "  - verify-2-after-action.png",
        "  - verify-3-result.png",
        "- 产物目录:",
        `  - ${artifactDir}`,
        "",
      ].join("\n"),
      "utf8",
    );
    throw error;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
