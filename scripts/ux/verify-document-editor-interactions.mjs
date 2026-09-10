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
const checks = [];
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

function isTrackedUrl(url) {
  return url.includes("/api/documents") || url.includes("/main/library");
}

function isStatic404(response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  return (
    resourceType === "stylesheet" ||
    resourceType === "script" ||
    resourceType === "font" ||
    /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url())
  );
}

function recordNetwork(response) {
  const request = response.request();
  const url = request.url();
  if (!isTrackedUrl(url)) return;
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

async function createDocument(title, htmlContent) {
  const response = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      htmlContent,
      documentKind: "notes",
      editorKind: "html",
    }),
  });

  if (!response.ok) {
    throw new Error(`创建测试文档失败 (${response.status})`);
  }

  const payload = await response.json();
  const documentId = payload?.document?.id;
  assert(documentId, "创建测试文档缺少 documentId");
  return documentId;
}

function pickLatestDuration(events, matcher) {
  const matched = events.filter(matcher);
  return matched.length > 0 ? matched[matched.length - 1] : null;
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const docATitle = `Editor 交互测试 A ${stamp}`;
  const docBTitle = `Editor 交互测试 B ${stamp}`;
  const renamedTitle = `${docATitle} · 标题同步`;
  const docAId = await createDocument(
    docATitle,
    `<article data-doc-type="notes"><p>初始内容 A ${stamp}</p></article>`,
  );
  const docBId = await createDocument(
    docBTitle,
    `<article data-doc-type="notes"><p>初始内容 B ${stamp}</p></article>`,
  );

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

  try {
    await page.goto(`${baseUrl}/main/library/${docAId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("editor-title").waitFor({ state: "visible" });
    await page.waitForFunction(
      (expectedTitle) =>
        document.querySelector('[data-testid="editor-title"]')?.textContent?.trim() ===
        expectedTitle,
      docATitle,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const toggleButton = page.getByTestId("editor-properties-toggle");
    const panel = page.getByTestId("editor-properties-panel");
    const mainShell = page.getByTestId("editor-main-shell");

    const closedState = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="editor-properties-toggle"]');
      const panelEl = document.querySelector('[data-testid="editor-properties-panel"]');
      const mainEl = document.querySelector('[data-testid="editor-main-shell"]');
      return {
        buttonClass: button?.getAttribute("class") ?? "",
        panelClass: panelEl?.getAttribute("class") ?? "",
        mainClass: mainEl?.getAttribute("class") ?? "",
      };
    });

    await toggleButton.click();
    await page.getByTestId("editor-properties-close").waitFor({ state: "visible" });

    const openState = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="editor-properties-toggle"]');
      const panelEl = document.querySelector('[data-testid="editor-properties-panel"]');
      const mainEl = document.querySelector('[data-testid="editor-main-shell"]');
      return {
        buttonClass: button?.getAttribute("class") ?? "",
        panelClass: panelEl?.getAttribute("class") ?? "",
        mainClass: mainEl?.getAttribute("class") ?? "",
      };
    });

    checks.push({
      name: "属性面板打开高亮",
      pass:
        !closedState.buttonClass.includes("bg-[rgba(55,53,47,0.06)]") &&
        openState.buttonClass.includes("bg-[rgba(55,53,47,0.06)]"),
    });
    checks.push({
      name: "属性面板滑入 class",
      pass:
        closedState.panelClass.includes("translate-x-full") &&
        openState.panelClass.includes("translate-x-0"),
    });
    checks.push({
      name: "编辑区 margin 联动 class",
      pass:
        closedState.mainClass.includes("mr-0") &&
        openState.mainClass.includes("mr-[280px]"),
    });

    await page.getByTestId("editor-properties-close").click();
    await page.waitForFunction(() => {
      const panelEl = document.querySelector('[data-testid="editor-properties-panel"]');
      return panelEl?.getAttribute("class")?.includes("translate-x-full");
    });

    const titleLocator = page.getByTestId("editor-title");
    await titleLocator.evaluate((element, nextTitle) => {
      const el = element;
      el.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      el.textContent = nextTitle;
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: `${nextTitle}`,
          inputType: "insertCompositionText",
        }),
      );
      el.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data: `${nextTitle}`,
        }),
      );
      (el instanceof HTMLElement ? el : el.parentElement)?.blur?.();
    }, renamedTitle);

    await page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes(`/api/documents/${docAId}/autosave`) &&
        response.status() === 200,
    );
    await page.waitForFunction(
      (expectedTitle) =>
        document.querySelector('[data-testid="editor-title"]')?.textContent?.trim() ===
        expectedTitle,
      renamedTitle,
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await page.goto(`${baseUrl}/main/library/${docBId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("editor-title").waitFor({ state: "visible" });
    checks.push({
      name: "标题切到文档 B 后同步",
      pass: (await page.getByTestId("editor-title").textContent())?.trim() === docBTitle,
    });

    await page.goto(`${baseUrl}/main/library/${docAId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("editor-title").waitFor({ state: "visible" });
    checks.push({
      name: "标题切回文档 A 后同步",
      pass:
        (await page.getByTestId("editor-title").textContent())?.trim() === renamedTitle,
    });

    await page.getByTestId("editor-breadcrumb-0").click();
    await page.waitForURL(`${baseUrl}/main/library`);
    await page.getByTestId("document-list-heading").waitFor({ state: "visible" });
    checks.push({
      name: "面包屑可点击返回列表",
      pass: page.url() === `${baseUrl}/main/library`,
    });

    const row = page.getByTestId("document-row").filter({ hasText: renamedTitle }).first();
    await row.waitFor({ state: "visible" });
    await row.getByTestId("document-row-menu").click();
    await page.getByText("Delete").waitFor({ state: "visible" });
    await page.getByText("Delete").click();
    await page.getByTestId("document-delete-dialog").waitFor({ state: "visible" });
    checks.push({
      name: "自定义删除确认弹窗出现",
      pass: await page.getByTestId("document-delete-dialog").isVisible(),
    });

    await page.getByTestId("document-delete-cancel").click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="document-delete-dialog"]'));

    await row.getByTestId("document-row-menu").click();
    await page.getByText("Delete").waitFor({ state: "visible" });
    await page.getByText("Delete").click();
    await page.getByTestId("document-delete-dialog").waitFor({ state: "visible" });

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response.url().includes(`/api/documents/${docAId}`) &&
          response.status() === 200,
      ),
      page.getByTestId("document-delete-confirm").click(),
    ]);

    await row.waitFor({ state: "hidden" });
    checks.push({
      name: "删除后列表移除文档",
      pass: !(await row.isVisible().catch(() => false)),
    });

    const deletedResponse = await fetch(`${baseUrl}/api/documents/${docAId}`);
    checks.push({
      name: "删除后详情接口返回 404",
      pass: deletedResponse.status === 404,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    const keyDurations = [
      pickLatestDuration(
        networkEvents,
        (event) => event.method === "GET" && event.url.includes(`/api/documents/${docAId}`),
      ),
      pickLatestDuration(
        networkEvents,
        (event) =>
          event.method === "PUT" && event.url.includes(`/api/documents/${docAId}/autosave`),
      ),
      pickLatestDuration(
        networkEvents,
        (event) => event.method === "GET" && event.url.endsWith("/api/documents?limit=10&sort=updatedAt&order=desc"),
      ),
      pickLatestDuration(
        networkEvents,
        (event) => event.method === "DELETE" && event.url.includes(`/api/documents/${docAId}`),
      ),
    ].filter(Boolean);

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      checks.every((item) => item.pass);

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
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${checks.map((item) => `  - ${item.name}: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
    if (!pass) {
      process.exitCode = 1;
    }
  } catch (error) {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
      fatal: error instanceof Error ? error.message : String(error),
    });
    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: FAIL
- 失败原因: ${error instanceof Error ? error.message : String(error)}
- 关键接口耗时:
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${checks.map((item) => `  - ${item.name}: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;
    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
    throw error;
  } finally {
    try {
      await fetch(`${baseUrl}/api/documents/${docBId}`, { method: "DELETE" });
    } catch {}
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
