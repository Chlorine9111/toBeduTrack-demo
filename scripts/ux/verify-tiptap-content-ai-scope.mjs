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
const CONTENT_AI_MARKER = "TiptapScopeMarker";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];
const requestStarts = new WeakMap();
const editHtmlRequests = [];

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
    "conversationId",
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedApi(url) {
  return (
    url.includes("/api/content-library") ||
    url.includes("/api/tiptap/jwt") ||
    url.includes("/api/doc/edit-html")
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

function normalizeText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function stripTags(html) {
  return `${html ?? ""}`.replace(/<[^>]*>/g, " ");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureSignedIn(page) {
  await page.goto(`${baseUrl}/main/library`, { waitUntil: "domcontentloaded" });

  if (page.url().includes("/auth/login")) {
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent" || url.pathname === "/main/library", {
        timeout: 120000,
      }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);
    await page.goto(`${baseUrl}/main/library`, { waitUntil: "domcontentloaded" });
  }

  await page.getByRole("heading", { name: "内容库" }).waitFor({ state: "visible" });
}

async function pickEditableItem(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/content-library?limit=20", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("读取内容库列表失败");
    }
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return (
      items.find((item) =>
        ["rubric", "lesson_plan_markdown", "html"].includes(item?.rendererType ?? ""),
      ) ?? null
    );
  });
}

