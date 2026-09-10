# AI 面板「选择导入」改造计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 推荐面板从「替换覆盖」模式改为「勾选 + 批量导入到编辑台末尾」模式，AI 的角色变为帮老师找题 + 排序题目。

**Architecture:** 在 AiSearchPanel 中为每个搜索结果增加 checkbox 选择状态；移除「替换当前题」按钮，保留/改造为「导入选中题」批量操作；选中的题目追加到编辑台最下方（不覆盖）。同时保留 AI 搜索的核心逻辑不变，QuestionCard 中的「换一题」按钮改为打开 AI 面板但不自动替换。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Next.js 15.3

---

## 文件变更地图

| 文件 | 操作 | 职责 |
|------|------|------|
| `components/main/question-bank/split-editor/AiSearchPanel.tsx` | 修改 | 增加 checkbox 选择、批量导入按钮、选中计数 |
| `components/main/question-bank/split/QuestionBankSplitWorkspacePage.tsx` | 修改 | 管理选中状态、批量导入逻辑、移除替换逻辑 |
| `components/main/question-bank/split-editor/QuestionCard.tsx` | 微调 | 「换一题」→「AI 找题」，语义变更 |

---

### Task 1: AiSearchPanel 增加多选能力

**Files:**
- Modify: `components/main/question-bank/split-editor/AiSearchPanel.tsx`

**设计说明：** AiSearchPanel 本身是纯展示组件，选中状态由父组件管理通过 props 传入。每个结果卡片左上角增加 checkbox，底部移除「替换当前题」按钮，改为固定在面板底部的「导入 N 道选中题」按钮。

- [ ] **Step 1: 修改 AiSearchPanel 的 props 接口**

在 `AiSearchPanel.tsx` 的 props 中：
- 移除 `onReplaceResult` 和 `activeQuestion`
- 新增 `selectedIds: Set<string>`（当前选中的结果 ID 集合）
- 新增 `onToggleSelect: (id: string) => void`（切换某个结果的选中状态）
- 新增 `onImportSelected: () => void`（导入所有选中的题目）

```typescript
export default function AiSearchPanel({
  query,
  loading,
  errorText,
  statusText,
  results,
  selectedIds,
  onQueryChange,
  onSearch,
  onToggleSelect,
  onImportSelected,
}: {
  query: string;
  loading: boolean;
  errorText: string;
  statusText: string;
  results: QuestionBankAiSearchResult[];
  selectedIds: Set<string>;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onToggleSelect: (id: string) => void;
  onImportSelected: () => void;
}) {
```

- [ ] **Step 2: 移除「当前参考题」区块**

删除 `AiSearchPanel.tsx` 顶部的「当前参考题」展示区块（第 41-48 行的 `<div className="rounded-xl border...">` 部分），因为 AI 不再需要参考某道题来替换，而是独立搜索。

- [ ] **Step 3: 为每个结果卡片增加 checkbox**

在每个 `<article>` 结果卡片内部，在标签行（第 94 行 `<div className="flex flex-wrap gap-2 text-xs">` ）之前插入 checkbox：

```tsx
<article
  key={item.id}
  className={cn(
    "rounded-xl border p-4 transition-colors cursor-pointer",
    selectedIds.has(item.id)
      ? "border-[#2563eb]/40 bg-blue-50/50"
      : "border-[rgba(55,53,47,0.08)] bg-[#fafaf8]",
  )}
  onClick={() => onToggleSelect(item.id)}
>
  <div className="flex items-start gap-3">
    <div
      className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
        selectedIds.has(item.id)
          ? "border-[#2563eb] bg-[#2563eb]"
          : "border-[rgba(55,53,47,0.2)] bg-white",
      )}
    >
      {selectedIds.has(item.id) ? (
        <Check className="h-3.5 w-3.5 text-white" />
      ) : null}
    </div>
    <div className="min-w-0 flex-1">
      {/* 原有的标签行、题目内容、知识点标签 */}
    </div>
  </div>
</article>
```

