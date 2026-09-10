import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
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
    url.includes("/api/content-assets/") ||
    url.includes("/signed-url") ||
    url.includes("/docx-preview") ||
    url.includes("/upload")
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

async function fetchBootstrap(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/content-assets/bootstrap", {
      cache: "no-store",
    });
    return await response.json();
  });
}

async function createUploadSamples() {
  const stamp = `${Date.now()}`;
  const pdfSourceCandidates = [
    "/tmp/ux-upload-sample.pdf",
    path.join(process.cwd(), "tmp/ux-upload-sample.pdf"),
    path.join(process.cwd(), "tmp/cb-ap/ap25-frq-biology-short.pdf"),
  ];

  let existingPdf = null;
  for (const candidate of pdfSourceCandidates) {
    try {
      await fs.access(candidate);
      existingPdf = candidate;
      break;
    } catch {
      // continue
    }
  }

  assert(existingPdf, "未找到可上传的 PDF 样本");

  const pdfPath = path.join(tmpdir(), `content-assets-upload-${stamp}.pdf`);
  const docxSourceText = path.join(tmpdir(), `content-assets-upload-${stamp}.txt`);
  const docxPath = path.join(tmpdir(), `content-assets-upload-${stamp}.docx`);

  await fs.copyFile(existingPdf, pdfPath);
  await fs.writeFile(
    docxSourceText,
    `内容库上传回归 ${stamp}\n\n这是一份用于验证 Word 上传与预览的测试文档。\n\n- 第一条\n- 第二条\n`,
    "utf8",
  );
  execFileSync("textutil", [
    "-convert",
    "docx",
    docxSourceText,
    "-output",
    docxPath,
  ]);

  return {
    pdfPath,
    pdfName: path.basename(pdfPath),
    docxPath,
    docxName: path.basename(docxPath),
  };
}

async function waitForUploadResponses(page, expectedCount) {
  const responses = [];

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off("response", handleResponse);
      reject(new Error(`上传接口等待超时，期望 ${expectedCount} 条响应，实际 ${responses.length} 条`));
    }, 20000);

    const handleResponse = (response) => {
      const url = sanitizeUrl(response.url());
      if (
        response.request().method() === "POST" &&
        url.endsWith("/api/content-assets/upload")
      ) {
        responses.push(response);
        if (responses.length >= expectedCount) {
          clearTimeout(timer);
          page.off("response", handleResponse);
          resolve();
        }
      }
    };

    page.on("response", handleResponse);
  });

  return Promise.all(responses.map((response) => response.json()));
}

async function waitForPdfPreview(page) {
  const nativeLocator = page.getByTestId("content-asset-pdf-native");
  const fallbackLocator = page.getByTestId("content-asset-pdf-fallback");

  await Promise.race([
    nativeLocator.waitFor({ state: "visible", timeout: 15000 }).then(() => "native"),
    fallbackLocator.waitFor({ state: "visible", timeout: 15000 }).then(() => "fallback"),
  ]);

  if (await fallbackLocator.isVisible().catch(() => false)) return "fallback";
  return "native";
}

