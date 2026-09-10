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

const KEY_API_PATHS = ["/api/agent/preflight", "/api/agent/chat"];
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

function extractAssistantText(text: string) {
  return parseNdjsonObjects(text)
    .filter(
      (item) =>
        item.type === "text-delta" &&
        (typeof item.text === "string" || typeof item.delta === "string"),
    )
    .map((item) => String(item.text ?? item.delta))
    .join("")
    .trim();
}

function extractArtifactTitle(markdown: string) {
  const heading =
    markdown
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^#{1,6}\s+/.test(line))
      ?.replace(/^#{1,6}\s+/, "")
      .trim() ?? "";
  if (heading) return heading;

  return (
    markdown
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length >= 8) ?? ""
  );
}

test.describe("Agent Artifact Canvas UX Verification L1", () => {
  test("应通过引用块打开 Canvas 并支持多标签切换", async ({ page }) => {
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
    await page.getByRole("button", { name: "新对话" }).click();
    await expect(page.getByTestId("agent-canvas-empty")).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: path.join(outputDir, "verify-1-loaded.png"),
      fullPage: true,
      caret: "initial",
    });

    const input = page.locator("textarea").first();
    const sendButton = page.getByRole("button", { name: "发送" });
    await expect(input).toBeEditable({ timeout: 20000 });

    const rubricPrompt =
      "请直接生成，不要联网搜索。为 AP Biology Unit 3 写一份精简 Rubric：用 Markdown 一级标题作为标题，再用一个 3 维度 x 3 等级的表格输出，最后只补 1 句使用说明。";
    const rubricResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") && response.request().method() === "POST",
      { timeout: 90000 },
    );

    await input.click();
    await input.fill(rubricPrompt);
    await expect(input).toHaveValue(rubricPrompt, { timeout: 10000 });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    await page.screenshot({
      path: path.join(outputDir, "verify-2-after-action.png"),
      fullPage: true,
      caret: "initial",
    });

    const rubricResponse = await rubricResponsePromise;
    expect(rubricResponse.status()).toBeGreaterThanOrEqual(200);
    expect(rubricResponse.status()).toBeLessThan(300);
    await expect(page.getByText("Agent 正在调用工具并生成答案...")).toBeHidden({ timeout: 90000 });

    const rubricReference = page.getByTestId("agent-artifact-reference").last();
    await expect(rubricReference).toBeVisible({ timeout: 20000 });

    const rubricAssistantText = extractAssistantText(await rubricResponse.text());
    const rubricTitle = extractArtifactTitle(rubricAssistantText);
    expect(rubricTitle.length).toBeGreaterThan(0);

    await rubricReference.click();
    await expect(page.getByTestId("agent-artifact-canvas")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("agent-canvas-title")).toContainText(rubricTitle, { timeout: 15000 });
    await expect(page.getByTestId("agent-canvas-tab")).toHaveCount(1, { timeout: 15000 });

    crossValidation.push({
      apiField: "POST /api/agent/chat text-delta[heading]",
      domText: "右侧 Canvas 标题（第 1 份产物）",
      expected: rubricTitle,
      pass: ((await page.getByTestId("agent-canvas-title").textContent()) ?? "").includes(rubricTitle),
    });

    const secondArtifactPrompt =
      "继续直接生成，不要联网搜索。把上一份 Rubric 改写成中文版课堂展示评分表：使用 Markdown 一级标题作为标题，再用一个 3 维度 x 3 等级表格输出，最后补 1 句课堂使用建议。";
    const secondArtifactResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/agent/chat") && response.request().method() === "POST",
      { timeout: 90000 },
    );

    await input.click();
    await input.fill(secondArtifactPrompt);
    await expect(input).toHaveValue(secondArtifactPrompt, { timeout: 10000 });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    const secondArtifactResponse = await secondArtifactResponsePromise;
    expect(secondArtifactResponse.status()).toBeGreaterThanOrEqual(200);
    expect(secondArtifactResponse.status()).toBeLessThan(300);
    await expect(page.getByText("Agent 正在调用工具并生成答案...")).toBeHidden({ timeout: 90000 });

    const artifactReferences = page.getByTestId("agent-artifact-reference");
    await expect(artifactReferences).toHaveCount(2, { timeout: 20000 });

    const secondArtifactAssistantText = extractAssistantText(await secondArtifactResponse.text());
    const secondArtifactTitle = extractArtifactTitle(secondArtifactAssistantText);
    expect(secondArtifactTitle.length).toBeGreaterThan(0);

    await artifactReferences.last().click();
    await expect(page.getByTestId("agent-canvas-tab")).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByTestId("agent-canvas-title")).toContainText(secondArtifactTitle, { timeout: 15000 });
    await expect(page.getByTestId("agent-artifact-markdown")).toBeVisible({ timeout: 15000 });
    const secondArtifactCanvasTitle = ((await page.getByTestId("agent-canvas-title").textContent()) ?? "").trim();

    await page.getByTestId("agent-canvas-tab").first().click();
    await expect(page.getByTestId("agent-canvas-title")).toContainText(rubricTitle, { timeout: 15000 });

    crossValidation.push({
      apiField: "POST /api/agent/chat text-delta[heading]",
      domText: "右侧 Canvas 标题（第 2 份产物）",
      expected: secondArtifactTitle,
      pass: secondArtifactCanvasTitle.includes(secondArtifactTitle),
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
      keyApiEntries.length >= 4 &&
      keyApiEntries.every((entry) => entry.status >= 200 && entry.status < 300);
    const generationDurationPass =
      keyGenerationEntries.length >= 2 &&
      keyGenerationEntries.every((entry) => entry.durationMs <= 30000);
    const dataFlowPassCount = crossValidation.filter((item) => item.pass).length;
    const dataFlowAllPass =
      crossValidation.length >= 2 && dataFlowPassCount === crossValidation.length;

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
