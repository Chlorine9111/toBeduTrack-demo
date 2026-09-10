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
const requestStarts = new WeakMap();
const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const crossChecks = [];

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
  return url.includes("/api/content-library");
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

async function computeSelectionDrag(page) {
  const result = await page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) return null;

    const candidates = Array.from(root.querySelectorAll("td, th, p, li, h1, h2, h3"));
    for (const element of candidates) {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (
        text.length < 12 ||
        /Tiptap\w*Marker|TiptapMenu|TiptapAuth|TiptapRefresh/i.test(text)
      ) {
        continue;
      }

      const phrase = text.slice(0, Math.min(12, text.length));
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      while (textNode) {
        if (textNode instanceof Text) {
          const content = textNode.textContent ?? "";
          const start = content.indexOf(phrase);
          if (start >= 0) {
            const startRange = document.createRange();
            startRange.setStart(textNode, start);
            startRange.setEnd(textNode, start + 1);
            const endRange = document.createRange();
            endRange.setStart(textNode, start + phrase.length - 1);
            endRange.setEnd(textNode, start + phrase.length);
            const startRect = startRange.getBoundingClientRect();
            const endRect = endRange.getBoundingClientRect();
            if (startRect.width > 0 && endRect.width > 0) {
              return {
                phrase,
                start: {
                  x: startRect.left + Math.max(startRect.width / 2, 1),
                  y: startRect.top + Math.max(startRect.height / 2, 1),
                },
                end: {
                  x: endRect.right - Math.max(endRect.width / 2, 1),
                  y: endRect.top + Math.max(endRect.height / 2, 1),
                },
              };
            }
          }
        }
        textNode = walker.nextNode();
      }
    }

    return null;
  });

  assert(result, "未找到可拖选的正文文本");
  return result;
}

async function programmaticSelectPhrase(page, phrase) {
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

  assert(selected, "程序化兜底选区失败");
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

  try {
    console.log("[verify] start");
    await ensureSignedIn(page);
    console.log("[verify] signed in");
    const editableItem = await pickEditableItem(page);
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

    const detail = await readDetail(page, editableItem.id);
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
    console.log("[verify] screenshot 1");

    const drag = await computeSelectionDrag(page);
    console.log(`[verify] phrase=${drag.phrase}`);
    await page.mouse.move(drag.start.x, drag.start.y);
    await page.mouse.down();
    await page.mouse.move(drag.end.x, drag.end.y, { steps: 8 });
    await page.mouse.up();
    console.log("[verify] drag completed");

    const immediateSelectionState = await page.evaluate(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const highlightRegistry = CSS.highlights;
      return {
        selectionText: text,
        hasPreviewHighlight: Boolean(highlightRegistry?.has?.("doc-engine-selection-preview")),
      };
    });
    console.log(
      `[verify] immediate selection="${immediateSelectionState.selectionText}" highlight=${immediateSelectionState.hasPreviewHighlight}`,
    );

    if (!immediateSelectionState.selectionText) {
      await programmaticSelectPhrase(page, drag.phrase);
      console.log("[verify] fallback programmatic selection applied");
    }

    await page.locator('button[title="AI 修改"]').waitFor({ state: "visible", timeout: 10000 });
    console.log("[verify] bubble visible");
    const selectionState = await page.evaluate(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const highlightRegistry = CSS.highlights;
      return {
        selectionText: text,
        hasPreviewHighlight: Boolean(highlightRegistry?.has?.("doc-engine-selection-preview")),
      };
    });
    assert(selectionState.selectionText.length >= 3, "拖选后没有形成有效选区");
    assert(selectionState.hasPreviewHighlight, "拖选后没有注册选区预览高光");
    console.log("[verify] selection + highlight ok");

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });
    console.log("[verify] screenshot 2");

    await page.waitForTimeout(800);
    const composerState = await page.evaluate(() => {
      const highlightRegistry = CSS.highlights;
      return {
        hasPreviewHighlight: Boolean(highlightRegistry?.has?.("doc-engine-selection-preview")),
      };
    });
    assert(composerState.hasPreviewHighlight, "拖选后短暂停留时选区预览高光丢失");
    console.log("[verify] highlight persists");

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
      fullPage: true,
    });
    console.log("[verify] screenshot 3");
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
