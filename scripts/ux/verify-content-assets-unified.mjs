import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const assetsUrl = `${baseUrl}/main/content-assets`;
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
  url.searchParams.delete("apikey");
  url.searchParams.delete("access_token");
  url.searchParams.delete("refresh_token");
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
  return url.includes("/api/content-assets");
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

function pickReferenceSummary(assets) {
  return (
    assets.find(
      (asset) =>
        asset.assetSource === "reference" &&
        typeof asset.contentLibraryItemId === "string" &&
        asset.contentLibraryItemId &&
        typeof asset.rendererType === "string" &&
        asset.rendererType,
    ) ?? null
  );
}

function pickUploadedSummary(assets) {
  return (
    assets.find(
      (asset) =>
        asset.assetSource === "uploaded" &&
        asset.previewKind === "docx" &&
        (asset.title || asset.fileName),
    ) ??
    assets.find(
      (asset) =>
        asset.assetSource === "uploaded" &&
        asset.previewKind === "pdf" &&
        (asset.title || asset.fileName),
    ) ??
    null
  );
}

async function ensureLoggedIn(page) {
  await page.goto(assetsUrl, { waitUntil: "domcontentloaded" });
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
    if (new URL(page.url()).pathname !== "/main/content-assets") {
      await page.goto(assetsUrl, { waitUntil: "domcontentloaded" });
    }
    await page.getByTestId("content-assets-search-input").waitFor({ state: "visible" });
    await page.getByText("文件", { exact: true }).waitFor({ state: "visible" });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const bootstrapBody = await page.evaluate(async () => {
      const response = await fetch("/api/content-assets/bootstrap", { cache: "no-store" });
      return await response.json();
    });

    assert(Array.isArray(bootstrapBody?.assets), "bootstrap 未返回 assets");
    assert(Array.isArray(bootstrapBody?.folders), "bootstrap 未返回 folders");

    const referenceSummary = pickReferenceSummary(bootstrapBody.assets);
    const uploadedSummary = pickUploadedSummary(bootstrapBody.assets);

    assert(referenceSummary, "未找到可验证的 reference 资产");
    assert(uploadedSummary, "未找到可验证的上传文档资产");

    const searchInput = page.getByTestId("content-assets-search-input");

    await searchInput.fill(referenceSummary.title);
    const referenceRow = page.getByTestId(`content-asset-tree-item-${referenceSummary.id}`);
    await referenceRow.waitFor({ state: "visible", timeout: 10000 });
    const referenceRowText = normalizeText(await referenceRow.textContent());
    crossChecks.push({
      apiField: "GET /api/content-assets/bootstrap -> reference.title",
      apiValue: referenceSummary.title,
      domValue: referenceRowText,
      pass: referenceRowText.includes(referenceSummary.title),
    });

    const referenceDetailPromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/content-assets/${referenceSummary.id}`) &&
        response.request().method() === "GET",
      { timeout: 15000 },
    );
    await referenceRow.click();
    const referenceDetailResponse = await referenceDetailPromise;
    const referenceDetailBody = await referenceDetailResponse.json();

    await page.getByTestId("content-asset-viewer-title").waitFor({ state: "visible" });
    await page.getByTestId("content-asset-reference-view").waitFor({ state: "visible" });
    const referenceViewerTitle = normalizeText(
      await page.getByTestId("content-asset-viewer-title").textContent(),
    );
    const referenceApiTitle = normalizeText(
      referenceDetailBody?.contentLibraryItem?.displayTitle ??
        referenceDetailBody?.asset?.title ??
        referenceSummary.title,
    );
    crossChecks.push({
      apiField: "GET /api/content-assets/:id -> reference.displayTitle",
      apiValue: referenceApiTitle,
      domValue: referenceViewerTitle,
      pass: referenceApiTitle === referenceViewerTitle,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await searchInput.fill(uploadedSummary.title ?? uploadedSummary.fileName ?? "");
    const uploadedRow = page.getByTestId(`content-asset-tree-item-${uploadedSummary.id}`);
    await uploadedRow.waitFor({ state: "visible", timeout: 10000 });

    let uploadedPreviewResponseBody = null;
    let uploadedPreviewTestId = "content-asset-docx-view";

    if (uploadedSummary.previewKind === "docx") {
      const docxPreviewPromise = page.waitForResponse(
        (response) =>
          sanitizeUrl(response.url()).includes(`/api/content-assets/${uploadedSummary.id}/docx-preview`) &&
          response.request().method() === "GET",
        { timeout: 15000 },
      );
      await uploadedRow.click();
      const docxPreviewResponse = await docxPreviewPromise;
      uploadedPreviewResponseBody = await docxPreviewResponse.json();
      uploadedPreviewTestId = "content-asset-docx-view";
    } else {
      const pdfPreviewPromise = page.waitForResponse(
        (response) =>
          sanitizeUrl(response.url()).includes(`/api/content-assets/${uploadedSummary.id}/signed-url`) &&
          response.request().method() === "GET",
        { timeout: 15000 },
      );
      await uploadedRow.click();
      const pdfPreviewResponse = await pdfPreviewPromise;
      uploadedPreviewResponseBody = await pdfPreviewResponse.json();
      uploadedPreviewTestId = "content-asset-pdf-view";
    }

    await page.getByTestId("content-asset-viewer-title").waitFor({ state: "visible" });
    await page.getByTestId(uploadedPreviewTestId).waitFor({ state: "visible", timeout: 15000 });
    const uploadedViewerTitle = normalizeText(
      await page.getByTestId("content-asset-viewer-title").textContent(),
    );
    const uploadedApiTitle = normalizeText(
      uploadedSummary.title ?? uploadedSummary.fileName ?? "",
    );
    crossChecks.push({
      apiField: "GET /api/content-assets/bootstrap -> uploaded.title",
      apiValue: uploadedApiTitle,
      domValue: uploadedViewerTitle,
      pass: uploadedApiTitle === uploadedViewerTitle,
    });

    if (uploadedSummary.previewKind === "docx") {
      assert(
        typeof uploadedPreviewResponseBody?.html === "string" &&
          uploadedPreviewResponseBody.html.length > 0,
        "DOCX 预览接口未返回 html",
      );
    } else {
      assert(
        typeof uploadedPreviewResponseBody?.url === "string" &&
          uploadedPreviewResponseBody.url.length > 0,
        "PDF 预览接口未返回 signed url",
      );
    }

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

    const criticalDurations = networkEvents.map(
      (item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`,
    );

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      "- 关键接口耗时:",
      ...(criticalDurations.length > 0 ? criticalDurations : ["  - 无"]),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (check) =>
          `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${check.pass ? "PASS" : "FAIL"}`,
      ),
      "- 截图:",
      "  - verify-1-loaded.png",
      "  - verify-2-after-action.png",
      "  - verify-3-result.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ];

    await fs.writeFile(path.join(artifactDir, "report.md"), reportLines.join("\n"), "utf8");

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      crossChecks.length >= 3 &&
      crossChecks.every((check) => check.pass) &&
      networkEvents.every(
        (item) =>
          item.status >= 200 &&
          item.status < 300 &&
          item.durationMs <= 30000,
      );

    if (!pass) {
      throw new Error("L1 验证未通过");
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch(async (error) => {
  await writeJson(path.join(artifactDir, "network.json"), networkEvents).catch(() => {});
  await writeJson(path.join(artifactDir, "errors.json"), {
    consoleErrors,
    pageErrors,
    static404s,
    fatalError: error instanceof Error ? error.message : String(error),
  }).catch(() => {});
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    `## UX 验证报告\n\n- 验证级别: L1\n- 最终结论: FAIL\n- 失败原因: ${error instanceof Error ? error.message : String(error)}\n- 产物目录:\n  - ${artifactDir}\n`,
    "utf8",
  ).catch(() => {});
  console.error(error);
  process.exit(1);
});
