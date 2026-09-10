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

const networkEvents = [];
const consoleErrors = [];
const pageErrors = [];
const static404s = [];
const requestStarts = new WeakMap();
const crossChecks = [];
const interactionChecks = [];

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
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/chat/conversations/")
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripMarkdownDecorators(line) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[>*-]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^\|+|\|+$/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArtifactTitle(markdown) {
  const heading = markdown.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? "";
  const firstMeaningfulLine =
    markdown
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => stripMarkdownDecorators(line))
      .find((line) => line.length >= 8) ?? "";
  const baseTitle = stripMarkdownDecorators(heading) || firstMeaningfulLine;
  if (baseTitle.length <= 52) return baseTitle;
  return `${baseTitle.slice(0, 52).trim()}...`;
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
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
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible" });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForLoadState("networkidle");
    const artifactConversation = await page.evaluate(async () => {
      function normalizeText(text) {
        return text
          .replace(/\r\n?/g, "\n")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      function stripMarkdown(line) {
        return line
          .replace(/^#{1,6}\s*/, "")
          .replace(/^[>*-]\s*/, "")
          .replace(/^\d+[.)]\s*/, "")
          .replace(/^\|+|\|+$/g, "")
          .replace(/\*\*/g, "")
          .replace(/`/g, "")
          .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
          .replace(/\s+/g, " ")
          .trim();
      }

      function countMatches(text, pattern) {
        const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
        const regex = new RegExp(pattern.source, flags);
        return Array.from(text.matchAll(regex)).length;
      }

      function looksLikeLessonPlanArtifact(text) {
        const markers = [
          "教学目标",
          "教学重点",
          "教学难点",
          "课堂导入",
          "新课讲授",
          "课堂活动",
          "板书设计",
          "作业布置",
          "课堂总结",
          "时间分配",
          "学情分析",
          "分层任务",
        ];
        const normalized = normalizeText(text);
        if (!normalized) return false;
        if (/^#{1,6}\s*.*(教案|lesson\s*plan)/im.test(normalized)) return true;
        const markerHits = markers.filter((marker) => normalized.includes(marker)).length;
        const minuteBlocks = normalized.match(/\d+\s*分钟/g)?.length ?? 0;
        return markerHits >= 2 || (markerHits >= 1 && minuteBlocks >= 2);
      }

      function detectArtifactKind(text) {
        const normalized = normalizeText(text);
        if (!normalized || normalized.length < 120) return null;
        if (looksLikeLessonPlanArtifact(normalized)) return "lesson-plan";
        if (
          /(rubric|评分标准|评分量表|评价量表|评价标准|评价维度|评分维度|分级描述)/i.test(normalized) &&
          (/\|.+\|/.test(normalized) || normalized.length >= 220)
        ) {
          return "rubric";
        }
        const questionCount = countMatches(normalized, /(^|\n)(\d+[.)]|第[一二三四五六七八九十\d]+题)/g);
        const optionCount = countMatches(normalized, /(^|\n)\s*[A-DＡ-Ｄ][.)、]/g);
        if (
          /(题目|试题|题单|练习|选择题|简答题|问答题|解析|答案|frq)/i.test(normalized) &&
          (questionCount >= 2 || optionCount >= 2)
        ) {
          return "exercises";
        }
        if (/(来源|出处|参考资料|参考链接|资料摘要|网页深读|http(s)?:\/\/)/i.test(normalized) && normalized.length >= 220) {
          return "research";
        }
        const headingCount = countMatches(normalized, /^#{1,6}\s+.+$/gm);
        if (headingCount >= 3 && normalized.length >= 500) return "notes";
        return null;
      }

      function extractTitle(text) {
        const normalized = normalizeText(text);
        const heading = normalized.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? "";
        const firstMeaningfulLine =
          normalized
            .split("\n")
            .map((line) => stripMarkdown(line))
            .find((line) => line.length >= 8) ?? "";
        const baseTitle = stripMarkdown(heading) || firstMeaningfulLine;
        if (baseTitle.length <= 52) return baseTitle;
        return `${baseTitle.slice(0, 52).trim()}...`;
      }

      const listResponse = await fetch("/api/chat/conversations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const listPayload = await listResponse.json();
      const conversations = Array.isArray(listPayload?.conversations) ? listPayload.conversations : [];

      for (const conversation of conversations.slice(0, 12)) {
        const detailResponse = await fetch(`/api/chat/conversations/${conversation.id}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!detailResponse.ok) continue;
        const detailPayload = await detailResponse.json();
        const messages = Array.isArray(detailPayload?.messages) ? detailPayload.messages : [];
        const artifactMessage = messages.find((message) => {
          return (
            message?.role === "assistant" &&
            typeof message?.content === "string" &&
            detectArtifactKind(message.content)
          );
        });
        if (!artifactMessage) continue;
        return {
          conversationId: conversation.id,
          messageId: artifactMessage.id,
          expectedTitle: extractTitle(artifactMessage.content),
        };
      }

      return null;
    });

    assert(artifactConversation?.conversationId, "未找到包含产物引用块的真实对话");

    await page.goto(`${baseUrl}/main/agent?conversationId=${encodeURIComponent(artifactConversation.conversationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await composer.waitFor({ state: "visible", timeout: 30000 });
    const referenceCard = page.locator('[data-testid="agent-artifact-reference"]').last();
    await referenceCard.waitFor({ state: "visible", timeout: 30000 });

    const initialCanvasVisible = await page
      .locator('[data-testid="agent-artifact-canvas"]')
      .isVisible()
      .catch(() => false);
    interactionChecks.push({
      check: "恢复带产物引用块的对话后，Canvas 默认保持收起",
      pass: initialCanvasVisible === false,
      detail: `canvasVisible=${initialCanvasVisible}`,
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    const referenceTitle = ((await referenceCard.locator("p").first().textContent()) ?? "").trim();
    await referenceCard.click();

    const canvas = page.locator('[data-testid="agent-artifact-canvas"]');
    await canvas.waitFor({ state: "visible", timeout: 15000 });
    const canvasTitle = ((await page.locator('[data-testid="agent-canvas-title"]').textContent()) ?? "").trim();

    const expectedTitle = artifactConversation.expectedTitle ?? "";
    crossChecks.push({
      apiField: "GET /api/chat/conversations/[id] -> artifact title",
      apiValue: expectedTitle,
      domValue: canvasTitle,
      pass: Boolean(expectedTitle) && canvasTitle === expectedTitle,
    });

    interactionChecks.push({
      check: "点击引用块后展开右侧 Canvas",
      pass:
        Boolean(referenceTitle) &&
        Boolean(canvasTitle) &&
        referenceTitle === canvasTitle,
      detail: `referenceTitle=${referenceTitle}; canvasTitle=${canvasTitle}`,
    });

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

    const keyRequests = networkEvents.filter(
      (item) =>
        item.url.includes("/api/account/profile") ||
        item.url.includes("/api/chat/conversations"),
    );

    const pass =
      static404s.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      keyRequests.length > 0 &&
      keyRequests.every((item) => item.status >= 200 && item.status < 300) &&
      keyRequests.every((item) => item.durationMs <= 30000) &&
      crossChecks.length > 0 &&
      crossChecks.every((item) => item.pass) &&
      interactionChecks.every((item) => item.pass);

    const reportLines = [
      "## UX 验证报告",
      "",
      "- 验证级别: L1",
      `- 最终结论: ${pass ? "PASS" : "FAIL"}`,
      "- 验证方式: Playwright 浏览器真实联调（验证 Canvas 按需展开）",
      "- 关键接口耗时:",
      ...keyRequests.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`),
      "- 错误统计:",
      `  - 静态资源 404: ${static404s.length}`,
      `  - console error: ${consoleErrors.length}`,
      `  - pageerror: ${pageErrors.length}`,
      "- 数据流交叉验证:",
      ...crossChecks.map(
        (check) =>
          `  - API 字段 \`${check.apiField}\` -> DOM 文本 \`${check.domValue}\`: ${
            check.pass ? "PASS" : "FAIL"
          }`,
      ),
      "- 交互校验:",
      ...interactionChecks.map(
        (check) =>
          `  - ${check.check}: ${check.pass ? "PASS" : "FAIL"} (${check.detail})`,
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

    if (!pass) {
      throw new Error("UX 验证未通过");
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