需要在文件顶部 import 中增加 `Check`：
```typescript
import { Check, Loader2, Search, Wand2 } from "lucide-react";
```

- [ ] **Step 4: 移除每个结果卡片底部的「替换当前题」和「追加到试卷」按钮**

删除每个 `<article>` 内的整个 `<div className="mt-4 grid gap-2">` 区块（原第 134-157 行），即移除「替换当前题」和「追加到试卷」两个按钮。选择交互已经通过 checkbox + 点击卡片完成。

- [ ] **Step 5: 在面板底部增加固定的「导入选中题」操作栏**

在 `<aside>` 的最底部（滚动区域之后），增加一个固定的操作栏：

```tsx
{selectedIds.size > 0 ? (
  <div className="shrink-0 border-t border-[rgba(55,53,47,0.08)] bg-white px-4 py-3">
    <button
      type="button"
      onClick={onImportSelected}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1d4ed8]"
    >
      <Plus className="h-4 w-4" />
      导入 {selectedIds.size} 道选中题到编辑台
    </button>
  </div>
) : null}
```

需要在 import 中增加 `Plus`（已有）。

- [ ] **Step 6: 完整的 AiSearchPanel 组件代码**

最终的 `AiSearchPanel.tsx` 完整结构：

```tsx
"use client";

import { Check, Loader2, Plus, Search, Wand2 } from "lucide-react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import { cn } from "@/lib/utils";
import type { QuestionBankAiSearchResult } from "@/components/main/question-bank/split-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/split-editor/utils";

export default function AiSearchPanel({
  query,
  loading,
  errorText,
  statusText,
  results,
  selectedIds,
  onQueryChange,
  onSearch,
  onToggleSelect,
  onImportSelected,
}: {
  query: string;
  loading: boolean;
  errorText: string;
  statusText: string;
  results: QuestionBankAiSearchResult[];
  selectedIds: Set<string>;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onToggleSelect: (id: string) => void;
  onImportSelected: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="space-y-3 border-b border-[rgba(55,53,47,0.08)] px-4 py-4">
        <label className="flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-3 py-3">
          <Search className="h-4 w-4 text-[#8c7e68]" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="输入条件，检索相关题目"
            className="w-full bg-transparent text-sm text-[#37352F] outline-none placeholder:text-[#8c7e68]"
          />
        </label>

        <button
          type="button"
          onClick={onSearch}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          AI 检索
        </button>

        {statusText ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {statusText}
          </div>
        ) : null}
        {errorText ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorText}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgba(55,53,47,0.12)] bg-[#fafaf8] px-4 py-10 text-center text-sm text-[#37352F]/45">
              还没有检索结果。
            </div>
          ) : (
            results.map((item) => (
              <article
                key={item.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors cursor-pointer",
                  selectedIds.has(item.id)
                    ? "border-[#2563eb]/40 bg-blue-50/50"
                    : "border-[rgba(55,53,47,0.08)] bg-[#fafaf8] hover:border-[rgba(55,53,47,0.16)]",
                )}
                onClick={() => onToggleSelect(item.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                      selectedIds.has(item.id)
                        ? "border-[#2563eb] bg-[#2563eb]"
                        : "border-[rgba(55,53,47,0.2)] bg-white",
                    )}
                  >
                    {selectedIds.has(item.id) ? (
                      <Check className="h-3.5 w-3.5 text-white" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                        {item.subject || "未标注 AP 课程"}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                        {getQuestionTypeLabel(item.exerciseType)}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                        {getDifficultyLabel(item.difficulty)}
                      </span>
                      {item.gradeLevel ? (
                        <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                          {item.gradeLevel}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3">
                      <QuestionContentWithImages
                        content={item.questionText}
                        textClassName="text-sm leading-7 font-medium text-[#37352F]"
                        galleryClassName="mt-2 grid gap-2"
                        figureClassName="bg-white"
                        imageClassName="max-h-[180px] w-full object-scale-down"
                      />
                    </div>

                    {item.knowledgePoints && item.knowledgePoints.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.knowledgePoints.slice(0, 4).map((point) => (
                          <span
                            key={`${item.id}-${point}`}
                            className="rounded-full border border-[rgba(55,53,47,0.08)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/60"
                          >
                            {point}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="shrink-0 border-t border-[rgba(55,53,47,0.08)] bg-white px-4 py-3">
          <button
            type="button"
            onClick={onImportSelected}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1d4ed8]"
          >
            <Plus className="h-4 w-4" />
            导入 {selectedIds.size} 道选中题到编辑台
          </button>
        </div>
      ) : null}
    </aside>
  );
}
```

