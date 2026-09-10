import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type ImportEntry = {
  source: string;
  isTypeOnly: boolean;
  line: number;
};

type Violation = {
  file: string;
  line: number;
  title: string;
  details: string[];
  fix: string[];
  reference: string;
};

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "app", "api");
const LIB_ROOT = join(ROOT, "lib");

const HTTP_METHOD_EXPORT = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/;
const RAW_PROVIDER_ENDPOINT_RULES = [
  {
    pattern: /https:\/\/openrouter\.ai\/api\/v1(\/chat\/completions)?/,
    label: "OpenRouter",
  },
  {
    pattern: /https:\/\/api\.anthropic\.com/,
    label: "Anthropic",
  },
  {
    pattern: /https:\/\/api\.moonshot\.cn\/v1/,
    label: "Moonshot",
  },
  {
    pattern: /https:\/\/api\.openai\.com\/v1/,
    label: "OpenAI",
  },
] as const;

const AI_VENDOR_IMPORTS = new Set([
  "openai",
  "@anthropic-ai/sdk",
  "@openrouter/ai-sdk-provider",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai-compatible",
  "@ai-sdk/openai",
]);

const AI_VENDOR_ALLOWLIST = new Set([
  "app/api/agent/chat/route.ts",
  "app/api/wechat-editor/generate/route.ts",
]);

const LOW_LEVEL_AI_ADAPTER_IMPORTS = new Set([
  "@/lib/ai/provider-registry",
  "@/lib/ai/openrouter-client",
  "@/lib/ai/anthropic-client",
  "@/lib/ai/anthropic-vision",
  "@/lib/ai/gemini-openrouter",
]);

function walkFiles(dir: string, predicate: (fileName: string) => boolean): string[] {
  const result: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(full, predicate));
      continue;
    }
    if (entry.isFile() && predicate(entry.name)) {
      result.push(full);
    }
  }
  return result;
}

