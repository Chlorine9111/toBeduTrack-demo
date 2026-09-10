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
const runTag =
  process.env.UX_RUN_TAG ??
  `CanvasFmt-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const lessonPrompt =
  process.env.UX_LESSON_PROMPT ??
  [
    `请生成一份标题中包含「${runTag}」的高中 AP Calculus AB 45 分钟完整教案。`,
    "必须在正文中原样保留以下公式的 LaTeX 写法，不要改写成 Unicode，也不要去掉美元符号：",
    "1. $f(x)=\\int_0^x e^{-t^2}\\,dt$",
    "2. $$\\frac{dV}{dt}=4\\pi r^2\\frac{dr}{dt}$$",
    "要求正文里必须包含：",
    "1）“六、练习与评估（10 分钟）”小节",
    "2）单独一行“阶段：summary”",
    "3）一段以“> 题目：”开头的 AP 风格题",
    "4）一个单独的“---”分隔线",
    "5）三个评估要点列表",
    "6）一个 markdown 表格",
    "7）“七、分层教学建议”小节",
    "8）单独一行“阶段：extension”",
    "9）基础层、中等层、进阶层三个小节",
  ].join("；");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureAgentReady(page) {
  await page.goto(`${baseUrl}/main/agent`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const composer = page.locator('[data-testid="agent-composer"]').first();
  const authForm = page.locator('form[data-auth-ready="true"]');

  const composerVisible = await composer
    .waitFor({ state: "visible", timeout: 120000 })
    .then(() => true)
    .catch(() => false);
  if (composerVisible) return composer;

  const needsLogin =
    page.url().includes("/auth/login") ||
    (await authForm.isVisible().catch(() => false));

  if (needsLogin) {
    await authForm.waitFor({ state: "visible", timeout: 60000 });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);
    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/main"), { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);
  }

  await composer.waitFor({ state: "visible", timeout: 120000 });
  return composer;
}

async function resetConversation(page) {
  const newChatButton = page.getByRole("button", { name: /^(新建对话|New chat)$/ });
  const visible = await newChatButton.isVisible().catch(() => false);
  if (!visible) return;
  await newChatButton.click();
  await page.waitForURL((url) => url.pathname === "/main/agent" && !url.searchParams.has("conversationId"), {
    timeout: 30000,
  }).catch(() => {});
}

function collectCanvasPayload() {
  const canvasTitle =
    document.querySelector('[data-testid="agent-canvas-title"]')?.textContent?.trim() ?? "";
  const canvas = document.querySelector('[data-testid="agent-artifact-canvas"]');
  const prose =
    canvas?.querySelector(".tiptap.ProseMirror, .ProseMirror") ?? null;
  const html = prose?.innerHTML ?? "";
  const text = prose?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return {
    canvasTitle,
    html,
    text,
    mathNodeCount: canvas?.querySelectorAll("[data-doc-math]").length ?? 0,
    hasBlockquoteTag: html.includes("<blockquote"),
    hasHrTag: html.includes("<hr"),
    hasTableTag: html.includes("<table"),
    hasHeadingTag: /<h[1-6][^>]*>[\s\S]*?基础层[\s\S]*?<\/h[1-6]>/i.test(html),
    containsLiteralBlockquote: />\s*题目[:：]/.test(text),
    containsLiteralHr: /(?:^|\s)---(?:\s|$)/.test(text),
    containsLiteralTable: /\|\s*环节\s*\|\s*时间\s*\|/.test(text),
    containsLiteralHeading: /###\s*基础层/.test(text),
  };
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
  });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  try {
    const composer = await ensureAgentReady(page);
    await resetConversation(page);
    await composer.waitFor({ state: "visible", timeout: 60000 });
    await composer.fill(lessonPrompt);
    await composer.press("Enter");

    const reference = page.locator('[data-testid="agent-artifact-reference"]').last();
    await reference.waitFor({ state: "visible", timeout: 180000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-reference.png"),
      fullPage: true,
    });

    await reference.click();
    const canvas = page.locator('[data-testid="agent-artifact-canvas"]');
    await canvas.waitFor({ state: "visible", timeout: 120000 });
    await page.locator('[data-testid="agent-canvas-title"]').waitFor({
      state: "visible",
      timeout: 120000,
    });
    await page.waitForTimeout(3000);

    const payload = await page.evaluate(collectCanvasPayload);
    await writeJson(path.join(artifactDir, "canvas.json"), payload);

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-canvas.png"),
      fullPage: true,
    });

    assert(payload.canvasTitle.includes(runTag), "Canvas 标题未命中新生成教案");
    assert(payload.hasBlockquoteTag, "Canvas 内未渲染 blockquote");
    assert(payload.hasTableTag, "Canvas 内未渲染 markdown table");
    assert(payload.hasHeadingTag, "Canvas 内未渲染 markdown heading");
    assert(payload.mathNodeCount > 0, "Canvas 内未渲染任何数学节点");
    assert(!payload.containsLiteralBlockquote, "Canvas 仍显示字面量 > 引用");
    assert(!payload.containsLiteralHr, "Canvas 仍显示字面量 ---");
    assert(!payload.containsLiteralTable, "Canvas 仍显示 pipe 表格文本");
    assert(!payload.containsLiteralHeading, "Canvas 仍显示 ### 标题文本");

    const report = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      "- 最终结论: PASS",
      `- runTag: ${runTag}`,
      `- canvasTitle: ${payload.canvasTitle}`,
      `- hasBlockquoteTag: ${payload.hasBlockquoteTag}`,
      `- hasHrTag: ${payload.hasHrTag}`,
      `- hasTableTag: ${payload.hasTableTag}`,
      `- hasHeadingTag: ${payload.hasHeadingTag}`,
      `- mathNodeCount: ${payload.mathNodeCount}`,
      `- containsLiteralBlockquote: ${payload.containsLiteralBlockquote}`,
      `- containsLiteralHr: ${payload.containsLiteralHr}`,
      `- containsLiteralTable: ${payload.containsLiteralTable}`,
      `- containsLiteralHeading: ${payload.containsLiteralHeading}`,
      "- 截图:",
      "  - verify-1-reference.png",
      "  - verify-2-canvas.png",
      "- 产物目录:",
      `  - ${artifactDir}`,
      "",
    ].join("\n");

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await page
      .screenshot({
        path: path.join(artifactDir, "verify-error.png"),
        fullPage: true,
      })
      .catch(() => {});
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      [
        "## UX 验证报告",
        "",
        "- 验证级别: L1",
        "- 最终结论: FAIL",
        `- 失败原因: ${message}`,
        "- 截图:",
        "  - verify-error.png",
        "- 产物目录:",
        `  - ${artifactDir}`,
        "",
      ].join("\n"),
      "utf8",
    );
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