---

### Task 2: 父组件状态管理 — 选中状态 + 批量导入

**Files:**
- Modify: `components/main/question-bank/split/QuestionBankSplitWorkspacePage.tsx`

**设计说明：** 在父组件中管理 `aiSelectedIds: Set<string>` 状态，新增 `handleToggleAiSelect` 和 `handleImportSelected` 函数。移除 `handleReplaceWithResult`，保留 `handleAppendResult` 内部逻辑作为批量导入的基础。

- [ ] **Step 1: 新增 aiSelectedIds 状态**

在 `QuestionBankSplitWorkspacePage.tsx` 的 state 声明区域（约第 78-82 行），在 `aiPanelOpen` 之后新增：

```typescript
const [aiSelectedIds, setAiSelectedIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: 新增 handleToggleAiSelect 函数**

在 `handleAppendResult` 函数附近新增：

```typescript
function handleToggleAiSelect(id: string) {
  setAiSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
}
```

- [ ] **Step 3: 新增 handleImportSelected 函数替代旧的 handleReplaceWithResult**

删除整个 `handleReplaceWithResult` 函数（约第 749-764 行）。

新增 `handleImportSelected` 函数，基于 `handleAppendResult` 的逻辑，但改为批量追加到末尾：

```typescript
function handleImportSelected() {
  if (!activeDocument) return;
  if (aiSelectedIds.size === 0) return;

  const selectedItems = aiResults.filter((item) => aiSelectedIds.has(item.id));
  if (selectedItems.length === 0) return;

  const newQuestions = selectedItems.map(mapAiResultToSplitQuestion);

  updateDocument(activeDocument.id, (current) => {
    const nextQuestions = [...current.questions, ...newQuestions];
    return {
      ...current,
      questions: nextQuestions,
      questionCount: nextQuestions.length,
      activeQuestionId: newQuestions[0]?.id ?? current.activeQuestionId,
    };
  });

  setAiSelectedIds(new Set());
  setStatusText(
    isZh
      ? `已导入 ${newQuestions.length} 道 AI 推荐题到试卷末尾。`
      : `Imported ${newQuestions.length} AI-recommended questions to the end of the paper.`,
  );
}
```

- [ ] **Step 4: 删除 handleAppendResult 函数**

删除整个 `handleAppendResult` 函数（约第 766-786 行），因为追加逻辑已合并到 `handleImportSelected` 中。

- [ ] **Step 5: 修改 handleReplaceRequest — AI 面板打开逻辑简化**

将 `handleReplaceRequest` 改为只打开 AI 面板并预填搜索条件，不再需要设置 activeQuestion：

```typescript
function handleReplaceRequest(questionId: string) {
  if (!activeDocument) return;
  const question = activeDocument.questions.find((item) => item.id === questionId);
  if (!question) return;

  setAiPanelOpen(true);
  const nextInstruction = buildReplaceInstruction(question);
  setAiQuery(nextInstruction);
  setAiSelectedIds(new Set());
  void runAiSearch(nextInstruction);
}
```

注意：移除了 `handleSetActiveQuestion(questionId)` 调用，因为替换逻辑已不存在，打开面板不需要关联某道题。

- [ ] **Step 6: runAiSearch 简化 — 移除参考题依赖**

修改 `runAiSearch` 函数（约第 679-735 行），移除对 `activeQuestion` 的依赖。AI 搜索现在只基于用户输入的查询文本和课程/单元筛选：

```typescript
async function runAiSearch(instructionOverride?: string) {
  if (!activeDocument) return;

  const queryText = sanitizeText(instructionOverride || aiQuery);

  if (!queryText.trim()) {
    setAiErrorText(isZh ? "请先输入检索条件。" : "Please enter search criteria.");
    return;
  }

  setAiLoading(true);
  setAiErrorText("");
  setAiStatusText("");
  setAiSelectedIds(new Set());

  try {
    const activeCourse =
      courses.find((course) => course.id === activeDocument.courseId) ?? null;
    const activeUnit =
      units.find((unit) => unit.id === activeDocument.unitId) ?? null;
    const response = await apiPost<TikuSearchResponse>(
      "/api/tiku/search",
      {
        query: queryText,
        course: activeCourse?.code ?? "",
        unit: activeUnit?.unit_number ?? null,
        limit: 10,
        mode: "auto",
      },
    );
    const mappedItems = response.data.map(mapTikuRowToAiResult);
    setAiResults(mappedItems);
    setAiStatusText(
      mappedItems.length > 0
        ? (isZh ? `AI 已找到 ${mappedItems.length} 道相关题。` : `AI found ${mappedItems.length} related questions.`)
        : (isZh ? "没有找到新的匹配题目。" : "No matching questions found."),
    );
  } catch (error) {
    setAiErrorText(error instanceof Error ? error.message : (isZh ? "AI 检索失败" : "AI search failed"));
  } finally {
    setAiLoading(false);
  }
}
```

- [ ] **Step 7: 更新 AiSearchPanel 调用处的 props**

修改主组件模板中 AiSearchPanel 的调用（约第 1024-1035 行）：

```tsx
<AiSearchPanel
  query={aiQuery}
  loading={aiLoading}
  errorText={aiErrorText}
  statusText={aiStatusText}
  results={aiResults}
  selectedIds={aiSelectedIds}
  onQueryChange={setAiQuery}
  onSearch={() => void runAiSearch()}
  onToggleSelect={handleToggleAiSelect}
  onImportSelected={handleImportSelected}