function lineFromIndex(text: string, index: number) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function parseImports(content: string): ImportEntry[] {
  const imports: ImportEntry[] = [];

  const fromImportRegex = /(^|\n)\s*import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["'];?/g;
  for (const match of content.matchAll(fromImportRegex)) {
    const rawIndex = match.index ?? 0;
    const source = match[3];
    const isTypeOnly = Boolean(match[2]);
    imports.push({
      source,
      isTypeOnly,
      line: lineFromIndex(content, rawIndex),
    });
  }

  const sideEffectRegex = /(^|\n)\s*import\s+["']([^"']+)["'];?/g;
  for (const match of content.matchAll(sideEffectRegex)) {
    const rawIndex = match.index ?? 0;
    imports.push({
      source: match[2],
      isTypeOnly: false,
      line: lineFromIndex(content, rawIndex),
    });
  }

  return imports;
}

function pushViolation(target: Violation[], violation: Violation) {
  target.push(violation);
}

function formatViolation(v: Violation) {
  const lines: string[] = [];
  lines.push(`❌ ${v.title}: ${v.file}:${v.line}`);
  lines.push("");
  for (const detail of v.details) {
    lines.push(`   ${detail}`);
  }
  lines.push("");
  lines.push("   修复方法:");
  for (const step of v.fix) {
    lines.push(`   - ${step}`);
  }
  lines.push(`\n   参考: ${v.reference}`);
  return lines.join("\n");
}

function validateRouteFile(fileAbs: string): Violation[] {
  const violations: Violation[] = [];
  const content = readFileSync(fileAbs, "utf8");
  const file = relative(ROOT, fileAbs).replaceAll("\\", "/");
  const imports = parseImports(content);

  if (!HTTP_METHOD_EXPORT.test(content)) {
    pushViolation(violations, {
      file,
      line: 1,
      title: "架构违规: API Route 缺少 HTTP Handler 导出",
      details: ["Route 文件必须导出至少一个 GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD 处理函数。"],
      fix: [
        "在该 route.ts 中补充 `export async function POST(...)` 等标准 handler。",
        "仅将公共逻辑抽到 `lib/*`，handler 保持协议入口职责。",
      ],
      reference: "docs/architecture.md#api-route-layer",
    });
  }

  for (const rule of RAW_PROVIDER_ENDPOINT_RULES) {
    if (!rule.pattern.test(content)) {
      continue;
    }

    pushViolation(violations, {
      file,
      line: lineFromIndex(content, content.search(rule.pattern)),
      title: "架构违规: API Route 内写死第三方模型 endpoint",
      details: [`请不要在 Route 层直接写死 ${rule.label} endpoint。`],
      fix: [
        "改为通过 `lib/ai/gateway.ts`、领域 service 或获批的内部 adapter 发起请求。",
        "统一 requestId、headers、重试、错误码和日志脱敏。",
      ],
      reference: "docs/architecture.md#ai-调用层级",
    });

    break;
  }

  for (const item of imports) {
    if (item.source.startsWith(".")) {
      pushViolation(violations, {
        file,
        line: item.line,
        title: "架构违规: API Route 使用相对路径导入",
        details: [`发现相对导入: ${item.source}`],
        fix: [
          "将相对路径改为 `@/` 别名导入，例如 `@/lib/...`。",
          "避免目录移动后路径失效。",
        ],
        reference: "docs/conventions.md#import-组织",
      });
    }

    if (
      item.source.startsWith("@/components/") ||
      item.source.startsWith("@/hooks/") ||
      item.source.startsWith("@/app/")
    ) {
      pushViolation(violations, {
        file,
        line: item.line,
        title: "架构违规: API Route 依赖了 UI 层",
        details: [`发现 UI 导入: ${item.source}`],
        fix: [
          "将需要的类型/纯函数迁移到 `types/` 或 `lib/<domain>/types.ts`。",
          "Route 只依赖 `lib/*` 与 `types/*`。",
        ],
        reference: "docs/architecture.md#依赖方向允许禁止",
      });
    }

    if (
      (item.source === "@supabase/supabase-js" || item.source === "@supabase/ssr") &&
      !item.isTypeOnly
    ) {
      pushViolation(violations, {
        file,
        line: item.line,
        title: "架构违规: API Route 运行时直接导入 Supabase SDK",
        details: [`发现运行时 SDK 导入: ${item.source}`],
        fix: [
          "改用 `@/lib/supabase/server` 或 `@/lib/supabase/admin` 创建客户端。",
          "如果仅需类型，使用 `import type`。",
        ],
        reference: "docs/architecture.md#data-access-layer",
      });
    }

    if (item.source === "@/lib/supabase/client") {
      pushViolation(violations, {
        file,
        line: item.line,
        title: "架构违规: API Route 引用了浏览器 Supabase Client",
        details: ["`lib/supabase/client` 仅用于客户端组件。"],
        fix: [
          "在 route 中改用 `@/lib/supabase/server` 或 `@/lib/supabase/admin`。",
          "避免服务端错误使用浏览器端会话能力。",
        ],
        reference: "docs/stack.md#后端与数据",
      });
    }

    if (AI_VENDOR_IMPORTS.has(item.source) && !AI_VENDOR_ALLOWLIST.has(file)) {
      pushViolation(violations, {
        file,
        line: item.line,
        title: "架构违规: API Route 直接导入厂商 AI SDK",
        details: [`发现 SDK 导入: ${item.source}`],
        fix: [
          "优先通过 `lib/ai/model-router.ts` 选择模型。",
          "优先通过 `lib/ai/gateway.ts`、高层 adapter 或领域 service 封装调用。",
          "不要在 Route 层直接依赖 provider registry、裸请求 client 或供应商 SDK。",
          "若确需例外，请先在 ADR 记录并更新白名单。",
        ],
        reference: "docs/decisions/0002-model-router-core-aux-tool.md",
      });
    }

    if (LOW_LEVEL_AI_ADAPTER_IMPORTS.has(item.source)) {
      pushViolation(violations, {
        file,
        line: item.line,
        title: "架构违规: API Route 直接依赖底层 AI Adapter",
        details: [`发现底层 AI 适配导入: ${item.source}`],
        fix: [
          "Route 层优先调用 `@/lib/ai/gateway`、对应领域 service，或获批的高层 adapter。",
          "不要在 Route 层直接依赖 provider registry、裸请求 client 或供应商专用 client。",
        ],
        reference: "docs/architecture.md#ai-调用层级",
      });
    }
  }

  if (file.startsWith("app/api/public/")) {
    for (const item of imports) {
      if (
        item.source === "@/lib/api/teacher-context" ||
        item.source === "@/lib/teachers/ensure-teacher"
      ) {
        pushViolation(violations, {
          file,
          line: item.line,
          title: "业务规则违规: 公开路由引入了教师鉴权依赖",
          details: [
            "公开内容接口用于外部访问，不应要求教师会话。",
            `发现导入: ${item.source}`,
          ],
          fix: [
            "将教师私有逻辑迁移到受保护路由（非 `app/api/public/*`）。",
            "公开路由仅返回已发布/可公开的数据。",
          ],
          reference: "docs/product.md#2-lesson-plan-生成与发布",
        });
      }
    }
  }

  return violations;
}

function validateLibFile(fileAbs: string): Violation[] {
  const violations: Violation[] = [];
  const content = readFileSync(fileAbs, "utf8");
  const file = relative(ROOT, fileAbs).replaceAll("\\", "/");
  const imports = parseImports(content);

  for (const item of imports) {
    if (!item.source.startsWith("@/components/")) {
      continue;
    }

    pushViolation(violations, {
      file,
      line: item.line,
      title: "架构违规: lib 层反向依赖 UI 组件或页面类型",
      details: [`发现导入: ${item.source}`],
      fix: [
        "将共享类型提升到 `types/` 或对应 feature 的纯类型层。",
        "将纯函数下沉到 `lib/<domain>` 或 `shared/*`，不要让 lib 反向依赖 UI。",
        "若只是复用页面协议类型，改为由 UI 侧 re-export 共享类型，而不是反向引用 UI 文件。",
      ],
      reference: "docs/architecture.md#依赖方向允许禁止",
    });
  }

  return violations;
}

function main() {
  if (!statSync(API_ROOT).isDirectory()) {
    console.error("未找到 app/api 目录，无法执行架构检查。");
    process.exit(1);
  }
  if (!statSync(LIB_ROOT).isDirectory()) {
    console.error("未找到 lib 目录，无法执行架构检查。");
    process.exit(1);
  }

  const routeFiles = walkFiles(API_ROOT, (fileName) => fileName === "route.ts");
  const libFiles = walkFiles(LIB_ROOT, (fileName) => /\.(ts|tsx)$/.test(fileName));
  const violations = [
    ...routeFiles.flatMap((file) => validateRouteFile(file)),
    ...libFiles.flatMap((file) => validateLibFile(file)),
  ];

  if (violations.length > 0) {
    console.error(`\n发现 ${violations.length} 条架构违规:\n`);
    for (const violation of violations) {
      console.error(formatViolation(violation));
      console.error("\n---\n");
    }
    process.exit(1);
  }

  console.log(
    `架构检查通过，共检查 ${routeFiles.length} 个 route.ts 文件与 ${libFiles.length} 个 lib 模块。`,
  );
}

main();
