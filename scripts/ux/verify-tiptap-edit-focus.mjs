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
const EDIT_MARKER = " MULTIINPUTCHECK";
const TARGET_PHRASE = "Academic Rubric";

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
    url.includes("/api/documents/") ||
    url.includes("/api/tiptap/jwt")
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

async function pickRubricItem(page) {
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
    return items.find((item) => item?.rendererType === "rubric") ?? null;
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

async function readDocument(page, documentId) {
  return page.evaluate(async (targetId) => {
    const response = await fetch(`/api/documents/${targetId}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("读取统一文档详情失败");
    }
    return await response.json();
  }, documentId);
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

async function focusEditableTarget(page) {
  const result = await page.evaluate((targetPhrase) => {
    function findScrollContainer(element) {
      let current = element;
      while (current) {
        if (
          current instanceof HTMLElement &&
          current.scrollHeight > current.clientHeight + 4 &&
          ["auto", "scroll"].includes(window.getComputedStyle(current).overflowY)
        ) {
          return current;
        }
        current = current.parentElement;
      }
      return document.scrollingElement instanceof HTMLElement
        ? document.scrollingElement
        : document.documentElement;
    }

    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) return null;

    const targetTextNode = Array.from(
      root.querySelectorAll("p, td p, th p, li, h1, h2, h3"),
    ).find((element) => element.textContent?.includes(targetPhrase));

    if (!(targetTextNode instanceof HTMLElement)) return null;

    const scrollContainer = findScrollContainer(targetTextNode);

    const walker = document.createTreeWalker(targetTextNode, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode instanceof Text && (textNode.textContent?.trim()?.length ?? 0) > 0) {
        root.focus();
        const range = document.createRange();
        range.setStart(textNode, textNode.textContent.length);
        range.setEnd(textNode, textNode.textContent.length);
        const selection = window.getSelection();
        if (!selection) return null;
        selection.removeAllRanges();
        selection.addRange(range);
        return {
          scrollTop: scrollContainer.scrollTop,
          targetPreview: targetTextNode.textContent?.slice(0, 80) ?? "",
        };
      }
      textNode = walker.nextNode();
    }

    return null;
  }, TARGET_PHRASE);

  assert(result, `未找到可编辑的目标短语：${TARGET_PHRASE}`);
  return result;
}

async function readEditState(page, marker) {
  return page.evaluate((textMarker) => {
    function findScrollContainer(element) {
      let current = element;
      while (current) {
        if (
          current instanceof HTMLElement &&
          current.scrollHeight > current.clientHeight + 4 &&
          ["auto", "scroll"].includes(window.getComputedStyle(current).overflowY)
        ) {
          return current;
        }
        current = current.parentElement;
      }
      return document.scrollingElement instanceof HTMLElement
        ? document.scrollingElement
        : document.documentElement;
    }

    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) {
      return {
        hasMarker: false,
        activeElementTag: document.activeElement?.tagName ?? null,
        activeElementClass: document.activeElement instanceof HTMLElement
          ? document.activeElement.className
          : null,
        scrollTop: null,
      };
    }

    const targetElement = Array.from(
      root.querySelectorAll("p, td p, th p, li, h1, h2, h3"),
    ).find((element) => element.textContent?.includes(textMarker));
    const scrollContainer = findScrollContainer(targetElement ?? root);

    return {
      hasMarker: root.innerText.includes(textMarker.trim()),
      activeElementTag: document.activeElement?.tagName ?? null,
      activeElementClass: document.activeElement instanceof HTMLElement
        ? document.activeElement.className
        : null,
      scrollTop: scrollContainer.scrollTop,
    };
  }, marker);
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
    await ensureSignedIn(page);
    editableItem = await pickRubricItem(page);
    assert(editableItem?.id, "内容库中没有可编辑的 rubric 条目");

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

    detailBeforeEdit = await readDetail(page, editableItem.id);
    const detailTitle = await page.getByTestId("content-library-detail-title").textContent();
    crossChecks.push({
      apiField: "GET /api/content-library/:id -> displayTitle",
      apiValue: detailBeforeEdit?.displayTitle ?? detailBeforeEdit?.title ?? null,
      domValue: detailTitle,
      pass: (detailBeforeEdit?.displayTitle ?? detailBeforeEdit?.title ?? null) === detailTitle,
    });
    const editableDocumentId = detailBeforeEdit?.documentId ?? null;
    assert(editableDocumentId, "内容库详情缺少统一文档 ID");

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    const beforeFocus = await focusEditableTarget(page);

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await page.keyboard.type(EDIT_MARKER, { delay: 40 });
    await page.waitForFunction(
      (marker) => {
        const root = document.querySelector(".ProseMirror");
        return root instanceof HTMLElement && root.innerText.includes(marker.trim());
      },
      EDIT_MARKER,
      { timeout: 15000 },
    );

    const afterEdit = await readEditState(page, EDIT_MARKER);
    console.log("[verify] beforeFocus", beforeFocus);
    console.log("[verify] afterEdit", afterEdit);
    assert(afterEdit.hasMarker, "连续输入后未在文档中看到完整输入文本");
    assert(
      afterEdit.activeElementClass?.includes("ProseMirror"),
      "连续输入后焦点没有停留在编辑器，编辑被中断",
    );
    assert(
      typeof beforeFocus.scrollTop === "number" &&
        typeof afterEdit.scrollTop === "number" &&
        Math.abs(afterEdit.scrollTop - beforeFocus.scrollTop) < 240,
      "输入后滚动位置异常跳变，疑似被强制滚到顶部或底部",
    );

    const saveButton = page.getByRole("button", { name: /^保存$/ }).last();
    await saveButton.waitFor({ state: "visible" });
    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/documents/${editableDocumentId}/autosave`) &&
          response.request().method() === "PUT",
      ),
      saveButton.click(),
    ]);
    assert(saveResponse.ok(), "统一文档 autosave 失败");
    await page.getByRole("button", { name: "已保存" }).waitFor({ state: "visible" });

    const detailAfterEdit = await readDocument(page, editableDocumentId);
    crossChecks.push({
      apiField: "PUT /api/documents/:id/autosave -> document.htmlContent",
      apiValue:
        typeof detailAfterEdit?.document?.htmlContent === "string"
          ? detailAfterEdit.document.htmlContent.includes(EDIT_MARKER.trim())
          : false,
      domValue: afterEdit.hasMarker ? EDIT_MARKER.trim() : null,
      pass:
        Boolean(detailAfterEdit?.document?.htmlContent?.includes?.(EDIT_MARKER.trim())) &&
        afterEdit.hasMarker,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });

    await revertDocumentHtml(
      page,
      editableItem.id,
      detailBeforeEdit?.metadata?.documentHtml ?? null,
    );
  } finally {
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
    networkEvents.every((item) => item.status >= 200 && item.status < 400)
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