/>
```

- [ ] **Step 8: 更新 AI 面板头部描述文案**

修改面板头部（约第 1009-1013 行）的描述文字：

原来：
```tsx
<h2 className="text-sm font-semibold text-[#37352F]">{isZh ? "AI 检索" : "AI Search"}</h2>
<p className="mt-0.5 text-xs text-[#37352F]/50">
  {isZh ? "只在需要换题时打开。" : "Open when you need to replace a question."}
</p>
```

改为：
```tsx
<h2 className="text-sm font-semibold text-[#37352F]">{isZh ? "AI 找题" : "AI Search"}</h2>
<p className="mt-0.5 text-xs text-[#37352F]/50">
  {isZh ? "搜索题目，勾选后导入到编辑台。" : "Search questions, select and import to editor."}
</p>
```

- [ ] **Step 9: 移除不再需要的 import 和变量**

在 `QuestionBankSplitWorkspacePage.tsx` 中：
- `activeQuestion` 这个 useMemo 仍然保留（因为 QuestionCard 展开/折叠仍需要它，而且 rewrite 也用到）
- 确认 `handleReplaceWithResult` 和 `handleAppendResult` 已被删除

---

### Task 3: QuestionCard「换一题」按钮文案更新

**Files:**
- Modify: `components/main/question-bank/split-editor/QuestionCard.tsx:224-231`

**设计说明：** 将「换一题」按钮文案改为「AI 找题」，语义从"替换"变为"搜索"。按钮的 onClick 逻辑不变（仍调用 `onReplaceRequest`），只是文案和图标调整。

- [ ] **Step 1: 修改按钮文案和图标**

在 `QuestionCard.tsx` 第 224-231 行，将：

```tsx
<button
  type="button"
  onClick={onReplaceRequest}
  className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3]"