async function readDetail(page, itemId) {
  return page.evaluate(async (targetId) => {
    const response = await fetch(`/api/content-library/${targetId}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("读取内容详情失败");
    }
    return await response.json();
  }, itemId);
}

async function selectPhrase(page, phrase) {
  const selected = await page.evaluate((targetPhrase) => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) return false;
    const editor = root.editor;
    if (!editor?.view) return false;
    editor.commands.focus();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode instanceof Text) {
        const content = textNode.textContent ?? "";
        const start = content.indexOf(targetPhrase);
        if (start >= 0) {
          const from = editor.view.posAtDOM(textNode, start);
          const to = editor.view.posAtDOM(textNode, start + targetPhrase.length);
          editor.commands.setTextSelection({ from, to });
          editor.view.dispatch(
            editor.state.tr.setMeta("doc-selection-menu", "updatePosition"),
          );
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + targetPhrase.length);
          const selection = window.getSelection();
          if (!selection) return false;
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          return selection.toString();
        }
      }
      textNode = walker.nextNode();
    }
    return false;
  }, phrase);

  assert(selected === phrase, `未能精确选中短语：${phrase}`);
}

async function discoverPhrase(page) {
  const phrase = await page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) return null;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode instanceof Text) {
        const text = (textNode.textContent ?? "").replace(/\s+/g, " ").trim();
        if (
          text.length >= 18 &&
          !text.includes("TiptapMenuContentMarker") &&
          !text.includes("TiptapScopeMarker") &&
          !text.includes("TiptapMenuStructureMarker")
        ) {
          return text.slice(0, Math.min(16, text.length));
        }
      }
      textNode = walker.nextNode();
    }
    return null;
  });

  assert(typeof phrase === "string" && phrase.length >= 3, "未找到可用于作用域验证的短语");
  return phrase;
}

async function capturePhraseContext(page, phrase) {
  const payload = await page.evaluate((targetPhrase) => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) return null;

    const blocks = Array.from(root.querySelectorAll("td, th, p, li, h1, h2, h3"));
    const target = blocks.find((element) =>
      (element.textContent ?? "").replace(/\s+/g, " ").includes(targetPhrase),
    );
    if (!(target instanceof HTMLElement)) return null;

    const text = (target.textContent ?? "").replace(/\s+/g, " ").trim();
    const index = text.indexOf(targetPhrase);
    if (index < 0) return null;

    return {
      text,
      prefix: text.slice(Math.max(0, index - 24), index).trim(),
      suffix: text.slice(index + targetPhrase.length, index + targetPhrase.length + 24).trim(),
    };
  }, phrase);

  assert(payload?.text, `未找到包含短语的上下文块：${phrase}`);
  return payload;
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
    const url = request.url();
    if (url.includes("/api/doc/edit-html")) {
      editHtmlRequests.push({
        method: request.method(),
        url: sanitizeUrl(url),
        body: request.postData() ?? null,
      });
    }
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

  let editableItem = null;
  let phrase = "";
  let contextBefore = null;
  let detail = null;

  try {
    await ensureSignedIn(page);
    console.log("[verify] signed in");
    editableItem = await pickEditableItem(page);
    assert(editableItem?.id, "内容库中没有可编辑条目");

    const targetCard = page
      .getByTestId("library-item-card")
      .filter({
        hasText: editableItem.displayTitle ?? editableItem.title ?? "",
      })
      .first();
    await targetCard.waitFor({ state: "visible" });
    await targetCard.click();

    await page.getByTestId("content-library-detail-title").waitFor({ state: "visible" });
    await page.locator(".ProseMirror").first().waitFor({ state: "visible" });
    detail = await readDetail(page, editableItem.id);
    console.log(`[verify] opened item ${editableItem.id}`);

    const detailTitle = await page.getByTestId("content-library-detail-title").textContent();
    crossChecks.push({
      apiField: "GET /api/content-library/:id -> displayTitle",
      apiValue: detail?.displayTitle ?? detail?.title ?? null,
      domValue: detailTitle,
      pass: (detail?.displayTitle ?? detail?.title ?? null) === detailTitle,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    phrase = await discoverPhrase(page);
    contextBefore = await capturePhraseContext(page, phrase);
    console.log(`[verify] phrase=${phrase}`);

    await selectPhrase(page, phrase);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("deskmate:open-selection-ai"));
    });
    await page.getByTestId("tiptap-selection-ai-input").waitFor({
      state: "visible",
      timeout: 15000,
    });
    console.log("[verify] ai menu opened");

    const aiInput = page.getByTestId("tiptap-selection-ai-input");
    await aiInput.waitFor({ state: "visible" });
    await aiInput.fill(`将当前选中的短语精确改写为 ${CONTENT_AI_MARKER}，保留其余内容不变。`);
    const executeButton = page.getByTestId("tiptap-selection-ai-submit");
    await executeButton.waitFor({ state: "visible" });

    const [editResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/doc/edit-html")),
      executeButton.click(),
    ]);
    assert(editResponse.ok(), "局部编辑接口调用失败");
    console.log(`[verify] edit-html ${editResponse.status()}`);
    await page.getByTestId("tiptap-selection-ai-preview").waitFor({
      state: "visible",
      timeout: 30000,
    });

    const markerCountBeforeApply = await page.evaluate((marker) => {
      const root = document.querySelector(".ProseMirror");
      if (!(root instanceof HTMLElement)) return 0;
      const text = (root.textContent ?? "").replace(/\s+/g, " ");
      return text.split(marker).length - 1;
    }, CONTENT_AI_MARKER);
    crossChecks.push({
      apiField: "Preview stage -> editor content unchanged before apply",
      apiValue: markerCountBeforeApply,
      domValue: markerCountBeforeApply,
      pass: markerCountBeforeApply === 0,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const editRequest = editHtmlRequests.at(-1);
    assert(editRequest?.body, "未捕获到局部编辑请求体");
    const requestBody = JSON.parse(editRequest.body);
    const selectedPromptText = normalizeText(stripTags(requestBody?.selectedHtml ?? ""));
    crossChecks.push({
      apiField: "POST /api/doc/edit-html -> selectedHtml",
      apiValue: selectedPromptText,
      domValue: phrase,
      pass: selectedPromptText === normalizeText(phrase),
    });

    await page.getByTestId("tiptap-selection-ai-apply").click();

    await page.getByText(CONTENT_AI_MARKER, { exact: false }).first().waitFor({
      state: "visible",
      timeout: 30000,
    });
    console.log("[verify] marker visible");

    const contextAfter = await capturePhraseContext(page, CONTENT_AI_MARKER);
    const markerCount = await page.evaluate((marker) => {
      const root = document.querySelector(".ProseMirror");
      if (!(root instanceof HTMLElement)) return 0;
      const text = (root.textContent ?? "").replace(/\s+/g, " ");
      return text.split(marker).length - 1;
    }, CONTENT_AI_MARKER);

    crossChecks.push({
      apiField: "DOM apply preview -> only selected phrase replaced",
      apiValue: JSON.stringify({
        beforePrefix: contextBefore.prefix,
        beforeSuffix: contextBefore.suffix,
        afterText: contextAfter.text,
        markerCount,
      }),
      domValue: contextAfter.text,
      pass:
        markerCount === 1 &&
        contextAfter.text.includes(CONTENT_AI_MARKER) &&
        (!contextBefore.prefix || contextAfter.text.includes(contextBefore.prefix)) &&
        (!contextBefore.suffix || contextAfter.text.includes(contextBefore.suffix)),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });
  } finally {
    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });
    await browser.close();
  }

  const criticalDurations = networkEvents.map(
    (item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`,
  );
  const allChecksPassed = crossChecks.every((item) => item.pass);
  const finalResult =
    static404s.length === 0 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    allChecksPassed &&
    networkEvents.length > 0 &&
    networkEvents.every((item) => item.status >= 200 && item.status < 400) &&
    networkEvents.every((item) => item.durationMs <= 30000)
      ? "PASS"
      : "FAIL";

  const reportLines = [
    "## UX 验证报告",
    "",
    "- 验证级别: L1",
    `- 最终结论: ${finalResult}`,
    "- 关键接口耗时:",
    ...(criticalDurations.length > 0 ? criticalDurations : ["  - 无"]),
    "- 错误统计:",
    `  - 静态资源 404: ${static404s.length}`,
    `  - console error: ${consoleErrors.length}`,
    `  - pageerror: ${pageErrors.length}`,
    "- 数据流交叉验证:",
    ...crossChecks.map(
      (check) =>
        `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${String(check.domValue)}\`: ${
          check.pass ? "PASS" : "FAIL"
        }`,
    ),
    "- 截图:",
    "  - verify-1-loaded.png",
    "  - verify-2-after-action.png",
    "  - verify-3-result.png",
    "- 产物目录:",
    `  - ${artifactDir}`,
    "",
  ];

  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    `${reportLines.join("\n")}\n`,
    "utf8",
  );

  if (finalResult !== "PASS") {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
