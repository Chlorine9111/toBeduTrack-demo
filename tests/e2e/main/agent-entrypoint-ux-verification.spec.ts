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

const KEY_API_PATHS = ["/api/agent/chat"];
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

function parseNdjsonObjects(raw: string) {
  return raw
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

function collectAssistantText(raw: string) {
  return parseNdjsonObjects(raw)
    .filter(
      (item) =>
        item.type === "text-delta" &&
        (typeof item.text === "string" || typeof item.delta === "string"),
    )
    .map((item) => String(item.text ?? item.delta))
    .join("")
    .trim();
}

test.describe("Agent Entrypoint UX Verification L1", () => {
  test("应通过旧工作台入口跳转到 Agent 并自动执行首个任务", async ({ page }) => {
    test.setTimeout(180000);

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

    page.on("response", async (response) => {
      const request = response.request();
      const start = requestStart.get(request) ?? Date.now();
      const durationMs = Math.max(0, Date.now() - start);
      const url = sanitizeUrl(request.url());
      const method = request.method();
      const status = response.status();
      const resourceType = request.resourceType();

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

    const prompt = "请用三条要点说明为什么 AP Calculus AB Unit 6 复习课要强调积分基础，不要联网。";
    const agentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") && response.request().method() === "POST",
      { timeout: 90000 },
    );

    await page.goto(`/main/project?prompt=${encodeURIComponent(prompt)}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: "老师自主 Agent" })).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/main\/agent(?:\?.*)?$/);

    await page.screenshot({
      path: path.join(outputDir, "verify-1-loaded.png"),
      fullPage: true,
      caret: "initial",
    });

    const agentResponse = await agentResponsePromise;
    expect(agentResponse.status()).toBeGreaterThanOrEqual(200);
    expect(agentResponse.status()).toBeLessThan(300);

    await expect(page.getByTestId("agent-user-message").last()).toContainText("积分基础", {
      timeout: 30000,
    });

    await page.screenshot({
      path: path.join(outputDir, "verify-2-after-action.png"),
      fullPage: true,
      caret: "initial",
    });

    await expect(page.getByText("Agent 正在调用工具并生成答案...")).toBeHidden({ timeout: 90000 });
    const assistantMessages = page.getByTestId("agent-assistant-message");
    await expect(assistantMessages.last()).toBeVisible({ timeout: 90000 });

    const assistantDomText = ((await assistantMessages.last().textContent()) ?? "").trim();
    expect(assistantDomText.length).toBeGreaterThan(40);

    const responseText = await agentResponse.text();
    const assistantApiText = collectAssistantText(responseText);
    const responseExcerpt = assistantApiText.slice(0, 32);

    crossValidation.push({
      apiField: "POST /api/agent/chat -> text-delta",
      domText: assistantDomText,
      expected: responseExcerpt || "存在可见的模型回复",
      pass: Boolean(responseExcerpt) && assistantDomText.includes(responseExcerpt),
    });

    await page.screenshot({
      path: path.join(outputDir, "verify-3-result.png"),
      fullPage: true,
      caret: "initial",
    });

    const keyApiEntries = networkEntries.filter((entry) =>
      KEY_API_PATHS.some((pathName) => entry.url.includes(pathName)),
    );
    const keyGenerationEntries = networkEntries.filter(
      (entry) =>
        entry.method === "POST" &&
        KEY_GENERATION_PATHS.some((pathName) => entry.url.includes(pathName)),
    );

    const static404Count = static404.length;
    const consoleErrorCount = consoleErrors.length;
    const pageErrorCount = pageErrors.length;
    const keyApiSuccess =
      keyApiEntries.length > 0 &&
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

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${pass ? "PASS" : "FAIL"}
- 关键接口耗时:
${keyGenerationEntries.map((entry) => `  - ${entry.method} ${entry.url.replace(/^https?:\/\/[^/]+/i, "")}: ${(entry.durationMs / 1000).toFixed(1)}s`).join("\n")}
- 错误统计:
  - 静态资源 404: ${static404Count}
  - console error: ${consoleErrorCount}
  - pageerror: ${pageErrorCount}
- 数据流交叉验证:
${crossValidation.map((item) => `  - API 字段 \`${item.apiField}\` -> DOM 文本 \`${item.expected}\`: ${item.pass ? "PASS" : "FAIL"}`).join("\n")}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - document/ux-verification/${timestamp}/
`;

    await writeFile(path.join(outputDir, "report.md"), report, "utf8");

    expect(pass).toBe(true);
  });
});
