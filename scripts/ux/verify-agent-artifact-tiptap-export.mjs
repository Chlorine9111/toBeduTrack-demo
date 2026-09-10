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
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/tiptap/jwt") ||
    url.includes("api.tiptap.dev/v2/convert")
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function normalizeText(value) {
  return `${value ?? ""}`
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
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

async function run() {
  await fs.mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
    acceptDownloads: true,
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
    console.log("[verify] signed in");

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForLoadState("networkidle");

    const artifactConversation = await page.evaluate(async () => {
      function normalizeText(value) {
        return `${value ?? ""}`
          .replace(/\r\n?/g, "\n")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
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
        const expectedTitles = messages
          .filter(
            (message) =>
              message?.role === "assistant" &&
              typeof message?.content === "string" &&
              detectArtifactKind(message.content),
          )
          .map((message) => extractArtifactTitle(message.content));

        if (expectedTitles.length > 0) {
          return {
            conversationId: conversation.id,
            expectedTitles,
          };
        }
      }

      return null;
    });

    assert(artifactConversation?.conversationId, "未找到包含文档型产物的真实对话");
    console.log(`[verify] conversation=${artifactConversation.conversationId}`);

    await page.goto(
      `${baseUrl}/main/agent?conversationId=${encodeURIComponent(artifactConversation.conversationId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await composer.waitFor({ state: "visible", timeout: 30000 });
    const referenceCards = page.locator('[data-testid="agent-artifact-reference"]');
    await referenceCards.first().waitFor({ state: "visible", timeout: 30000 });
    console.log("[verify] references visible");

    let selectedTitle = "";
    let selectedIndex = -1;
    const totalCards = await referenceCards.count();
    for (let index = totalCards - 1; index >= 0; index -= 1) {
      const card = referenceCards.nth(index);
      selectedTitle = normalizeText(await card.locator("p").first().textContent());
      await card.click();
      console.log(`[verify] clicked reference ${index}: ${selectedTitle}`);
      const canvas = page.locator('[data-testid="agent-artifact-canvas"]');
      await canvas.waitFor({ state: "visible", timeout: 15000 });
      const hasEditor = await page.locator(".ProseMirror").first().isVisible().catch(() => false);
      const hasActionExport = await page
        .locator('[data-testid="agent-artifact-export-pdf"]')
        .first()
        .isVisible()
        .catch(() => false);

      if (hasEditor && hasActionExport) {
        selectedIndex = index;
        console.log("[verify] found tiptap artifact");
        break;
      }
    }

    assert(selectedIndex >= 0, "未找到使用 TipTap 编辑器展示的 artifact");

    const canvasTitle = normalizeText(await page.locator('[data-testid="agent-canvas-title"]').textContent());
    crossChecks.push({
      apiField: "GET /api/chat/conversations/[id] -> assistant artifact titles",
      apiValue: artifactConversation.expectedTitles.join(" | "),
      domValue: canvasTitle,
      pass: artifactConversation.expectedTitles.includes(canvasTitle),
    });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
      fullPage: true,
    });
    console.log("[verify] screenshot 2");

    await page.evaluate(() => {
      const browserWindow = window;
      if (!("__codexPdfExportLog" in browserWindow)) {
        Object.defineProperty(browserWindow, "__codexPdfExportLog", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: [],
        });
      } else {
        browserWindow.__codexPdfExportLog = [];
      }

      if (browserWindow.__codexPdfExportPatched) {
        return;
      }

      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function patchedCreateObjectURL(blob) {
        const url = originalCreateObjectURL(blob);
        browserWindow.__codexPdfExportLog.push({
          type: "blob-url",
          url,
          mimeType: blob instanceof Blob ? blob.type : null,
          size: blob instanceof Blob ? blob.size : null,
          ts: Date.now(),
        });
        return url;
      };

      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function patchedAnchorClick(...args) {
        browserWindow.__codexPdfExportLog.push({
          type: "anchor-click",
          href: this.href,
          download: this.download || null,
          ts: Date.now(),
        });
        return originalAnchorClick.apply(this, args);
      };

      browserWindow.__codexPdfExportPatched = true;
    });

    const editorExportButton = page.locator('[data-testid="tiptap-editor-export-pdf"]').first();
    await editorExportButton.waitFor({ state: "visible", timeout: 15000 });

    const actionExportButton = page.locator('[data-testid="agent-artifact-export-pdf"]').first();
    await actionExportButton.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="agent-artifact-export-pdf"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      { timeout: 20000 },
    );

    const [convertResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/doc/export-pdf") &&
          response.status() >= 200 &&
          response.status() < 400 &&
          `${response.headers()["content-type"] ?? ""}`.includes("application/pdf"),
        { timeout: 60000 },
      ),
      actionExportButton.click(),
    ]);
    console.log(`[verify] convert response ${convertResponse.status()}`);

    await page.waitForFunction(
      () =>
        Array.isArray(window.__codexPdfExportLog) &&
        window.__codexPdfExportLog.some(
          (entry) =>
            entry &&
            entry.type === "anchor-click" &&
            typeof entry.download === "string" &&
            entry.download.length > 0,
        ),
      { timeout: 15000 },
    );

    const exportLog = await page.evaluate(() => window.__codexPdfExportLog);
    const downloadEntry = exportLog.find((entry) => entry?.type === "anchor-click") ?? null;
    const suggestedFilename = downloadEntry?.download ?? "";

    crossChecks.push({
      apiField: "POST /api/doc/export-pdf -> file download",
      apiValue: `${convertResponse.status()} ${sanitizeUrl(convertResponse.url())}`,
      domValue: suggestedFilename,
      pass: /\.pdf$/i.test(suggestedFilename),
    });

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
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const keyRequests = networkEvents.filter((item) => isTrackedApi(item.url));
  const criticalDurations = keyRequests.map(
    (item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${item.durationMs}ms`,
  );
  const allChecksPassed = crossChecks.every((item) => item.pass);
  const finalResult =
    static404s.length === 0 &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    allChecksPassed &&
    keyRequests.length > 0 &&
    keyRequests.every((item) => item.status >= 200 && item.status < 400) &&
    keyRequests.every((item) => item.durationMs <= 30000)
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
