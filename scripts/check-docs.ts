import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

type DocIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
  fix: string;
};

const ROOT = process.cwd();
const TODAY = new Date();
const FRESHNESS_DAYS = 45;

const REQUIRED_DOCS = [
  "AGENTS.md",
  "docs/product.md",
  "docs/architecture.md",
  "docs/conventions.md",
  "docs/domain-map.md",
  "docs/stack.md",
  "docs/quality.md",
  "docs/error-patterns.md",
  "docs/decisions/template.md",
  "docs/plans/debt.md",
  "docs/plans/templates/light-plan.md",
  "docs/plans/templates/execution-plan.md",
];

const MANAGED_LINK_DOCS = [
  "AGENTS.md",
  "docs/product.md",
  "docs/architecture.md",
  "docs/conventions.md",
  "docs/domain-map.md",
  "docs/stack.md",
  "docs/quality.md",
  "docs/error-patterns.md",
  "docs/plans/debt.md",
];

const PLAN_STATUS = new Set(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"]);

function fileExists(pathRel: string) {
  try {
    return statSync(join(ROOT, pathRel)).isFile() || statSync(join(ROOT, pathRel)).isDirectory();
  } catch {
    return false;
  }
}

function pushIssue(list: DocIssue[], issue: DocIssue) {
  list.push(issue);
}

function parseMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of content.matchAll(regex)) {
    links.push(match[1].trim());
  }
  return links;
}

function resolveLinkTarget(baseFileRel: string, rawTarget: string): string | null {
  const target = rawTarget.split("#")[0]?.trim();
  if (!target) return null;
  if (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:")) {
    return null;
  }
  if (target.startsWith("#")) return null;

  if (target.startsWith("/")) {
    return normalize(target.slice(1)).replaceAll("\\", "/");
  }

  const resolved = normalize(join(dirname(baseFileRel), target)).replaceAll("\\", "/");
  return resolved;
}

type Frontmatter = {
  last_verified?: string;
  owner?: string;
};

function parseFrontmatter(content: string): Frontmatter | null {
  const normalized = content.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return null;
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex < 0) return null;
  const block = normalized.slice(4, endIndex);
  const result: Frontmatter = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (key === "last_verified") result.last_verified = value;
    if (key === "owner") result.owner = value;
  }
  return result;
}

function daysBetween(from: Date, to: Date) {
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function validateRequiredDocs(issues: DocIssue[]) {
  for (const doc of REQUIRED_DOCS) {
    if (!fileExists(doc)) {
      pushIssue(issues, {
        level: "error",
        file: doc,
        message: "必需文档缺失",
        fix: "补齐该文档，或更新 check-docs 的受管列表。",
      });
      continue;
    }

    if (doc === "AGENTS.md") continue;

    const content = readFileSync(join(ROOT, doc), "utf8");
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      pushIssue(issues, {
        level: "error",
        file: doc,
        message: "缺少 frontmatter",
        fix: "在文档顶部添加 `last_verified` 与 `owner`。",
      });
      continue;
    }

    if (!frontmatter.last_verified) {
      pushIssue(issues, {
        level: "error",
        file: doc,
        message: "frontmatter 缺少 last_verified",
        fix: "补充 `last_verified: YYYY-MM-DD`。",
      });
    } else {
      const parsedDate = new Date(frontmatter.last_verified);
      if (Number.isNaN(parsedDate.getTime())) {
        pushIssue(issues, {
          level: "error",
          file: doc,
          message: "last_verified 不是有效日期",
          fix: "使用 ISO 日期格式，例如 2026-03-05。",
        });
      } else {
        const age = daysBetween(parsedDate, TODAY);
        if (age > FRESHNESS_DAYS) {
          pushIssue(issues, {
            level: "warning",
            file: doc,
            message: `文档已过期 ${age} 天（阈值 ${FRESHNESS_DAYS} 天）`,
            fix: "核对文档与代码一致后更新 `last_verified`。",
          });
        }
      }
    }

    if (!frontmatter.owner) {
      pushIssue(issues, {
        level: "error",
        file: doc,
        message: "frontmatter 缺少 owner",
        fix: "补充 `owner: <维护人或团队>`。",
      });
    }
  }
}

function validateLinks(issues: DocIssue[]) {
  for (const doc of MANAGED_LINK_DOCS) {
    if (!fileExists(doc)) continue;

    const content = readFileSync(join(ROOT, doc), "utf8");
    const links = parseMarkdownLinks(content);

    for (const raw of links) {
      const resolved = resolveLinkTarget(doc, raw);
      if (!resolved) continue;
      if (!fileExists(resolved)) {
        pushIssue(issues, {
          level: "error",
          file: doc,
          message: `链接目标不存在: ${raw}`,
          fix: `修复或删除无效链接（解析后路径: ${resolved}）。`,
        });
      }
    }
  }
}

function validateAgentsPointers(issues: DocIssue[]) {
  const file = "AGENTS.md";
  if (!fileExists(file)) return;

  const content = readFileSync(join(ROOT, file), "utf8");
  const links = parseMarkdownLinks(content);

  const docLinks = links
    .map((item) => resolveLinkTarget(file, item))
    .filter((item): item is string => item !== null && item.startsWith("docs/"));

  if (docLinks.length === 0) {
    pushIssue(issues, {
      level: "error",
      file,
      message: "AGENTS.md 未包含 docs/ 指针",
      fix: "在文档索引中添加 docs 路径链接。",
    });
  }

  const hasProductFirst = content.includes("- [docs/product.md]");
  if (!hasProductFirst) {
    pushIssue(issues, {
      level: "error",
      file,
      message: "文档索引缺少 docs/product.md 指针",
      fix: "将 docs/product.md 放在文档索引靠前位置。",
    });
  }

  const hasActivePlanLink = links.some((item) => item.includes("docs/plans/active/"));
  if (!hasActivePlanLink) {
    pushIssue(issues, {
      level: "error",
      file,
      message: "缺少当前活跃计划链接",
      fix: "在 AGENTS.md 增加 docs/plans/active/ 下的具体计划链接。",
    });
  }
}

