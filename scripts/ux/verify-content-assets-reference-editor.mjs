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
const runTag =
  process.env.UX_RUN_TAG ??
  `UXDOC-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const seedTitle = `内容资产文档编辑验证 ${runTag}`;
const editMarker = `已通过编辑器写入 ${runTag}`;
const seedMarkdown = `# ${seedTitle}

这是一份用于验证内容资产右侧文档编辑器的测试文档。

## 教学目标

- 验证 markdown reference 默认进入统一文档编辑器
- 验证老师可直接在右侧编辑并保存
`;

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
    url.includes("/api/content-library/save-artifact") ||
    url.includes("/api/documents/") ||
    url.includes("/api/content-library/") ||
    url.includes("/api/content-assets")
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
  if (currentPath !== "/auth/login") {
    return;
  }

  await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
  await page.locator("#login-email").fill(loginEmail);
  await page.locator("#login-password").fill(loginPassword);

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/main/"), { timeout: 120000 }),
    page.getByRole("button", { name: /^登录$/ }).click(),
  ]);
}

async function fetchJson(page, relativeUrl, init) {
  return page.evaluate(
    async ({ url, initPayload }) => {
      const response = await fetch(url, initPayload);
      const body = await response.json().catch(() => null);
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    },
    {
      url: relativeUrl,
      initPayload: init ?? null,
    },
  );
}

async function seedMarkdownArtifact(page) {
  const response = await fetchJson(page, "/api/content-library/save-artifact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artifactKind: "notes",
      title: seedTitle,
      markdown: seedMarkdown,
    }),
  });

  assert(response.ok, `保存测试文档失败: ${response.status}`);
  assert(response.body?.ok === true, "保存测试文档未返回 ok=true");
}

async function fetchBootstrap(page) {
  const response = await fetchJson(page, "/api/content-assets/bootstrap", {
    cache: "no-store",
  });
  assert(response.ok, `bootstrap 请求失败: ${response.status}`);
  return response.body;
}

async function waitForSeededAsset(page) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const bootstrap = await fetchBootstrap(page);
    const assets = Array.isArray(bootstrap?.assets) ? bootstrap.assets : [];
    const matched = assets.find(
      (asset) =>
        asset.assetSource === "reference" &&
        normalizeText(asset.title) === normalizeText(seedTitle),
    );
    if (matched) {
      return matched;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`未在 assets bootstrap 中找到测试文档: ${seedTitle}`);
}

async function buildReport(filePath, result) {
  const keyRequests = networkEvents
    .filter((event) =>
      event.url.includes("/api/content-library/save-artifact") ||
      event.url.includes("/api/content-assets/bootstrap") ||
      event.url.includes("/api/content-assets/") ||
      event.url.includes("/api/content-library/"),
    )
    .map((event) => `  - ${event.method} ${event.url.replace(baseUrl, "")}: ${event.durationMs}ms (${event.status})`)
    .join("\n");

  const crossCheckLines = crossChecks
    .map(
      (item) =>
        `  - ${item.apiField} -> ${item.domField}: ${item.pass ? "PASS" : "FAIL"}`,
    )
    .join("\n");

  const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${result.status}
- 关键接口耗时:
${keyRequests || "  - 无"}
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
${result.errorMessage ? `- 失败原因: ${result.errorMessage}\n` : ""}`;

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

  let finalError = null;

  try {
    await ensureLoggedIn(page);
    await page.goto(contentAssetsUrl, { waitUntil: "domcontentloaded" });
    await page.getByTestId("content-assets-search-input").waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    await seedMarkdownArtifact(page);
    const seededAsset = await waitForSeededAsset(page);
    assert(
      typeof seededAsset.contentLibraryItemId === "string" && seededAsset.contentLibraryItemId,
      "测试文档未生成 contentLibraryItemId",
    );

    const detailBeforeResponse = await fetchJson(page, `/api/content-assets/${seededAsset.id}`, {
      cache: "no-store",
    });
    assert(detailBeforeResponse.ok, `测试文档详情读取失败: ${detailBeforeResponse.status}`);
    const detailBefore = detailBeforeResponse.body;
    assert(detailBefore?.detailKind === "reference", "测试文档不是 reference 资产");
    assert(
      detailBefore?.contentLibraryItem?.snapshot?.kind === "markdown",
      "测试文档不是 markdown snapshot",
    );
    assert(
      !detailBefore?.contentLibraryItem?.metadata?.documentHtml,
      "测试文档初始已存在 documentHtml，无法验证首次物化路径",
    );
    assert(
      !detailBefore?.contentLibraryItem?.documentId,
      "测试文档初始已存在 documentId，无法验证首次物化路径",
    );

    const detailPromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/content-assets/${seededAsset.id}`) &&
        response.request().method() === "GET",
      { timeout: 15000 },
    );

    await page.goto(
      `${contentAssetsUrl}?itemId=${encodeURIComponent(seededAsset.contentLibraryItemId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await detailPromise;

    await page.getByTestId("content-asset-viewer-title").waitFor({ state: "visible" });
    await page.getByTestId("content-asset-reference-view").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "导出 PDF" }).waitFor({ state: "visible" });
    const saveButton = page.getByTestId("tiptap-editor-save");
    await saveButton.waitFor({ state: "visible" });

    const viewerTitle = normalizeText(
      await page.getByTestId("content-asset-viewer-title").textContent(),
    );
    crossChecks.push({
      apiField: "GET /api/content-assets/:id -> contentLibraryItem.displayTitle",
      domField: "content-asset-viewer-title",
      pass: viewerTitle.includes(detailBefore.contentLibraryItem.displayTitle),
    });

    const editor = page.locator(".tiptap .ProseMirror").first();
    await editor.waitFor({ state: "visible" });
    const contentEditable = await editor.getAttribute("contenteditable");
    assert(contentEditable === "true", "文档编辑器未进入可编辑态");

    const itemAfterOpenResponse = await fetchJson(
      page,
      `/api/content-library/${seededAsset.contentLibraryItemId}`,
      { cache: "no-store" },
    );
    assert(itemAfterOpenResponse.ok, `物化后内容详情读取失败: ${itemAfterOpenResponse.status}`);
    const itemAfterOpen = itemAfterOpenResponse.body;
    const materializedDocumentId = itemAfterOpen?.documentId ?? null;
    assert(materializedDocumentId, "首次打开编辑器后未补齐统一文档 ID");

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await editor.evaluate((node) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      node.focus();
    });
    await page.keyboard.press("Enter");
    await page.keyboard.type(editMarker);
    await page.getByText(editMarker).waitFor({ state: "visible" });

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/documents/${materializedDocumentId}/autosave`) &&
        response.request().method() === "PUT",
      { timeout: 15000 },
    );
    await saveButton.click();
    const saveResponse = await saveResponsePromise;
    assert(saveResponse.ok(), `统一文档 autosave 失败: ${saveResponse.status()}`);
    await page.getByTestId("tiptap-editor-save").getByText("已保存").waitFor({ state: "visible" });

    const detailAfterResponse = await fetchJson(
      page,
      `/api/documents/${materializedDocumentId}`,
      { cache: "no-store" },
    );
    assert(detailAfterResponse.ok, `保存后详情读取失败: ${detailAfterResponse.status}`);
    const detailAfter = detailAfterResponse.body;
    const savedHtml = typeof detailAfter?.document?.htmlContent === "string"
      ? detailAfter.document.htmlContent
      : "";
    crossChecks.push({
      apiField: "PUT /api/documents/:id/autosave -> document.htmlContent",
      domField: "tiptap editor visible marker",
      pass: savedHtml.includes(editMarker),
    });
    assert(savedHtml.includes(editMarker), "保存后统一文档未包含编辑标记");

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    assert(static404s.length === 0, `存在静态资源 404: ${JSON.stringify(static404s)}`);
    assert(consoleErrors.length === 0, `存在 console error: ${JSON.stringify(consoleErrors)}`);
    assert(pageErrors.length === 0, `存在 pageerror: ${JSON.stringify(pageErrors)}`);
    assert(
      networkEvents.every((event) => event.status >= 200 && event.status < 400),
      `存在失败请求: ${JSON.stringify(networkEvents.filter((event) => event.status >= 400))}`,
    );
    assert(crossChecks.every((item) => item.pass), "存在未通过的数据流交叉验证");
  } catch (error) {
    finalError = error instanceof Error ? error : new Error("未知错误");
  }

  await writeJson(path.join(artifactDir, "network.json"), networkEvents);
  await writeJson(path.join(artifactDir, "errors.json"), {
    static404s,
    consoleErrors,
    pageErrors,
  });
  await buildReport(path.join(artifactDir, "report.md"), {
    status: finalError ? "FAIL" : "PASS",
    errorMessage: finalError?.message ?? null,
  });

  await browser.close();

  if (finalError) {
    throw finalError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
