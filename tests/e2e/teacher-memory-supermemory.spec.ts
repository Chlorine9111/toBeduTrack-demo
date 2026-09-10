import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type ApiRecord = {
  method: string;
  url: string;
  status: number;
  durationMs: number;
};

type DataFlowCheck = {
  apiField: string;
  apiValue: number;
  domText: string;
  pass: boolean;
};

const KEY_API_PATHS = new Set(["/api/teacher-memory", "/api/wechat-editor/generate"]);
const STATIC_RESOURCE_TYPES = new Set(["stylesheet", "script", "font"]);
const STATE_RECORD_TYPE = "teacher_memory_state";
const EVENT_RECORD_TYPE = "teacher_memory_event";

function timestampForFolder(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${sec}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text: string, max = 220): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

async function searchSupermemory(params: {
  baseUrl: string;
  apiKey: string;
  profileKey: string;
  scope: string;
  containerTag: string;
  recordType: string;
}): Promise<number> {
  const response = await fetch(`${params.baseUrl}/v4/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: params.profileKey,
      containerTag: params.containerTag,
      limit: 10,
      rerank: false,
      filters: {
        AND: [
          { key: "recordType", value: params.recordType, negate: false },
          { key: "profileKey", value: params.profileKey, negate: false },
          { key: "scope", value: params.scope, negate: false },
        ],
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { results?: unknown[] };
  if (!response.ok) {
    throw new Error(`supermemory 查询失败(${response.status})`);
  }
  return Array.isArray(payload.results) ? payload.results.length : 0;
}

async function waitForSupermemoryRecord(params: {
  baseUrl: string;
  apiKey: string;
  profileKey: string;
  scope: string;
  containerTag: string;
  recordType: string;
}): Promise<number> {
  for (let i = 0; i < 12; i++) {
    const count = await searchSupermemory(params);
    if (count > 0) return count;
    await sleep(1500);
  }
  return 0;
}

test.describe("teacher-memory supermemory L1 验证", () => {
  test.setTimeout(180_000);

  test("用户主链路 + supermemory 主存储验证", async ({ page }) => {
    test.skip(!process.env.SUPERMEMORY_API_KEY, "缺少 SUPERMEMORY_API_KEY，无法验证 supermemory 主存储链路");

    const runAt = new Date();
    const reportFolder = timestampForFolder(runAt);
    const outputDir = path.resolve(process.cwd(), "document", "ux-verification", reportFolder);
    await fs.mkdir(outputDir, { recursive: true });

    const scope = "wechat_editor";
    const profileKey = `tm_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const containerPrefix = process.env.SUPERMEMORY_CONTAINER_PREFIX?.trim() || "toBeduTrack_teacher_memory";
    const containerTag = `${containerPrefix}:${scope}:${profileKey}`;
    const supermemoryBaseUrl = process.env.SUPERMEMORY_BASE_URL?.trim() || "https://api.supermemory.ai";
    const supermemoryApiKey = process.env.SUPERMEMORY_API_KEY as string;

    const keyApiRecords: ApiRecord[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const static404: Array<{ url: string; type: string; status: number }> = [];
    const requestStartAt = new Map<object, number>();
    let initMemoryPayload: Record<string, unknown> | null = null;

    page.on("request", (request) => {
      requestStartAt.set(request, Date.now());
    });

    page.on("response", async (response) => {
      const request = response.request();
      const startedAt = requestStartAt.get(request) ?? Date.now();
      const durationMs = Date.now() - startedAt;
      const url = new URL(response.url());
      const pathname = url.pathname;

      if (KEY_API_PATHS.has(pathname)) {
        keyApiRecords.push({
          method: request.method(),
          url: pathname,
          status: response.status(),
          durationMs,
        });
      }

      if (response.status() === 404 && STATIC_RESOURCE_TYPES.has(request.resourceType())) {
        static404.push({
          url: pathname,
          type: request.resourceType(),
          status: response.status(),
        });
      }

      if (pathname === "/api/teacher-memory" && request.method() === "GET" && !initMemoryPayload) {
        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (payload && payload.ok === true) {
          initMemoryPayload = payload;
        }
      }
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(truncate(msg.text()));
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(truncate(error.message));
    });

    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: "teacher_memory_profile_key", value: profileKey }
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const titleInput = page.getByPlaceholder("请输入文章标题");
    const aiTabButton = page.getByRole("button", { name: "AI" });
    const memoryPanelTitle = page.getByText("老师长期记忆");

    await expect(titleInput).toBeVisible({ timeout: 20_000 });
    await expect(aiTabButton).toBeVisible();
    await expect(memoryPanelTitle).toBeVisible();

    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(outputDir, "verify-1-loaded.png"),
      fullPage: true,
    });

    await aiTabButton.click();
    const promptInput = page.getByPlaceholder("输入 AI 指令，例如：帮我生成一篇教研通知，语气亲切，包含报名方式。");
    await expect(promptInput).toBeVisible();
    await promptInput.fill("请生成一段教研活动通知，语气亲切，包含时间地点与报名方式。");

    await page.screenshot({
      path: path.join(outputDir, "verify-2-after-action.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "AI 生成文案" }).click();
    const aiSuccess = page.getByText("AI 已生成初稿");
    await expect(aiSuccess).toBeVisible({ timeout: 30_000 });

    await page.screenshot({
      path: path.join(outputDir, "verify-3-result.png"),
      fullPage: true,
    });
    await page.waitForTimeout(2000);

    const totalSessions = Number(
      (initMemoryPayload as { insights?: { totalSessions?: unknown } } | null)?.insights?.totalSessions
    );
    const dataFlowCheck: DataFlowCheck = {
      apiField: "insights.totalSessions",
      apiValue: Number.isFinite(totalSessions) ? totalSessions : NaN,
      domText: Number.isFinite(totalSessions) ? `累计会话：${totalSessions}` : "累计会话：N/A",
      pass: false,
    };

    if (Number.isFinite(totalSessions)) {
      await expect(page.getByText(dataFlowCheck.domText)).toBeVisible();
      dataFlowCheck.pass = true;
    }

    const stateCount = await waitForSupermemoryRecord({
      baseUrl: supermemoryBaseUrl,
      apiKey: supermemoryApiKey,
      profileKey,
      scope,
      containerTag,
      recordType: STATE_RECORD_TYPE,
    });

    const eventCount = await waitForSupermemoryRecord({
      baseUrl: supermemoryBaseUrl,
      apiKey: supermemoryApiKey,
      profileKey,
      scope,
      containerTag,
      recordType: EVENT_RECORD_TYPE,
    });

    const keyApiSuccessCount = keyApiRecords.filter((item) => item.status >= 200 && item.status < 300).length;
    const keyApiSuccessRate = keyApiRecords.length === 0 ? 0 : keyApiSuccessCount / keyApiRecords.length;
    const generateRecords = keyApiRecords.filter((item) => item.url === "/api/wechat-editor/generate");
    const generateDurations = generateRecords.map((item) => item.durationMs);
    const generateOverLimit = generateDurations.filter((ms) => ms > 30_000);

    const uniqueConsoleErrors = Array.from(new Set(consoleErrors));
    const uniquePageErrors = Array.from(new Set(pageErrors));

    await fs.writeFile(
      path.join(outputDir, "network.json"),
      JSON.stringify(
        {
          keyApiRecords,
          keyApiSuccessRate,
          supermemoryValidation: {
            profileKey,
            containerTag,
            stateCount,
            eventCount,
          },
        },
        null,
        2
      ),
      "utf8"
    );

    await fs.writeFile(
      path.join(outputDir, "errors.json"),
      JSON.stringify(
        {
          consoleErrors: uniqueConsoleErrors,
          pageErrors: uniquePageErrors,
          static404,
        },
        null,
        2
      ),
      "utf8"
    );

    const finalPass =
      static404.length === 0 &&
      uniqueConsoleErrors.length === 0 &&
      uniquePageErrors.length === 0 &&
      keyApiSuccessRate === 1 &&
      generateOverLimit.length === 0 &&
      dataFlowCheck.pass &&
      stateCount > 0 &&
      eventCount > 0;

    const report = `## UX 验证报告

- 验证级别: L1
- 最终结论: ${finalPass ? "PASS" : "FAIL"}
- 关键接口耗时:
  - POST /api/wechat-editor/generate: ${
    generateDurations.length > 0
      ? generateDurations.map((ms) => `${(ms / 1000).toFixed(2)}s`).join(", ")
      : "未捕获"
  }
  - GET /api/teacher-memory: ${
    keyApiRecords
      .filter((item) => item.method === "GET" && item.url === "/api/teacher-memory")
      .map((item) => `${(item.durationMs / 1000).toFixed(2)}s`)
      .join(", ") || "未捕获"
  }
  - POST /api/teacher-memory: ${
    keyApiRecords
      .filter((item) => item.method === "POST" && item.url === "/api/teacher-memory")
      .map((item) => `${(item.durationMs / 1000).toFixed(2)}s`)
      .join(", ") || "未捕获"
  }
- 错误统计:
  - 静态资源 404: ${static404.length}
  - console error: ${uniqueConsoleErrors.length}
  - pageerror: ${uniquePageErrors.length}
- 数据流交叉验证:
  - API 字段 \`${dataFlowCheck.apiField}\` -> DOM 文本 \`${dataFlowCheck.domText}\`: ${
    dataFlowCheck.pass ? "PASS" : "FAIL"
  }
- supermemory 写入验证:
  - containerTag: ${containerTag}
  - state 记录数: ${stateCount}
  - event 记录数: ${eventCount}
- 截图:
  - verify-1-loaded.png
  - verify-2-after-action.png
  - verify-3-result.png
- 产物目录:
  - document/ux-verification/${reportFolder}

### 阈值检查
- 静态资源404=0: ${static404.length === 0 ? "PASS" : "FAIL"}
- console error=0: ${uniqueConsoleErrors.length === 0 ? "PASS" : "FAIL"}
- pageerror=0: ${uniquePageErrors.length === 0 ? "PASS" : "FAIL"}
- 关键API成功率=100%: ${keyApiSuccessRate === 1 ? "PASS" : "FAIL"}
- 关键生成接口<=30s: ${generateOverLimit.length === 0 ? "PASS" : "FAIL"}
- 数据流交叉验证>=1且通过: ${dataFlowCheck.pass ? "PASS" : "FAIL"}
- 截图检查点3/3: PASS
- supermemory state/event 可检索: ${stateCount > 0 && eventCount > 0 ? "PASS" : "FAIL"}
`;

    await fs.writeFile(path.join(outputDir, "report.md"), report, "utf8");

    expect(static404.length, "静态资源存在 404").toBe(0);
    expect(uniqueConsoleErrors.length, `存在 console error: ${uniqueConsoleErrors.join(" | ")}`).toBe(0);
    expect(uniquePageErrors.length, `存在 pageerror: ${uniquePageErrors.join(" | ")}`).toBe(0);
    expect(keyApiRecords.length, "未捕获关键 API 请求").toBeGreaterThan(0);
    expect(keyApiSuccessRate, "关键 API 成功率不是 100%").toBe(1);
    for (const durationMs of generateDurations) {
      expect(durationMs, "关键生成接口耗时超过 30s").toBeLessThanOrEqual(30_000);
    }
    expect(dataFlowCheck.pass, "数据流交叉验证失败").toBeTruthy();
    expect(stateCount, "supermemory state 未写入").toBeGreaterThan(0);
    expect(eventCount, "supermemory event 未写入").toBeGreaterThan(0);
  });
});