async function buildReport(filePath, params) {
  const requestLines = networkEvents
    .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms (${item.status})`)
    .join("\n");

  const crossCheckLines = crossChecks
    .map((item) => `  - ${item.apiField} -> ${item.domField}: ${item.pass ? "PASS" : "FAIL"}`)
    .join("\n");

  const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: PASS
- PDF 预览模式: ${params.pdfPreviewMode}
- DOCX 预览: ${params.docxViewVisible ? "PASS" : "FAIL"}
- Reference 分流: ${params.referenceViewVisible ? "PASS" : "FAIL"}
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
    const bootstrap = await fetchBootstrap(page);
    const referenceSummary = Array.isArray(bootstrap?.assets)
      ? bootstrap.assets.find(
          (asset) =>
            asset.assetSource === "reference" &&
            asset.refEntityType !== "flashcard_set" &&
            asset.contentLibraryItemId,
        )
      : null;

    assert(referenceSummary, "未找到可验证的 reference 资产");

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const samples = await createUploadSamples();
    const uploadResponsesPromise = waitForUploadResponses(page, 2);
    await page.locator('input[type="file"][multiple]').last().setInputFiles([
      samples.pdfPath,
      samples.docxPath,
    ]);
    const uploadResponses = await uploadResponsesPromise;

    const uploadedPdf = uploadResponses.find((item) => item?.asset?.fileName === samples.pdfName)?.asset ?? null;
    const uploadedDocx = uploadResponses.find((item) => item?.asset?.fileName === samples.docxName)?.asset ?? null;

    assert(uploadedPdf, "PDF 上传响应缺失");
    assert(uploadedDocx, "DOCX 上传响应缺失");

    const searchInput = page.getByTestId("content-assets-search-input");
    await searchInput.fill(samples.pdfName);

    const pdfRow = page.getByTestId(`content-asset-tree-item-${uploadedPdf.id}`);
    await pdfRow.waitFor({ state: "visible", timeout: 15000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const signedUrlPromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/content-assets/${uploadedPdf.id}/signed-url`) &&
        response.request().method() === "GET",
      { timeout: 15000 },
    );

    await pdfRow.click();
    const signedUrlResponse = await signedUrlPromise;
    const signedUrlBody = await signedUrlResponse.json();

    await page.getByTestId("content-asset-viewer-title").waitFor({ state: "visible" });
    await page.getByTestId("content-asset-pdf-view").waitFor({ state: "visible" });
    assert(
      new URL(page.url()).pathname === "/main/content-assets",
      `打开 PDF 后路由异常: ${page.url()}`,
    );

    const previewMode = await waitForPdfPreview(page);
    assert(
      typeof signedUrlBody?.url === "string" && signedUrlBody.url.length > 0,
      "signed-url 接口未返回 PDF 地址",
    );

    const viewerTitle = normalizeText(
      await page.getByTestId("content-asset-viewer-title").textContent(),
    );
    const apiTitle = normalizeText(uploadedPdf.title ?? uploadedPdf.fileName ?? "");
    crossChecks.push({
      apiField: "POST /api/content-assets/upload -> uploaded.title",
      domField: "content-asset-viewer-title",
      pass: viewerTitle === apiTitle,
    });

    if (previewMode === "native") {
      await page.getByTestId("content-asset-pdf-native").waitFor({
        state: "visible",
        timeout: 15000,
      });
    } else {
      await page.locator('[data-testid="content-asset-pdf-fallback"] iframe').waitFor({
        state: "visible",
        timeout: 15000,
      });
    }

    await searchInput.fill(samples.docxName);
    const docxRow = page.getByTestId(`content-asset-tree-item-${uploadedDocx.id}`);
    await docxRow.waitFor({ state: "visible", timeout: 15000 });

    const docxPreviewPromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/content-assets/${uploadedDocx.id}/docx-preview`) &&
        response.request().method() === "GET",
      { timeout: 15000 },
    );

    await docxRow.click();
    await docxPreviewPromise;
    await page.getByTestId("content-asset-docx-view").waitFor({ state: "visible", timeout: 15000 });

    await searchInput.fill(referenceSummary.title ?? "");
    const referenceRow = page.getByTestId(`content-asset-tree-item-${referenceSummary.id}`);
    await referenceRow.waitFor({ state: "visible", timeout: 15000 });

    const signedUrlEventCountBeforeReference = networkEvents.filter((event) =>
      event.url.includes(`/api/content-assets/${referenceSummary.id}/signed-url`),
    ).length;

    const referenceDetailPromise = page.waitForResponse(
      (response) =>
        sanitizeUrl(response.url()).includes(`/api/content-assets/${referenceSummary.id}`) &&
        !sanitizeUrl(response.url()).includes("/signed-url") &&
        !sanitizeUrl(response.url()).includes("/docx-preview") &&
        response.request().method() === "GET",
      { timeout: 15000 },
    );

    await referenceRow.click();
    const referenceDetailResponse = await referenceDetailPromise;
    const referenceDetailBody = await referenceDetailResponse.json();
    await page.getByTestId("content-asset-reference-view").waitFor({ state: "visible", timeout: 15000 });
    const signedUrlEventCountAfterReference = networkEvents.filter((event) =>
      event.url.includes(`/api/content-assets/${referenceSummary.id}/signed-url`),
    ).length;

    crossChecks.push({
      apiField: "GET /api/content-assets/:id -> contentLibraryItem.displayTitle",
      domField: "content-asset-viewer-title",
      pass:
        normalizeText(referenceDetailBody?.contentLibraryItem?.displayTitle ?? "") ===
        normalizeText(await page.getByTestId("content-asset-viewer-title").textContent()),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    assert(static404s.length === 0, `存在静态资源 404: ${JSON.stringify(static404s)}`);
    assert(consoleErrors.length === 0, `存在 console error: ${JSON.stringify(consoleErrors)}`);
    assert(pageErrors.length === 0, `存在 pageerror: ${JSON.stringify(pageErrors)}`);
    assert(
      networkEvents.every((item) => item.status >= 200 && item.status < 400),
      `存在失败请求: ${JSON.stringify(networkEvents.filter((item) => item.status >= 400))}`,
    );
    assert(crossChecks.every((item) => item.pass), "数据流交叉验证失败");
    assert(
      signedUrlEventCountAfterReference === signedUrlEventCountBeforeReference,
      "reference 资产仍然触发了 signed-url 请求",
    );

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      static404s,
      consoleErrors,
      pageErrors,
    });
    await buildReport(path.join(artifactDir, "report.md"), {
      pdfPreviewMode: previewMode,
      docxViewVisible: true,
      referenceViewVisible: true,
    });
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
