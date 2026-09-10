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
const EDIT_MARKER = "Criterion Rubric";

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();
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
  return (
    url.includes("/api/content-library") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/tiptap/jwt") ||
    url.includes("/api/doc/edit-html") ||
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
    const preferred = items.find((item) =>
      ["rubric", "lesson_plan_markdown", "html"].includes(item?.rendererType ?? ""),
    );
    return preferred ?? null;
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

async function selectHeadingPhrase(page, phrase) {
  const selected = await page.evaluate((targetPhrase) => {
    const heading = document.querySelector(".ProseMirror h1");
    const textNode = heading?.firstChild;
    if (!(heading instanceof HTMLElement) || !(textNode instanceof Text)) {
      return false;
    }
    const start = textNode.textContent?.indexOf(targetPhrase) ?? -1;
    if (start < 0) return false;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + targetPhrase.length);
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  }, phrase);

  assert(selected, `未找到可选中的标题短语：${phrase}`);
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
    editableItem = await pickEditableItem(page);
    assert(editableItem?.id, "内容库中没有可编辑的 TipTap 条目");

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

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
    await page.getByRole("button", { name: "导出 PDF" }).waitFor({ state: "visible" });

    detailBeforeEdit = await readDetail(page, editableItem.id);
    const detailTitle = await page.getByTestId("content-library-detail-title").textContent();
    crossChecks.push({
      apiField: "GET /api/content-library/:id -> displayTitle",
      apiValue: detailBeforeEdit?.displayTitle ?? detailBeforeEdit?.title ?? null,
      domValue: detailTitle,
      pass: (detailBeforeEdit?.displayTitle ?? detailBeforeEdit?.title ?? null) === detailTitle,
    });

    await selectHeadingPhrase(page, "Scoring Rubric");
    const contentEditButton = page.getByRole("button", { name: "改内容" }).first();
    await contentEditButton.waitFor({ state: "visible" });
    await contentEditButton.click();
    await page.getByText("AI 修改").waitFor({ state: "visible" });
    await page
      .locator('input[placeholder*="输入内容修改指令"]')
      .fill(
      "将当前英文短语精确改写为 Criterion Rubric，保留其余标题与语言风格不变。",
      );
    const [aiResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("api.tiptap.dev/v1/ai")),
      page.getByRole("button", { name: "应用修改" }).click(),
    ]);
    assert(aiResponse.ok(), "TipTap Content AI 调用失败");
    await page.getByText("AI 预览", { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("button", { name: "应用预览" }).click();
    await page
      .locator(".ProseMirror h1")
      .filter({ hasText: EDIT_MARKER })
      .first()
      .waitFor({ state: "visible", timeout: 30000 });

    const saveButton = page.getByRole("button", { name: /^保存$/ }).last();
    await saveButton.waitFor({ state: "visible" });
    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/content-library/${editableItem.id}`) &&
          response.request().method() === "PATCH",
      ),
      saveButton.click(),
    ]);
    assert(saveResponse.ok(), "内容库文档保存失败");
    await page.getByRole("button", { name: "已保存" }).waitFor({ state: "visible" });

    const detailAfterEdit = await readDetail(page, editableItem.id);
    const headingText = await page.locator(".ProseMirror h1").first().textContent();
    crossChecks.push({
      apiField: "PATCH /api/content-library/:id -> metadata.documentHtml",
      apiValue:
        typeof detailAfterEdit?.metadata?.documentHtml === "string"
          ? detailAfterEdit.metadata.documentHtml.includes(EDIT_MARKER)
          : false,
      domValue: headingText,
      pass:
        Boolean(detailAfterEdit?.metadata?.documentHtml?.includes?.(EDIT_MARKER)) &&
        Boolean(headingText?.includes(EDIT_MARKER)),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const sourceConversationId = detailBeforeEdit?.sourceConversationId?.trim() ?? "";
    assert(sourceConversationId, "内容库条目缺少 sourceConversationId，无法验证 Agent Canvas");

    await page.goto(
      `${baseUrl}/main/agent?conversationId=${encodeURIComponent(sourceConversationId)}`,
      { waitUntil: "domcontentloaded" },
    );

    await page.locator('[data-testid="agent-composer"]').first().waitFor({ state: "visible" });
    const conversationDetail = await page.evaluate(async (conversationId) => {
      const response = await fetch(`/api/chat/conversations/${conversationId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return null;
      return await response.json();
    }, sourceConversationId);
    const canvasButton = page.getByRole("button", {
      name: /AP Chemistry Unit 2: Molecular and Ionic Bonding/,
    }).first();
    await canvasButton.waitFor({ state: "visible" });
    crossChecks.push({
      apiField: "GET /api/chat/conversations/:id -> 引用块标题",
      apiValue:
        Array.isArray(conversationDetail?.messages)
          ? conversationDetail.messages.some(
              (message) =>
                typeof message?.content === "string" &&
                message.content.includes("AP Chemistry Unit 2: Molecular and Ionic Bonding"),
            )
          : null,
      domValue: await canvasButton.textContent(),
      pass: Boolean(await canvasButton.textContent()),
    });
    await canvasButton.click();

    await page.getByTestId("agent-canvas-title").waitFor({ state: "visible" });
    await page.locator(".ProseMirror").first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "导出 PDF" }).waitFor({ state: "visible" });

    const canvasTitle = await page.getByTestId("agent-canvas-title").textContent();
    crossChecks.push({
      apiField: "GET /api/chat/conversations/:id -> assistant artifact title",
      apiValue: editableItem.displayTitle ?? editableItem.title ?? null,
      domValue: canvasTitle,
      pass: (canvasTitle ?? "").includes(editableItem.displayTitle ?? editableItem.title ?? ""),
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

run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
