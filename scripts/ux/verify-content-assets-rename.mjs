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
    url.includes("/api/content-assets/documents") ||
    url.includes("/api/content-assets/folders") ||
    url.includes("/api/content-assets/") ||
    url.includes("/api/content-library/")
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

async function openCreateMenu(page) {
  const trigger = page.getByTestId("content-assets-create-menu-trigger");
  await trigger.click();
  const docAction = page.getByTestId("content-assets-create-document-action");
  try {
    await docAction.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    await trigger.click();
    await docAction.waitFor({ state: "visible", timeout: 10000 });
  }
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

    // 1. 新建文件夹
    await openCreateMenu(page);
    const folderAction = page.getByTestId("content-assets-create-folder-action");
    const [folderCreateResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          sanitizeUrl(response.url()).endsWith("/api/content-assets/folders") &&
          response.request().method() === "POST",
        { timeout: 15000 },
      ),
      folderAction.click(),
    ]);
    const createdFolder = (await folderCreateResponse.json())?.folder ?? null;
    assert(createdFolder?.id, "新建文件夹接口未返回文件夹 ID");

    const folderRow = page.getByTestId(`content-folder-tree-item-${createdFolder.id}`);
    await folderRow.waitFor({ state: "visible", timeout: 15000 });

    const renamedFolderName = `重命名文件夹验收 ${Date.now()}`;
    page.once("dialog", async (dialog) => {
      await dialog.accept(renamedFolderName);
    });

    const [folderRenameResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          sanitizeUrl(response.url()).includes(`/api/content-assets/folders/${createdFolder.id}`) &&
          response.request().method() === "PATCH",
        { timeout: 15000 },
      ),
      folderRow.click({ button: "right" }).then(() =>
        page.getByRole("menuitem", { name: "重命名" }).click(),
      ),
    ]);
    const renamedFolder = (await folderRenameResponse.json())?.folder ?? null;
    assert(renamedFolder?.name === renamedFolderName, "重命名文件夹接口未返回新名称");
    await page.locator(`[data-testid="content-folder-tree-item-${createdFolder.id}"]`, {
      hasText: renamedFolderName,
    }).waitFor({ state: "visible", timeout: 15000 });

    crossChecks.push({
      apiField: "PATCH /api/content-assets/folders/:id -> folder.name",
      domField: "content-folder-tree-item",
      pass: true,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    // 2. 新建文档后重命名内容
    await openCreateMenu(page);
    const docAction = page.getByTestId("content-assets-create-document-action");
    const [docCreateResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          sanitizeUrl(response.url()).endsWith("/api/content-assets/documents") &&
          response.request().method() === "POST",
        { timeout: 15000 },
      ),
      docAction.click(),
    ]);
    const createdDoc = await docCreateResponse.json();
    const createdAsset = createdDoc?.asset ?? null;
    assert(createdAsset?.id, "新建文档接口未返回资产 ID");

    const assetRow = page.getByTestId(`content-asset-tree-item-${createdAsset.id}`);
    await assetRow.waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("content-asset-reference-view").waitFor({ state: "visible", timeout: 15000 });
    await page
      .locator('[data-testid="content-asset-reference-view"] .ProseMirror')
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    const renamedAssetName = `重命名内容验收 ${Date.now()}`;
    page.once("dialog", async (dialog) => {
      await dialog.accept(renamedAssetName);
    });

    const [assetRenameResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          sanitizeUrl(response.url()).includes(`/api/content-assets/${createdAsset.id}`) &&
          response.request().method() === "PATCH",
        { timeout: 15000 },
      ),
      assetRow.click({ button: "right" }).then(() =>
        page.getByRole("menuitem", { name: "重命名" }).click(),
      ),
    ]);
    const renamedAsset = (await assetRenameResponse.json())?.asset ?? null;
    assert(renamedAsset?.title === renamedAssetName, "重命名内容接口未返回新标题");

    await page.locator(`[data-testid="content-asset-tree-item-${createdAsset.id}"]`, {
      hasText: renamedAssetName,
    }).waitFor({ state: "visible", timeout: 15000 });

    crossChecks.push({
      apiField: "PATCH /api/content-assets/:id -> asset.title",
      domField: "content-asset-tree-item",
      pass: true,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    assert(static404s.length === 0, `存在静态资源 404: ${JSON.stringify(static404s)}`);
    assert(consoleErrors.length === 0, `存在 console error: ${JSON.stringify(consoleErrors)}`);
    assert(pageErrors.length === 0, `存在 pageerror: ${JSON.stringify(pageErrors)}`);

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await buildReport(path.join(artifactDir, "report.md"));
  } catch (error) {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
      failure: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      },
    });
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
