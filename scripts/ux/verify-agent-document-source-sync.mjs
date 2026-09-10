import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3102";

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

function isTrackedApi(url) {
  return (
    url.includes("/api/chat/conversations") ||
    url.includes("/api/documents") ||
    url.includes("/api/content-library")
  );
}

function isStatic404(response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  if (
    resourceType === "stylesheet" ||
    resourceType === "script" ||
    resourceType === "font"
  ) {
    return true;
  }
  return /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url());
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildEmbeddedArtifactMessage(input) {
  const encoded = Buffer.from(
    JSON.stringify({
      kind: "lesson-plan",
      title: input.title,
      summary: "用于验证 Agent 右侧统一编辑器与内容库自动同步。",
      rawContent: input.rawContent,
    }),
    "utf8",
  ).toString("base64url");

  return [
    `已生成「${input.title}」，点击引用块在右侧 Canvas 查看正文。`,
    "",
    `<!-- DESKMATE_ARTIFACT:${encoded} -->`,
  ].join("\n");
}

async function seedConversation(seed) {
  const response = await fetch(`${baseUrl}/api/chat/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: seed.title,
      messages: [
        {
          role: "user",
          content: `请生成一份教案：${seed.title}`,
        },
        {
          role: "assistant",
          content: buildEmbeddedArtifactMessage(seed),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`种子对话创建失败 (${response.status})`);
  }

  const payload = await response.json();
  const conversationId = payload?.conversation?.id;
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const assistantMessage = messages.find((item) => item.role === "assistant");

  assert(conversationId, "种子对话缺少 conversationId");
  assert(assistantMessage?.id, "种子对话缺少 assistant message id");

  return {
    conversationId,
    assistantMessageId: assistantMessage.id,
  };
}

function summarizeKeyDurations(events) {
  const keys = [
    "GET /api/chat/conversations/",
    "POST /api/documents",
    "PUT /api/documents/",
    "GET /api/content-library",
  ];

  return keys.flatMap((needle) => {
    const matched = events.filter((event) =>
      `${event.method} ${event.url}`.includes(needle),
    );
    if (matched.length === 0) return [];
    return [matched[matched.length - 1]];
  });
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const title = `统一编辑器验证教案 ${stamp}`;
  const marker = `自动同步验证段落 ${stamp}`;
  const rawContent = [
    `# ${title}`,
    "",
    "## 一、教学目标",
    "",
    "帮助学生理解导数的几何意义。",
    "",
    "## 二、课堂活动",
    "",
    "先通过函数图像引导学生观察切线变化。",
  ].join("\n");

  const seedResult = await seedConversation({
    title,
    rawContent,
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

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

  let contentLibraryItemId = null;

  try {
    await page.goto(
      `${baseUrl}/main/agent?conversationId=${encodeURIComponent(seedResult.conversationId)}`,
      { waitUntil: "domcontentloaded" },
    );

    const artifactReference = page
      .getByTestId("agent-artifact-reference")
      .filter({ hasText: title })
      .first();
    await artifactReference.waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/documents") &&
          response.status() === 200,
      ),
      artifactReference.click(),
    ]);

    await page.getByTestId("agent-artifact-canvas").waitFor({ state: "visible" });
    await page.locator(".ProseMirror").first().waitFor({ state: "visible" });
    await page.getByText("已连接统一文档").waitFor({ state: "visible" });

    const headingText = await page.getByTestId("agent-canvas-title").textContent();
    crossChecks.push({
      apiField: "assistant artifact title",
      apiValue: title,
      domValue: headingText?.trim() ?? null,
      pass: (headingText?.trim() ?? null) === title,
    });

    const lastParagraph = page.locator(".ProseMirror p").last();
    await lastParagraph.waitFor({ state: "visible" });
    await lastParagraph.evaluate((element) => {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      (element instanceof HTMLElement ? element : element.parentElement)?.focus?.();
    });

    await page.keyboard.type(` ${marker}`);

    await page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes("/api/documents/") &&
        response.url().includes("/autosave") &&
        response.status() === 200,
    );

    await page.getByText("已连接统一文档").waitFor({ state: "visible" });
    await page.getByText(marker).waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const documentPayload = await page.evaluate(
      async ({ assistantMessageId, title: documentTitle, htmlContent }) => {
        const response = await fetch("/api/documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: documentTitle,
            htmlContent,
            documentKind: "lesson-plan",
            editorKind: "html",
            sourceType: "artifact",
            sourceId: assistantMessageId,
          }),
        });
        if (!response.ok) {
          throw new Error(`读取统一文档失败 (${response.status})`);
        }
        return await response.json();
      },
      {
        assistantMessageId: seedResult.assistantMessageId,
        title,
        htmlContent: `<article data-doc-type="lesson-plan"><h1>${title}</h1></article>`,
      },
    );

    const documentHtml = documentPayload?.document?.htmlContent ?? "";
    const documentId = documentPayload?.document?.id ?? null;
    assert(documentId, "统一文档缺少 documentId");
    crossChecks.push({
      apiField: "POST /api/documents -> document.htmlContent",
      apiValue: marker,
      domValue: documentHtml.includes(marker) ? marker : null,
      pass: documentHtml.includes(marker),
    });

    const contentLibraryList = await page.evaluate(async (queryTitle) => {
      const response = await fetch(
        `/api/content-library?q=${encodeURIComponent(queryTitle)}&limit=20`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        throw new Error(`读取内容库列表失败 (${response.status})`);
      }
      return await response.json();
    }, title);

    const matchedItem =
      (Array.isArray(contentLibraryList?.items)
        ? contentLibraryList.items.find(
            (item) =>
              item?.sourceMessageId === seedResult.assistantMessageId ||
              item?.displayTitle === title,
          )
        : null) ?? null;

    assert(matchedItem?.id, "未找到自动归档到内容库的条目");
    contentLibraryItemId = matchedItem.id;

    const contentLibraryDetail = await page.evaluate(async (itemId) => {
      const response = await fetch(`/api/content-library/${itemId}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`读取内容库详情失败 (${response.status})`);
      }
      return await response.json();
    }, contentLibraryItemId);

    const detailHtml = contentLibraryDetail?.metadata?.documentHtml ?? "";
    crossChecks.push({
      apiField: "GET /api/content-library/:id -> metadata.documentHtml",
      apiValue: marker,
      domValue: detailHtml.includes(marker) ? marker : null,
      pass: detailHtml.includes(marker),
    });

    await page.goto(`${baseUrl}/main/library/${encodeURIComponent(documentId)}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("editor-title").waitFor({ state: "visible" });
    await page.getByText(marker).waitFor({ state: "visible" });
    crossChecks.push({
      apiField: "统一编辑器页标题",
      apiValue: title,
      domValue: await page.getByTestId("editor-title").textContent(),
      pass:
        (await page.getByTestId("editor-title").textContent())?.trim() ===
        title,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const keyDurations = summarizeKeyDurations(networkEvents);
    const static404Count = static404s.length;
    const consoleErrorCount = consoleErrors.length;
    const pageErrorCount = pageErrors.length;
    const pass =
      static404Count === 0 &&
      consoleErrorCount === 0 &&
      pageErrorCount === 0 &&
      crossChecks.every((item) => item.pass);

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 关键接口耗时:
${keyDurations
  .map(
    (item) =>
      `  - ${item.method} ${new URL(item.url).pathname}: ${item.durationMs}ms`,
  )
  .join("\n")}
- 错误统计:
  - 静态资源 404: ${static404Count}
  - console error: ${consoleErrorCount}
  - pageerror: ${pageErrorCount}
- 数据流交叉验证:
${crossChecks
  .map(
    (item) =>
      `  - API 字段 \`${item.apiField}\` -> DOM/结果 \`${item.domValue}\`: ${item.pass ? "PASS" : "FAIL"}`,
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

    assert(pass, "L1 验收未通过");
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
    fatal: error instanceof Error ? error.message : String(error),
  });
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    `## UX 验证报告

- 验证级别: L1
- 最终结论: FAIL
- 失败原因: ${error instanceof Error ? error.message : String(error)}
- 关键接口耗时:
${summarizeKeyDurations(networkEvents)
  .map(
    (item) =>
      `  - ${item.method} ${new URL(item.url).pathname}: ${item.durationMs}ms`,
  )
  .join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossChecks
  .map(
    (item) =>
      `  - API 字段 \`${item.apiField}\` -> DOM/结果 \`${item.domValue}\`: ${item.pass ? "PASS" : "FAIL"}`,
  )
  .join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`,
    "utf8",
  );
  console.error(error);
  process.exit(1);
});
