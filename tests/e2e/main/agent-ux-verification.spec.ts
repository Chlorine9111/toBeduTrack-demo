import { expect, test, type Request } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type NetworkEntry = {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  resourceType: string;
};

type ConsoleErrorEntry = {
  text: string;
  location?: string;
};

type PageErrorEntry = {
  message: string;
};

type Static404Entry = {
  url: string;
  resourceType: string;
  status: number;
};

type CrossValidationEntry = {
  apiField: string;
  domText: string;
  expected: string;
  pass: boolean;
};

type ConversationRestoreResponse = {
  conversation?: { id?: string };
  messages?: Array<{ role?: string; content?: string }>;
};

const KEY_API_PATHS = ["/api/agent/chat", "/api/chat/conversations/"];
const KEY_GENERATION_PATHS = ["/api/agent/chat"];

function createTimestamp() {
  const now = new Date();
  const yyyy = `${now.getFullYear()}`;
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const dd = `${now.getDate()}`.padStart(2, "0");
  const hh = `${now.getHours()}`.padStart(2, "0");
  const min = `${now.getMinutes()}`.padStart(2, "0");
  const ss = `${now.getSeconds()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function sanitizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split("?")[0] ?? raw;
  }
}

function isStaticResource(resourceType: string) {
  return resourceType === "stylesheet" || resourceType === "script" || resourceType === "font";
}

function isKeyApi(url: string) {
  return KEY_API_PATHS.some((pathName) => url.includes(pathName));
}

function isKeyGenerationApi(method: string, url: string) {
  return method === "POST" && KEY_GENERATION_PATHS.some((pathName) => url.includes(pathName));
}

function parseNdjsonObjects(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

test.describe("Agent UX Verification L1", () => {
  test("应通过自主 Agent 长对话上下文验收并产出证据", async ({ page }) => {
    test.setTimeout(240000);

    const timestamp = createTimestamp();
    const outputDir = path.join(process.cwd(), "document", "ux-verification", timestamp);
    await mkdir(outputDir, { recursive: true });

    const networkEntries: NetworkEntry[] = [];
    const consoleErrors: ConsoleErrorEntry[] = [];
    const pageErrors: PageErrorEntry[] = [];
    const static404: Static404Entry[] = [];
    const crossValidation: CrossValidationEntry[] = [];

    const requestStart = new Map<Request, number>();
    page.on("request", (request) => {
      requestStart.set(request, Date.now());
    });

    page.on("response", (response) => {
      const request = response.request();
      const url = sanitizeUrl(request.url());
      const method = request.method();
      const status = response.status();
      const resourceType = request.resourceType();

      void response.finished().catch(() => null).then(() => {
        const start = requestStart.get(request) ?? Date.now();
        const durationMs = Math.max(0, Date.now() - start);

        if (url.includes("/api/")) {
          networkEntries.push({
            method,
            url,
            status,
            durationMs,
            resourceType,
          });
        }

        if (status === 404 && isStaticResource(resourceType)) {
          static404.push({ url, resourceType, status });
        }
      });
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
      pageErrors.push({ message: String(error) });
    });

    await page.goto("/main/agent", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "老师自主 Agent" })).toBeVisible({ timeout: 20000 });

    await page.screenshot({
      path: path.join(outputDir, "verify-1-loaded.png"),
      fullPage: true,
      caret: "initial",
    });

    const firstAgentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") && response.request().method() === "POST",
      { timeout: 90000 },
    );

    const input = page.locator("textarea").first();
    const sendButton = page.getByRole("button", { name: "发送" });
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.click();
    await input.fill("请记住我们现在讨论的是 AP Calculus AB Unit 6 复习课。先用三段式给我 3 个复习重点，每段 1 句。");
    await expect(input).toHaveValue(/Unit 6 复习课/);
    await expect(sendButton).toBeEnabled({ timeout: 10000 });
    await sendButton.click();

    await page.screenshot({
      path: path.join(outputDir, "verify-2-after-action.png"),
      fullPage: true,
      caret: "initial",
    });

    const firstAgentResponse = await firstAgentResponsePromise;
    expect(firstAgentResponse.status()).toBeGreaterThanOrEqual(200);
    expect(firstAgentResponse.status()).toBeLessThan(300);

    await expect(page.getByText("Agent 正在调用工具并生成答案...")).toBeHidden({ timeout: 90000 });

    const assistantMessages = page.getByTestId("agent-assistant-message");
    await expect(assistantMessages).toHaveCount(2, { timeout: 90000 });
    await expect(assistantMessages.last()).toContainText("复习", { timeout: 15000 });

    const secondAgentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") && response.request().method() === "POST",
      { timeout: 90000 },
    );

    await input.click();
    await input.fill("把第二段改成 15 分钟小组活动，并保持总结构仍然是三段式。");
    await expect(input).toHaveValue(/15 分钟小组活动/);
    await expect(sendButton).toBeEnabled({ timeout: 10000 });
    await sendButton.click();

    const secondAgentResponse = await secondAgentResponsePromise;
    expect(secondAgentResponse.status()).toBeGreaterThanOrEqual(200);
    expect(secondAgentResponse.status()).toBeLessThan(300);

    await expect(page.getByText("Agent 正在调用工具并生成答案...")).toBeHidden({ timeout: 90000 });

    await expect(assistantMessages).toHaveCount(3, { timeout: 90000 });
    const lastAssistantText = ((await assistantMessages.last().textContent()) ?? "").trim();
    expect(lastAssistantText.length).toBeGreaterThan(80);
    expect(lastAssistantText).toContain("15");
    expect(lastAssistantText).toMatch(/小组|合作/);

    const responseObjects = parseNdjsonObjects(await secondAgentResponse.text());
    const metaEvent = responseObjects.find((item) => item.type === "meta");
    const conversationId =
      typeof metaEvent?.conversationId === "string" ? metaEvent.conversationId : "";
    expect(conversationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const restoreResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/chat/conversations/${conversationId}`) &&
        response.request().method() === "GET",
      { timeout: 30000 },
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "老师自主 Agent" })).toBeVisible({ timeout: 15000 });
    const restoreResponse = await restoreResponsePromise;
    expect(restoreResponse.status()).toBe(200);

    const restoredJson = (await restoreResponse.json()) as ConversationRestoreResponse;
    const restoredMessages = restoredJson.messages ?? [];
    const restoredLastAssistant =
      restoredMessages
        .slice()
        .reverse()
        .find((item) => item.role === "assistant" && typeof item.content === "string")?.content ?? "";
    const restoredExcerpt = restoredLastAssistant.trim().slice(0, 40);

    if (restoredExcerpt) {
      await expect(page.getByText(restoredExcerpt, { exact: false })).toBeVisible({ timeout: 15000 });
    }

    await expect(page.getByText("长期记忆")).toBeVisible({ timeout: 15000 });

    crossValidation.push({
      apiField: "GET /api/chat/conversations/:id messages[last].content",
      domText: "刷新后最后一条 assistant 消息",
      expected: restoredExcerpt || "存在可恢复的 assistant 内容",
      pass: Boolean(restoredExcerpt) && lastAssistantText.includes("15") && /小组|合作/.test(lastAssistantText),
    });

    await page.screenshot({
      path: path.join(outputDir, "verify-3-result.png"),
      fullPage: true,
      caret: "initial",
    });

    const keyApiEntries = networkEntries.filter((entry) => isKeyApi(entry.url));
    const keyGenerationEntries = networkEntries.filter((entry) =>
      isKeyGenerationApi(entry.method, entry.url),
    );

    const static404Count = static404.length;
    const consoleErrorCount = consoleErrors.length;
    const pageErrorCount = pageErrors.length;
    const keyApiSuccess =
      keyApiEntries.length >= 3 &&
      keyApiEntries.every((entry) => entry.status >= 200 && entry.status < 300);
    const generationDurationPass =
      keyGenerationEntries.length > 0 &&
      keyGenerationEntries.every((entry) => entry.durationMs <= 30000);
    const dataFlowPassCount = crossValidation.filter((item) => item.pass).length;
    const dataFlowAllPass =
      crossValidation.length >= 1 && dataFlowPassCount === crossValidation.length;

    const pass =
      static404Count === 0 &&
      consoleErrorCount === 0 &&
      pageErrorCount === 0 &&
      keyApiSuccess &&
      generationDurationPass &&
      dataFlowAllPass;

    await writeFile(
      path.join(outputDir, "network.json"),
      JSON.stringify(
        {
          keyRequests: keyApiEntries,
          allApiRequests: networkEntries,
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(
      path.join(outputDir, "errors.json"),
      JSON.stringify(
        {
          static404,
          consoleErrors,
          pageErrors,
          counts: {
            static404: static404Count,
            consoleErrors: consoleErrorCount,
            pageErrors: pageErrorCount,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const durationLines =
      keyGenerationEntries.length > 0
        ? keyGenerationEntries
            .map((entry) => `  - ${entry.method} ${entry.url}: ${(entry.durationMs / 1000).toFixed(2)}s`)
            .join("\n")
        : "  - 无关键生成接口记录";

    const crossValidationLines = crossValidation
      .map(
        (item) =>
          `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.domText}\`（期望：${item.expected}）: ${item.pass ? "PASS" : "FAIL"}`,
      )
      .join("\n");

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 关键接口耗时:
${durationLines}
- 错误统计:
  - 静态资源 404: ${static404Count}
  - console error: ${consoleErrorCount}
  - pageerror: ${pageErrorCount}
- 数据流交叉验证:
${crossValidationLines}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - document/ux-verification/${timestamp}/
`;

    await writeFile(path.join(outputDir, "report.md"), report, "utf8");

    expect(pass, `UX 验证未通过，详情见 ${path.join(outputDir, "report.md")}`).toBe(true);
  });
});
