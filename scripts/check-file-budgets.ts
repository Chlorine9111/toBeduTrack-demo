import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

type Budget = {
  file: string;
  maxLines: number;
  reason: string;
};

type DirectoryBudget = {
  dir: string;
  maxLines: number;
};

const NO_GROWTH_BUDGETS: Budget[] = [
  {
    file: "app/api/agent/chat/route.ts",
    maxLines: 369,
    reason: "主聊天路由已切到 dispatcher + 通用 chat 主干，当前只允许继续拆分，不允许回涨。",
  },
  {
    file: "lib/agent/exercise-pipeline.ts",
    maxLines: 297,
    reason: "习题流水线入口已瘦身为编排层，后续只允许继续下沉实现，不允许回涨。",
  },
  {
    file: "lib/agent/exercise-pipeline-types.ts",
    maxLines: 256,
    reason: "习题流水线类型层已抽离，后续只允许稳定维护，不允许重新混回主入口。",
  },
  {
    file: "lib/agent/exercise-pipeline-helpers.ts",
    maxLines: 415,
    reason: "习题流水线 helper 已独立成层，超过当前体积前必须继续按职责拆分。",
  },
  {
    file: "lib/agent/exercise-pipeline-generation.ts",
    maxLines: 452,
    reason: "习题生成主逻辑已独立，后续如继续增长应拆成更小的 generation handler。",
  },
  {
    file: "lib/agent/exercise-pipeline-verification.ts",
    maxLines: 356,
    reason: "习题验证模块已把教师审核评分拆到 review 层，后续不允许重新混回验证主文件。",
  },
  {
    file: "lib/agent/exercise-pipeline-review.ts",
    maxLines: 160,
    reason: "习题教师审核评分已抽到独立 review 层，后续不允许重新混回 verification 主文件。",
  },
  {
    file: "components/main/AgentWorkspacePage.tsx",
    maxLines: 1196,
    reason: "主工作台已继续下沉生命周期与恢复逻辑，当前只允许继续变薄。",
  },
  {
    file: "components/main/agent/use-agent-workspace-stream-state.ts",
    maxLines: 310,
    reason: "主工作台流式状态已下沉到专用 hook，后续如继续增长需拆成更细的 state 边界。",
  },
  {
    file: "components/main/agent/use-agent-workspace-files.ts",
    maxLines: 156,
    reason: "上传与注入文件逻辑已下沉到专用 hook，后续不允许回流回页面本体。",
  },
  {
    file: "components/main/agent/use-agent-workspace-history.ts",
    maxLines: 183,
    reason: "历史恢复与本地消息持久化已下沉到专用 hook，后续如继续增长需再拆分 restore/persist 责任。",
  },
  {
    file: "components/main/agent/use-agent-workspace-lifecycle.ts",
    maxLines: 305,
    reason: "工作台生命周期与入口恢复已下沉到专用 hook，后续如继续增长需拆成 bootstrap / entrypoint 两层。",
  },
  {
    file: "lib/agent/chat-direct-dispatch.ts",
    maxLines: 378,
    reason: "主聊天直连分发器已独立承载 direct workflow 路由，后续不允许重新回流 route 或继续膨胀。",
  },
  {
    file: "components/main/agent/scan-workflow.ts",
    maxLines: 251,
    reason: "扫描工作流客户端已收敛为薄入口，格式化与类型层已抽离，后续不允许再把整形逻辑塞回客户端入口。",
  },
  {
    file: "lib/agent/workflows/worksheet-direct.ts",
    maxLines: 11,
    reason: "组卷直连入口已拆成 temp-pool / question-bank 双模块，薄入口只允许继续维持 re-export，不允许回涨。",
  },
];

const NEW_FILE_DIRECTORY_BUDGETS: DirectoryBudget[] = [
  { dir: "components/main/agent", maxLines: 500 },
  { dir: "lib/agent/workflows", maxLines: 500 },
];

const DIRECTORY_ALLOWLIST = new Set(
  NO_GROWTH_BUDGETS.map((item) => item.file.replaceAll("\\", "/")),
);

function walkFiles(dirAbs: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const full = join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function countLines(fileAbs: string) {
  const content = readFileSync(fileAbs, "utf8");
  if (!content) return 0;
  const lines = content.split(/\r?\n/);
  return content.endsWith("\n") ? lines.length - 1 : lines.length;
}

function formatFailure(file: string, lineCount: number, maxLines: number, reason: string) {
  return `- ${file}: ${lineCount} 行（上限 ${maxLines}）\n  原因：${reason}`;
}

const failures: string[] = [];

for (const budget of NO_GROWTH_BUDGETS) {
  const fileAbs = join(ROOT, budget.file);
  const lineCount = countLines(fileAbs);
  if (lineCount > budget.maxLines) {
    failures.push(
      formatFailure(budget.file, lineCount, budget.maxLines, budget.reason),
    );
  }
}

for (const directoryBudget of NEW_FILE_DIRECTORY_BUDGETS) {
  const dirAbs = join(ROOT, directoryBudget.dir);
  const files = walkFiles(dirAbs);
  for (const fileAbs of files) {
    const file = relative(ROOT, fileAbs).replaceAll("\\", "/");
    if (DIRECTORY_ALLOWLIST.has(file)) continue;
    const lineCount = countLines(fileAbs);
    if (lineCount > directoryBudget.maxLines) {
      failures.push(
        formatFailure(
          file,
          lineCount,
          directoryBudget.maxLines,
          "新拆出的模块默认应保持在 500 行以内；超过后请继续按职责切分。",
        ),
      );
    }
  }
}

if (failures.length > 0) {
  console.error("文件预算检查失败：\n");
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

const checkedFiles = [
  ...NO_GROWTH_BUDGETS.map((item) => item.file),
  ...NEW_FILE_DIRECTORY_BUDGETS.map((item) => `${item.dir}/**/*.{ts,tsx}`),
];

console.log(`文件预算检查通过，共检查 ${checkedFiles.length} 组规则。`);