>
  <Wand2 className="h-4 w-4" />
  换一题
</button>
```

改为：

```tsx
<button
  type="button"
  onClick={onReplaceRequest}
  className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(55,53,47,0.1)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/70 transition hover:bg-[#faf8f3]"
>
  <Search className="h-4 w-4" />
  AI 找题
</button>
```

在文件顶部 import 中确保有 `Search`（如果没有需要增加）：
```typescript
import { ..., Search, ... } from "lucide-react";
```

- [ ] **Step 2: 验证构建通过**

运行：
```bash
cd /Users/mac/Documents/project/toBeduTrack-jiaohu-tya && pnpm tsc --noEmit
```

预期：无新增类型错误。

- [ ] **Step 3: 提交**

```bash
git add components/main/question-bank/split-editor/AiSearchPanel.tsx \
      components/main/question-bank/split-editor/QuestionCard.tsx \
      components/main/question-bank/split/QuestionBankSplitWorkspacePage.tsx
git commit -m "feat: AI 面板从覆盖模式改为勾选导入模式

- AiSearchPanel 增加 checkbox 多选，底部固定导入按钮
- 移除「替换当前题」「追加到试卷」单题按钮
- 父组件新增 aiSelectedIds 状态和 handleImportSelected 批量导入
- 导入的题目追加到编辑台最下方，不覆盖现有题
- QuestionCard「换一题」改为「AI 找题」"
```

---

### Task 4: 顶栏增加「AI 找题」快捷入口

**Files:**
- Modify: `components/main/question-bank/split/QuestionBankSplitWorkspacePage.tsx:886-935`

**设计说明：** 在顶部工具栏中增加一个「AI 找题」按钮，让老师可以随时打开 AI 面板，不需要先展开某道题再点「换一题」。

- [ ] **Step 1: 在工具栏的「保存」按钮之前增加 AI 找题按钮**

在模板中约第 888 行（`<>` 之后）增加：

```tsx
<button
  type="button"
  onClick={() => {
    setAiPanelOpen(true);
    setAiSelectedIds(new Set());
  }}
  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-sm text-[#37352F]/72 transition hover:bg-[#faf8f3]"
>
  <Wand2 className="h-4 w-4" />
  {isZh ? "AI 找题" : "AI Search"}
</button>
```

- [ ] **Step 2: 验证构建通过**

运行：
```bash
cd /Users/mac/Documents/project/toBeduTrack-jiaohu-tya && pnpm tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add components/main/question-bank/split/QuestionBankSplitWorkspacePage.tsx
git commit -m "feat: 顶栏增加 AI 找题快捷入口按钮"
```

---

## 变更总结

| 改动前 | 改动后 |
|--------|--------|
| AI 面板是「替换」工具 | AI 面板是「找题」工具 |
| 每道推荐题有「替换当前题」「追加到试卷」两个按钮 | 每道推荐题有 checkbox，底部统一「导入 N 道」按钮 |
| 必须先展开编辑台中的一道题才能用 AI | 随时可打开 AI 面板搜索 |
| AI 搜索依赖「参考题」作为上下文 | AI 搜索基于用户输入的文本条件 |
| 导入后覆盖某道题 | 导入后追加到编辑台末尾 |
| QuestionCard 有「换一题」按钮 | 改为「AI 找题」，只打开面板 |

## 不变的部分

- AI 搜索 API（`/api/tiku/search`）不变
- 题目数据类型（`QuestionBankAiSearchResult`、`QuestionBankSplitQuestion`）不变
- `mapAiResultToSplitQuestion` 转换逻辑不变
- 编辑台的拖拽排序、编辑、入库流程不变
- 本地存储持久化逻辑不变