function validateArchitectureModuleList(issues: DocIssue[]) {
  const file = "docs/architecture.md";
  if (!fileExists(file)) return;

  const content = readFileSync(join(ROOT, file), "utf8");
  const match = content.match(/## 代码实体清单（供 check-docs 校验）([\s\S]*?)(\n##\s|$)/);
  if (!match) {
    pushIssue(issues, {
      level: "error",
      file,
      message: "缺少“代码实体清单（供 check-docs 校验）”段落",
      fix: "在 architecture.md 中补充该段并列出关键目录路径。",
    });
    return;
  }

  const section = match[1];
  const pathMatches = [...section.matchAll(/`([^`]+)`/g)].map((item) => item[1]);
  if (pathMatches.length === 0) {
    pushIssue(issues, {
      level: "error",
      file,
      message: "代码实体清单为空",
      fix: "至少列出 app/api、lib、components、types 等真实路径。",
    });
    return;
  }

  for (const pathRel of pathMatches) {
    if (!fileExists(pathRel)) {
      pushIssue(issues, {
        level: "error",
        file,
        message: `架构文档声明的路径不存在: ${pathRel}`,
        fix: "修正文档路径，或在仓库中创建对应目录。",
      });
    }
  }
}

function listActivePlans(): string[] {
  const activeDir = join(ROOT, "docs", "plans", "active");
  if (!fileExists("docs/plans/active")) return [];
  const entries = readdirSync(activeDir, { withFileTypes: true });
  return entries
    .filter((item) => item.isFile() && item.name.endsWith(".md"))
    .map((item) => `docs/plans/active/${item.name}`)
    .sort();
}

function hasHeading(content: string, heading: string) {
  return new RegExp(`^##\\s+${heading}\\s*$`, "m").test(content);
}

function validatePlanFormat(issues: DocIssue[]) {
  const plans = listActivePlans();

  for (const plan of plans) {
    const content = readFileSync(join(ROOT, plan), "utf8");

    const statusMatch = content.match(/^状态:\s*([A-Z_]+)\s*$/m);
    if (!statusMatch || !PLAN_STATUS.has(statusMatch[1])) {
      pushIssue(issues, {
        level: "error",
        file: plan,
        message: "计划状态字段缺失或不合法",
        fix: "使用 `状态: NOT_STARTED|IN_PROGRESS|BLOCKED|DONE`。",
      });
    }

    const hasChecklist = /- \[[ xX]\]\s+/.test(content);
    if (!hasChecklist) {
      pushIssue(issues, {
        level: "error",
        file: plan,
        message: "计划缺少 checklist 任务项",
        fix: "在“步骤”或“阶段分解”中加入 `- [ ] 任务`。",
      });
    }

    const isExecution = hasHeading(content, "设计概要") || hasHeading(content, "阶段分解");

    if (isExecution) {
      const required = [
        "目标",
        "设计概要",
        "阶段分解",
        "决策日志",
        "已知风险和依赖",
        "完成标准",
      ];
      for (const title of required) {
        if (!hasHeading(content, title)) {
          pushIssue(issues, {
            level: "error",
            file: plan,
            message: `执行计划缺少章节: ${title}`,
            fix: "按 execution-plan 模板补齐章节。",
          });
        }
      }

      if (!/^###\s+Phase\s+\d+:/m.test(content)) {
        pushIssue(issues, {
          level: "error",
          file: plan,
          message: "执行计划缺少 Phase 小节",
          fix: "在“阶段分解”中使用 `### Phase 1: ...` 格式。",
        });
      }
    } else {
      const required = ["目标", "步骤", "完成标准"];
      for (const title of required) {
        if (!hasHeading(content, title)) {
          pushIssue(issues, {
            level: "error",
            file: plan,
            message: `轻量计划缺少章节: ${title}`,
            fix: "按 light-plan 模板补齐章节。",
          });
        }
      }
    }
  }
}

function printIssues(issues: DocIssue[]) {
  const errors = issues.filter((item) => item.level === "error");
  const warnings = issues.filter((item) => item.level === "warning");

  for (const issue of [...errors, ...warnings]) {
    const badge = issue.level === "error" ? "❌" : "⚠️";
    console.error(`${badge} ${issue.file}: ${issue.message}`);
    console.error(`   修复方法: ${issue.fix}`);
  }

  if (warnings.length > 0) {
    console.warn(`\n文档 freshness 警告 ${warnings.length} 条（不阻断）。`);
  }

  if (errors.length > 0) {
    console.error(`\n文档检查失败，共 ${errors.length} 条错误。`);
    process.exit(1);
  }

  console.log("文档检查通过。核心文档结构、链接与计划模板合法。");
}

function main() {
  const issues: DocIssue[] = [];
  validateRequiredDocs(issues);
  validateLinks(issues);
  validateAgentsPointers(issues);
  validateArchitectureModuleList(issues);
  validatePlanFormat(issues);
  printIssues(issues);
}

main();
