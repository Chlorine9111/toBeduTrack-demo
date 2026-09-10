import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Request, type Response } from "@playwright/test";

const artifactDir = process.argv[2];

if (!artifactDir) {
  console.error("缺少产物目录参数");
  process.exit(1);
}

const baseUrl = process.env.UX_BASE_URL ?? "http://127.0.0.1:3001";
const loginEmail =
  process.env.UX_LOGIN_EMAIL ?? "teacher.onboarding.1772888667431@example.com";
const loginPassword = process.env.UX_LOGIN_PASSWORD ?? "Teacher123A";
const samplePdfPath =
  process.env.UX_UPLOAD_FILE ??
  "/Users/martin/toBeduTrack-main-verify-20260309/tmp/ux-upload-sample.pdf";
const injectEventName = "deskmate-agent-inject-scan-file";

type NetworkEntry = {
  method: string;
  url: string;
  status: number;
  durationMs: number;
};

type Static404Entry = {
  url: string;
  resourceType: string;
  status: number;
};

type ConsoleErrorEntry = {
  text: string;
  location?: string;
};

type PageErrorEntry = {
  message: string;
};

type PersistConversationPayload = {
  conversation?: {
    id?: string;
    title?: string | null;
  };
  messages?: Array<{
    id?: string;
    role?: string;
    content?: string;
  }>;
};

type PersistedConversationMessage = NonNullable<PersistConversationPayload["messages"]>[number];

type ConversationDetailPayload = {
  messages?: Array<{
    id?: string;
    role?: string;
    content?: string;
  }>;
};

