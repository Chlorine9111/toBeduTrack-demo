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
const uploadSubject = process.env.UX_UPLOAD_SUBJECT ?? "AP Chemistry";
const uploadUnit = process.env.UX_UPLOAD_UNIT ?? "Unit 2";
const existingSourceFileName =
  process.env.UX_EXISTING_SOURCE_FILE_NAME?.trim() || "";
const worksheetCount = Math.max(
  2,
  Math.min(12, Number.parseInt(process.env.UX_WORKSHEET_COUNT ?? "4", 10) || 4),
);
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
    url.includes("/api/agent/chat") ||
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

async function readNdjsonResponse(response) {
  const raw = await response.text().catch(() => "");
  const events = raw
    .split("\n")
    .map((line) => line.trim())
    .map((line) => (line.startsWith("data:") ? line.slice(5).trim() : line))
    .filter(Boolean)
    .filter((line) => line !== "[DONE]")
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const toolNameByCallId = new Map();
  for (const event of events) {
    if (
      (event?.type === "tool-call" || event?.type === "tool-input-available") &&
      typeof event.toolCallId === "string" &&
      typeof event.toolName === "string"
    ) {
      toolNameByCallId.set(event.toolCallId, event.toolName);
    }
  }

  return {
    raw,
    events,
    text: events
      .filter(
        (event) =>
          event?.type === "text-delta" &&
          (typeof event.text === "string" || typeof event.delta === "string"),
      )
      .map((event) => event.text ?? event.delta)
      .join(""),
    toolCalls: events
      .filter(
        (event) =>
          (event?.type === "tool-call" ||
            event?.type === "tool-input-available" ||
            event?.type === "tool-output-available") &&
          typeof (event.toolName ?? toolNameByCallId.get(event.toolCallId)) === "string",
      )
      .map((event) => event.toolName ?? toolNameByCallId.get(event.toolCallId)),
    toolResults: events
      .filter(
        (event) =>
          event?.type === "tool-result" || event?.type === "tool-output-available",
      )
      .map((event) => ({
        ...event,
        toolName: event.toolName ?? toolNameByCallId.get(event.toolCallId),
        output: event.output,
      })),
  };
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

async function uploadQuestionBankSeed(page) {
  if (existingSourceFileName) {
    const autoImportedItem = await waitForQuestionMaterial(page, existingSourceFileName);
    assert(
      ["saved", "requires_review", "requires_curriculum"].includes(
        autoImportedItem.questionBankStatus ?? "",
      ),
      `现有题库资料未处于可用状态：${autoImportedItem.questionBankStatus ?? "unknown"}`,
    );

    return {
      uploadFileName: existingSourceFileName,
      autoImportedItem,
      reusedExistingSource: true,
    };
  }

  const pdfBuffer = await fs.readFile(samplePdfPath);
  const sourceBase = path.basename(samplePdfPath).replace(/\.[^.]+$/, "");
  const uploadFileName = `ux-cb-${Date.now()}-${sourceBase}.pdf`;

  const uploadResponse = await page.evaluate(
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
    {
      bytes: [...pdfBuffer],
      fileName: uploadFileName,
      subject: uploadSubject,
      unit: uploadUnit,
    },
  );

  assert(Array.isArray(uploadResponse?.documents), "知识库上传接口未返回 documents");
  assert(uploadResponse.documents[0]?.filename === uploadFileName, "上传返回文件名不匹配");

  const autoImportedItem = await waitForQuestionMaterial(page, uploadFileName);
  assert(
    ["saved", "requires_review", "requires_curriculum"].includes(
      autoImportedItem.questionBankStatus ?? "",
    ),
    `自动抽题未进入可用状态：${autoImportedItem.questionBankStatus ?? "unknown"}`,
  );

  return {
    uploadFileName,
    autoImportedItem,
    reusedExistingSource: false,
  };
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

    const seeded = await uploadQuestionBankSeed(page);
    const prompt = `请直接从我的题库里抽取来源文件名包含“${seeded.uploadFileName}”的现成题，不要重新生成。课程是 ${uploadSubject}，单元是 ${uploadUnit}。请组一套 ${worksheetCount} 题的 worksheet，并直接导出 PDF，返回下载链接和来源文件名。`;

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

    const chatResponse = await chatPromise;
    const chatNdjson = await readNdjsonResponse(chatResponse);
    const worksheetToolResult = chatNdjson.toolResults.find(
      (item) => item?.toolName === "assemble_question_bank_worksheet",
    )?.output;
    const worksheetPdfToolResult = chatNdjson.toolResults.find(
      (item) => item?.toolName === "export_worksheet_pdf",
    )?.output;

    const artifactReference = page
      .getByTestId("agent-artifact-reference")
      .filter({ hasText: "已从题库组好一套试卷" })
      .first();
    await artifactReference.waitFor({ state: "visible", timeout: 30000 });
    await artifactReference.click();

    const artifactCanvas = page.getByTestId("agent-artifact-canvas");
    await artifactCanvas.waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("agent-canvas-title").waitFor({ state: "visible", timeout: 30000 });

    const canvasText =
      (await artifactCanvas.textContent())?.replace(/\s+/g, " ").trim() ?? "";
    const linkHref =
      (await artifactCanvas.locator('a[href*="/api/pdf/download/"]').first().getAttribute("href").catch(() => null)) ??
      (typeof worksheetPdfToolResult?.downloadUrl === "string"
        ? worksheetPdfToolResult.downloadUrl
        : null) ??
      null;

    assert(linkHref, "助手消息中没有可见的 PDF 下载链接");

    const downloadProbe = await page.evaluate(async ({ href }) => {
      const response = await fetch(href, { credentials: "include" });
      const buffer = new Uint8Array(await response.arrayBuffer());
      const header = new TextDecoder().decode(buffer.slice(0, 5));
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        header,
        byteLength: buffer.byteLength,
      };
    }, { href: linkHref });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolCall",
      apiValue: "assemble_question_bank_worksheet",
      domValue: canvasText,
      pass: chatNdjson.toolCalls.includes("assemble_question_bank_worksheet"),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolResult.recordId",
      apiValue: worksheetPdfToolResult?.recordId ?? null,
      domValue: linkHref,
      pass:
        typeof worksheetPdfToolResult?.recordId === "string" &&
        typeof linkHref === "string" &&
        linkHref.includes(worksheetPdfToolResult.recordId),
    });

    crossChecks.push({
      apiField: "POST /api/agent/chat -> toolResult.selectedCount",
      apiValue: worksheetToolResult?.selectedCount ?? null,
      domValue: canvasText,
      pass:
        typeof worksheetToolResult?.selectedCount === "number" &&
        canvasText.includes(`题目数：${worksheetToolResult.selectedCount}`),
    });

    crossChecks.push({
      apiField: "知识库上传 -> sourceFileName",
      apiValue: seeded.uploadFileName,
      domValue: canvasText,
      pass: canvasText.includes(seeded.uploadFileName),
    });

    crossChecks.push({
      apiField: "GET /api/pdf/download -> pdf header",
      apiValue: "%PDF-",
      domValue: `${downloadProbe.status} ${downloadProbe.contentType} ${downloadProbe.header}`,
      pass:
        downloadProbe.status === 200 &&
        `${downloadProbe.contentType ?? ""}`.includes("application/pdf") &&
        downloadProbe.header === "%PDF-",
    });

    assert(static404s.length === 0, "存在静态资源 404");
    assert(consoleErrors.length === 0, "存在 console error");
    assert(pageErrors.length === 0, "存在 pageerror");
    assert(
      networkEvents.some((entry) => entry.url.includes("/api/agent/preflight") && entry.status === 200),
      "preflight 未成功",
    );
    assert(
      networkEvents.some((entry) => entry.url.includes("/api/agent/chat") && entry.status === 200),
      "chat 未成功",
    );
    assert(
      networkEvents
        .filter((entry) => entry.url.includes("/api/agent/chat"))
        .every((entry) => entry.durationMs <= 30000),
      "chat 耗时超过 30s",
    );
    assert(
      (preflightBody?.taskContext?.action ?? "") === "create_worksheet" ||
        (preflightBody?.taskContext?.action ?? "") === "retrieve_question_bank",
      "preflight 没有识别到组卷/题库动作",
    );
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
