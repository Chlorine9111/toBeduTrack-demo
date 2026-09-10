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
const CONTENT_AI_MARKER = "TiptapRefreshMarker";

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
    "conversationId",
  ].forEach((key) => url.searchParams.delete(key));
  return `${url.origin}${url.pathname}${url.search}`;
}

function isTrackedApi(url) {
  return (
    url.includes("/api/content-library") ||
    url.includes("/api/tiptap/jwt") ||
    url.includes("api.tiptap.dev/v1/ai")
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

async function revertDocumentHtml(page, itemId, originalDocumentHtml) {
  const revertValue = typeof originalDocumentHtml === "string" ? originalDocumentHtml : "";
  await page.evaluate(
    async ({ targetId, documentHtml }) => {
      await fetch(`/api/content-library/${targetId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentHtml }),
      });
    },
    { targetId: itemId, documentHtml: revertValue },
  );
}

async function discoverPhrase(page) {
  const phrase = await page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) return null;

    const candidates = Array.from(root.querySelectorAll("td, th, p, li, h1, h2, h3"));
    const candidate = candidates.find((element) => {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return (
        text.length >= 10 &&
        !/Tiptap\w*Marker|TiptapMenu|TiptapAuth|TiptapRefresh/i.test(text)
      );
    });
    if (!(candidate instanceof HTMLElement)) return null;
    const text = candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.slice(0, Math.min(14, text.length));
  });

  assert(typeof phrase === "string" && phrase.length >= 3, "未找到可用于测试的文本");
  return phrase;
}

async function selectPhrase(page, phrase) {
  const selected = await page.evaluate((targetPhrase) => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) return false;
    root.focus();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode instanceof Text) {
        const content = textNode.textContent ?? "";
        const start = content.indexOf(targetPhrase);
        if (start >= 0) {
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + targetPhrase.length);
          const selection = window.getSelection();
          if (!selection) return false;
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          root.dispatchEvent(
            new MouseEvent("mouseup", {
              bubbles: true,
              button: 0,
            }),
          );
          return true;
        }
      }
      textNode = walker.nextNode();
    }
    return false;
  }, phrase);

  assert(selected, `未找到可选中的短语：${phrase}`);
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });

  let injectedInvalidToken = false;
  await context.route("https://api.tiptap.dev/v1/ai/**", async (route) => {
    if (!injectedInvalidToken && route.request().method() === "POST") {
      injectedInvalidToken = true;
      await route.fulfill({
        status: 401,
        contentType: "text/plain; charset=utf-8",
        body: "Invalid token. It's either expired or malformed.",
      });
      return;
    }

    await route.continue();
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

  let editableItem = null;
  let detailBeforeEdit = null;

  try {
    console.log("[verify] start");
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
    console.log("[verify] item opened");

    await page.getByTestId("content-library-detail-title").waitFor({ state: "visible" });
    await page.locator(".ProseMirror").first().waitFor({ state: "visible" });
    console.log("[verify] editor visible");

    detailBeforeEdit = await readDetail(page, editableItem.id);
    const detailTitle = await page.getByTestId("content-library-detail-title").textContent();
    crossChecks.push({
      apiField: "GET /api/content-library/:id -> displayTitle",
      apiValue: detailBeforeEdit?.displayTitle ?? detailBeforeEdit?.title ?? null,
      domValue: detailTitle,
      pass: (detailBeforeEdit?.displayTitle ?? detailBeforeEdit?.title ?? null) === detailTitle,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });
    console.log("[verify] screenshot 1");

    const phrase = await discoverPhrase(page);
    console.log(`[verify] phrase=${phrase}`);
    await selectPhrase(page, phrase);
    console.log("[verify] phrase selected");
    await page.locator('button[title="AI 修改"]').waitFor({ state: "visible", timeout: 10000 });
    await page.locator('button[title="AI 修改"]').click();
    console.log("[verify] ai menu opened");
    await page.locator('input[placeholder="告诉 AI 怎么修改..."]').fill(
      `将当前选中的短语精确改写为 ${CONTENT_AI_MARKER}，保留其余内容不变。`,
    );
    console.log("[verify] prompt filled");

    const firstAi401Promise = page.waitForResponse(
      (response) =>
        response.url().includes("api.tiptap.dev/v1/ai") && response.status() === 401,
      { timeout: 30000 },
    );
    const refreshJwtPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/tiptap/jwt") && response.status() >= 200 && response.status() < 400,
      { timeout: 30000 },
    );
    const retriedAiSuccessPromise = page.waitForResponse(
      (response) =>
        response.url().includes("api.tiptap.dev/v1/ai") &&
        response.status() >= 200 &&
        response.status() < 400,
      { timeout: 60000 },
    );
    await page.getByRole("button", { name: "执行" }).click();
    console.log("[verify] execute clicked");
    await firstAi401Promise;
    console.log("[verify] injected 401 observed");
    await refreshJwtPromise;
    console.log("[verify] jwt refresh observed");
    await retriedAiSuccessPromise;
    console.log("[verify] retried ai success observed");

    await page.getByText("预览", { exact: true }).first().waitFor({
      state: "visible",
      timeout: 30000,
    });
    console.log("[verify] preview visible");

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });
    console.log("[verify] screenshot 2");

    const applyPreviewButton = page
      .getByTestId("content-library-detail-sheet")
      .getByRole("button", { name: "应用", exact: true });
    await applyPreviewButton.waitFor({ state: "visible" });
    await page.waitForFunction(
      () => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (node) => node.textContent?.trim() === "应用",
        );
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      { timeout: 30000 },
    );
    await applyPreviewButton.click();
    console.log("[verify] apply clicked");
    await page.getByText(CONTENT_AI_MARKER, { exact: false }).first().waitFor({
      state: "visible",
      timeout: 30000,
    });
    console.log("[verify] marker visible");

    crossChecks.push({
      apiField: "api.tiptap.dev/v1/ai 401 -> JWT 刷新 -> 200",
      apiValue: networkEvents
        .filter((item) => item.url.includes("api.tiptap.dev/v1/ai"))
        .map((item) => item.status)
        .join(" -> "),
      domValue: CONTENT_AI_MARKER,
      pass: false,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });
    console.log("[verify] screenshot 3");
  } finally {
    if (editableItem?.id && detailBeforeEdit) {
      await revertDocumentHtml(
        page,
        editableItem.id,
        detailBeforeEdit?.metadata?.documentHtml ?? null,
      ).catch(() => {});
    }

    const aiStatuses = networkEvents
      .filter((item) => item.url.includes("api.tiptap.dev/v1/ai"))
      .map((item) => item.status);
    const jwtRequestCount = networkEvents.filter((item) =>
      item.url.includes("/api/tiptap/jwt")
    ).length;
    const refreshCheck = crossChecks.find(
      (item) => item.apiField === "api.tiptap.dev/v1/ai 401 -> JWT 刷新 -> 200",
    );
    if (refreshCheck) {
      refreshCheck.pass =
        injectedInvalidToken &&
        aiStatuses.includes(401) &&
        aiStatuses.some((status) => status >= 200 && status < 400) &&
        jwtRequestCount >= 2;
    }

    await writeJson(path.join(artifactDir, "network.json"), networkEvents);
    await writeJson(path.join(artifactDir, "errors.json"), {
      consoleErrors,
      pageErrors,
      static404s,
    });
    await browser.close();
  }

  const criticalDurations = networkEvents
    .map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`);
  const allChecksPassed = crossChecks.every((item) => item.pass);
  const finalResult =
    static404s.length === 0 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    allChecksPassed &&
    networkEvents.every((item) => item.status >= 200 && item.status < 400 || item.status === 401)
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
  console.error(error);
  process.exitCode = 1;
});
