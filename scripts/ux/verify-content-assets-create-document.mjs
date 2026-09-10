import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const contentAssetsUrl = `${baseUrl}/main/content-assets`;
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

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isTrackedApi(url) {
  return (
    url.includes("/api/content-assets/bootstrap") ||
    url.includes("/api/content-assets/documents") ||
    url.includes("/api/documents/") ||
    url.includes("/api/content-library/") ||
    url.includes("/api/content-assets/")
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

async function ensureLoggedIn(page) {
  await page.goto(contentAssetsUrl, { waitUntil: "domcontentloaded" });
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== "/auth/login") return;

  await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
  await page.locator("#login-email").fill(loginEmail);
  await page.locator("#login-password").fill(loginPassword);

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/main/"), { timeout: 120000 }),
    page.getByRole("button", { name: /^登录$/ }).click(),
  ]);
}

async function readDocument(page, documentId) {
  return page.evaluate(async (targetId) => {
    const response = await fetch(`/api/documents/${targetId}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  }, documentId);
}

async function buildReport(filePath) {
  const requestLines = networkEvents
    .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms (${item.status})`)
    .join("\n");

  const crossCheckLines = crossChecks
    .map((item) => `  - ${item.apiField} -> ${item.domField}: ${item.pass ? "PASS" : "FAIL"}`)
    .join("\n");

  const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: PASS
- 关键接口耗时:
${requestLines || "  - 无"}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossCheckLines || "  - 无"}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

  await fs.writeFile(filePath, report, "utf8");
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
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

  try {
    await ensureLoggedIn(page);
    await page.goto(contentAssetsUrl, { waitUntil: "domcontentloaded" });
    await page.getByTestId("content-assets-search-input").waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const createTrigger = page.getByTestId("content-assets-create-menu-trigger");
    await createTrigger.click();
    const createAction = page.getByTestId("content-assets-create-document-action");
    try {
      await createAction.waitFor({ state: "visible", timeout: 5000 });
    } catch {
      await createTrigger.click();
      await createAction.waitFor({ state: "visible", timeout: 10000 });
    }

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          sanitizeUrl(response.url()).endsWith("/api/content-assets/documents") &&
          response.request().method() === "POST",
        { timeout: 15000 },
      ),
      createAction.click(),
    ]);
    const createPayload = await createResponse.json();
    const createdAsset = createPayload?.asset ?? null;
    const createdDetail = createPayload?.detail ?? null;
    const createdDocumentId = createdDetail?.contentLibraryItem?.documentId ?? null;

    assert(createdAsset?.id, "新建文档接口未返回资产 ID");
    assert(createdAsset?.contentLibraryItemId, "新建文档接口未返回内容库条目 ID");
    assert(createdDocumentId, "新建文档接口未返回统一文档 ID");
    assert(
      createdDetail?.contentLibraryItem?.id === createdAsset.contentLibraryItemId,
      "新建文档接口未返回可直接打开的详情数据",
    );

    const createdRow = page.getByTestId(`content-asset-tree-item-${createdAsset.id}`);
    await createdRow.waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("content-asset-reference-view").waitFor({ state: "visible", timeout: 15000 });
    const viewerTitleLocator = page.getByTestId("content-asset-viewer-title");
    await viewerTitleLocator.waitFor({ state: "visible", timeout: 15000 });

    const viewerTitle = normalizeText(await viewerTitleLocator.textContent());
    crossChecks.push({
      apiField: "POST /api/content-assets/documents -> asset.title",
      domField: "content-asset-viewer-title",
      pass: viewerTitle === normalizeText(createdAsset.title),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const editorLocator = page
      .locator('[data-testid="content-asset-reference-view"] .ProseMirror')
      .first();
    await editorLocator.waitFor({ state: "visible", timeout: 15000 });
    await editorLocator.click();

    const typedText = `内容库新建文档验收 ${Date.now()}`;
    await page.keyboard.type(typedText);

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/documents/${createdDocumentId}/autosave`) &&
        response.request().method() === "PUT",
      { timeout: 15000 },
    );

    await page.getByTestId("tiptap-editor-save").click();
    const saveResponse = await saveResponsePromise;
    assert(saveResponse.ok(), `统一文档 autosave 失败: ${saveResponse.status()}`);

    const editorText = normalizeText(await editorLocator.textContent());
    assert(editorText.includes(typedText), "保存后编辑器未显示最新输入内容");
    const redundantDetailRequests = networkEvents.filter(
      (item) =>
        item.method === "GET" &&
        item.url.endsWith(`/api/content-assets/${createdAsset.id}`),
    );
    assert(
      redundantDetailRequests.length === 0,
      `创建后仍触发冗余详情请求: ${JSON.stringify(redundantDetailRequests)}`,
    );

    const savedDocumentResponse = await readDocument(page, createdDocumentId);
    assert(savedDocumentResponse.ok, `保存后文档详情读取失败: ${savedDocumentResponse.status}`);
    const savedHtml = `${savedDocumentResponse.body?.document?.htmlContent ?? ""}`;
    crossChecks.push({
      apiField: "PUT /api/documents/:id/autosave -> document.htmlContent",
      domField: "ProseMirror text",
      pass: savedHtml.includes(typedText) && editorText.includes(typedText),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    assert(static404s.length === 0, `存在静态资源 404: ${JSON.stringify(static404s)}`);
    assert(consoleErrors.length === 0, `存在 console error: ${JSON.stringify(consoleErrors)}`);
    assert(pageErrors.length === 0, `存在 pageerror: ${JSON.stringify(pageErrors)}`);
    assert(crossChecks.every((item) => item.pass), `存在数据流交叉验证失败: ${JSON.stringify(crossChecks)}`);

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await buildReport(path.join(artifactDir, "report.md"));
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(async (error) => {
  await writeJson(path.join(artifactDir, "network.json"), networkEvents).catch(() => undefined);
  await writeJson(path.join(artifactDir, "errors.json"), {
    static404s,
    consoleErrors,
    pageErrors,
    failure: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
  }).catch(() => undefined);
  console.error(error);
  process.exit(1);
});