function sanitizeUrl(rawUrl: string) {
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

function isTrackedApi(url: string) {
  return (
    url.includes("/api/account/profile") ||
    url.includes("/api/chat/conversations") ||
    url.includes("/api/pdf/upload-scan") ||
    url.includes("/api/pdf/scan-status/") ||
    url.includes("/api/pdf/process-scan") ||
    url.includes("/api/pdf/save-scan-questions")
  );
}

function isStatic404(response: Response) {
  if (response.status() !== 404) return false;
  const request = response.request();
  const resourceType = request.resourceType();
  if (resourceType === "stylesheet" || resourceType === "script" || resourceType === "font") {
    return true;
  }
  return /\.(css|js|woff2?|ttf|otf)(\?|$)/i.test(request.url());
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function injectFileIntoInput(page: import("@playwright/test").Page, filePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  const base64 = fileBuffer.toString("base64");
  const fileName = path.basename(filePath);

  await page.evaluate(
    ({ eventName, payload }) => {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        }),
      );
    },
    {
      eventName: injectEventName,
      payload: {
        base64,
        fileName,
        mimeType: "application/pdf",
      },
    },
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

  const requestStarts = new WeakMap<Request, number>();
  const networkEntries: NetworkEntry[] = [];
  const consoleErrors: ConsoleErrorEntry[] = [];
  const pageErrors: PageErrorEntry[] = [];
  const static404s: Static404Entry[] = [];

  let processScanStatus: number | null = null;
  let saveScanStatus: number | null = null;
  let persistConversationStatus: number | null = null;
  let persistConversationPayload: PersistConversationPayload | null = null;
  let restoreConversationStatus: number | null = null;
  let restoreConversationPayload: ConversationDetailPayload | null = null;

  page.on("request", (request) => {
    requestStarts.set(request, Date.now());
  });

  page.on("response", (response) => {
    const request = response.request();
    if (isTrackedApi(request.url())) {
      const startedAt = requestStarts.get(request) ?? Date.now();
      networkEntries.push({
        method: request.method(),
        url: sanitizeUrl(request.url()),
        status: response.status(),
        durationMs: Date.now() - startedAt,
      });
    }

    if (isStatic404(response)) {
      static404s.push({
        url: sanitizeUrl(response.url()),
        resourceType: request.resourceType(),
        status: response.status(),
      });
    }

    if (request.method() === "POST" && request.url().includes("/api/pdf/process-scan")) {
      processScanStatus = response.status();
    }

    if (request.method() === "POST" && request.url().includes("/api/pdf/save-scan-questions")) {
      saveScanStatus = response.status();
    }

    if (request.method() === "POST" && /\/api\/chat\/conversations(\?|$)/.test(request.url())) {
      persistConversationStatus = response.status();
      response
        .json()
        .then((payload) => {
          persistConversationPayload = payload as PersistConversationPayload;
        })
        .catch(() => {
          persistConversationPayload = null;
        });
    }

    if (request.method() === "GET" && /\/api\/chat\/conversations\/[0-9a-f-]+(\?|$)/i.test(request.url())) {
      restoreConversationStatus = response.status();
      response
        .json()
        .then((payload) => {
          restoreConversationPayload = payload as ConversationDetailPayload;
        })
        .catch(() => {
          restoreConversationPayload = null;
        });
    }
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    consoleErrors.push({
      text: message.text(),
      location:
        location.url && location.lineNumber != null
          ? `${sanitizeUrl(location.url)}:${location.lineNumber}`
          : undefined,
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({ message: error.message });
  });

  page.on("crash", () => {
    pageErrors.push({ message: "页面崩溃: Playwright page crash" });
  });

  try {
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.locator('form[data-auth-ready="true"]').waitFor({ state: "visible", timeout: 60000 });
    await page.locator("#login-email").fill(loginEmail);
    await page.locator("#login-password").fill(loginPassword);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/main/agent", { timeout: 120000 }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);

    const composer = page.locator('[data-testid="agent-composer"]').first();
    await composer.waitFor({ state: "visible", timeout: 60000 });
    await page.locator('[data-testid="sidebar-nav-agent"]').waitFor({ state: "visible", timeout: 30000 });
    await page.locator('[data-testid="sidebar-recent-conversation"]').first().waitFor({ state: "visible", timeout: 30000 }).catch(() => null);

    await page.screenshot({
      path: path.join(artifactDir, "verify-1-loaded.png"),
    });

    await injectFileIntoInput(page, samplePdfPath);
    await page.waitForFunction(() => {
      const composer = document.querySelector('[data-testid="agent-composer"]') as HTMLTextAreaElement | null;
      return Boolean(composer && composer.value.includes("拆解题目"));
    }, { timeout: 30000 });

    await page.screenshot({
      path: path.join(artifactDir, "verify-2-after-action.png"),
    });

    const composerContainer = composer.locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
    await composerContainer.locator("button").last().click();

    const processSeen = await waitForCondition(() => processScanStatus != null, 120000);
    assert(processSeen, "未捕获到 /api/pdf/process-scan 响应");

    const persistSeen = await waitForCondition(() => persistConversationStatus != null, 120000);
    assert(persistSeen, "未捕获到 /api/chat/conversations POST 响应");

    assert(processScanStatus != null && processScanStatus >= 200 && processScanStatus < 300, `process-scan 返回异常状态: ${processScanStatus}`);
    if (saveScanStatus != null) {
      assert(saveScanStatus >= 200 && saveScanStatus < 300, `save-scan-questions 返回异常状态: ${saveScanStatus}`);
    }
    assert(
      persistConversationStatus != null &&
      persistConversationStatus >= 200 &&
      persistConversationStatus < 300,
      `创建历史记录返回异常状态: ${persistConversationStatus}`,
    );
    const persistedConversation =
      (persistConversationPayload as PersistConversationPayload | null)?.conversation ?? null;
    assert(persistedConversation?.id, "历史记录返回缺少 conversation.id");

    const expectedTitle =
      persistedConversation?.title?.trim() || "拆解题目";
    const expectedTitlePreview =
      expectedTitle
        .split(/\n+/)
        .map((item) => item.trim())
        .find(Boolean)
        ?.slice(0, 10) || "拆解题目";

    const scanResultText = page.locator('[data-testid="scan-result-message-text"]').last();
    await scanResultText.waitFor({ state: "visible", timeout: 120000 });

    await page.waitForFunction(
      (expected) => {
        const button = document.querySelector('[data-testid="sidebar-recent-conversation"]');
        return Boolean(button && button.textContent && button.textContent.includes(expected));
      },
      expectedTitlePreview,
      { timeout: 30000 },
    );

    await page.screenshot({
      path: path.join(artifactDir, "verify-3-result.png"),
    });

    const persistedMessages =
      (persistConversationPayload as PersistConversationPayload | null)?.messages ?? [];
    const persistedAssistantText = persistedMessages
      .filter((item: PersistedConversationMessage) => item.role === "assistant")
      .map((item: PersistedConversationMessage) =>
        item.content?.replace(/\s+/g, " ").trim() ?? "",
      )
      .find(Boolean) ?? "";
    const assistantPreview = persistedAssistantText.slice(0, 24);

    await page.reload({ waitUntil: "domcontentloaded" });
    await composer.waitFor({ state: "visible", timeout: 60000 });

    const restoreSeen = await waitForCondition(
      () => restoreConversationStatus != null || restoreConversationPayload != null,
      30000,
    );
    assert(restoreSeen, "刷新后未触发历史对话恢复请求");
    assert(
      restoreConversationStatus != null &&
      restoreConversationStatus >= 200 &&
      restoreConversationStatus < 300,
      `恢复历史记录返回异常状态: ${restoreConversationStatus}`,
    );

    await page.waitForFunction(
      (expected) => {
        const messages = Array.from(
          document.querySelectorAll('[data-testid="agent-assistant-message"]'),
        );
        return messages.some((item) => item.textContent?.includes(expected));
      },
      assistantPreview,
      { timeout: 30000 },
    );

    const restoredAssistantText =
      (await page.locator('[data-testid="agent-assistant-message"]').last().textContent())
        ?.replace(/\s+/g, " ")
        .trim() ?? "";
    const sidebarRecentText =
      (await page.locator('[data-testid="sidebar-recent-conversation"]').first().textContent())
        ?.replace(/\s+/g, " ")
        .trim() ?? "";

    const trackedGeneration = networkEntries.filter((item) =>
      item.url.includes("/api/pdf/upload-scan") ||
      item.url.includes("/api/pdf/scan-status/") ||
      item.url.includes("/api/pdf/process-scan") ||
      item.url.includes("/api/pdf/save-scan-questions") ||
      item.url.includes("/api/chat/conversations"),
    );

    const failedNetwork = trackedGeneration.filter((item) => item.status < 200 || item.status >= 300);
    const tooSlow = trackedGeneration.filter((item) => item.durationMs > 30000);

    const crossValidation = [
      {
        apiField: "conversation.title",
        expected: expectedTitlePreview,
        domText: sidebarRecentText,
        pass: sidebarRecentText.includes(expectedTitlePreview),
      },
      {
        apiField: "messages[last].content",
        expected: assistantPreview,
        domText: restoredAssistantText,
        pass: Boolean(assistantPreview) && restoredAssistantText.includes(assistantPreview),
      },
    ];

    assert(static404s.length === 0, `存在静态资源 404: ${static404s.map((item) => item.url).join(", ")}`);
    assert(consoleErrors.length === 0, `存在 console error: ${consoleErrors[0]?.text ?? ""}`);
    assert(pageErrors.length === 0, `存在 pageerror: ${pageErrors[0]?.message ?? ""}`);
    assert(failedNetwork.length === 0, `关键接口失败: ${failedNetwork.map((item) => `${item.method} ${item.url} ${item.status}`).join("; ")}`);
    assert(tooSlow.length === 0, `关键生成接口超过 30s: ${tooSlow.map((item) => `${item.url} ${item.durationMs}ms`).join("; ")}`);
    assert(crossValidation.every((item) => item.pass), "数据流交叉验证未全部通过");

    await writeJson(path.join(artifactDir, "network.json"), trackedGeneration);
    await writeJson(
      path.join(artifactDir, "errors.json"),
      {
        static404: static404s,
        consoleErrors,
        pageErrors,
      },
    );

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: PASS
- 关键接口耗时:
${trackedGeneration.map((item) => `  - ${item.method} ${item.url.replace(baseUrl, "")}: ${(item.durationMs / 1000).toFixed(2)}s`).join("\n")}
- 错误统计:
  - 静态资源 404: ${static404s.length}
  - console error: ${consoleErrors.length}
  - pageerror: ${pageErrors.length}
- 数据流交叉验证:
${crossValidation.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.expected}\`: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - ${artifactDir}
`;

    await fs.writeFile(path.join(artifactDir, "report.md"), report, "utf8");
    console.log(report);
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
