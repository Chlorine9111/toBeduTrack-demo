# 配额侧边栏展示 + 未接入操作覆盖

## 背景

项目已有完整的配额系统（`lib/quota/`），但存在两个问题：

1. **配额展示不够显眼**：目前只在设置页 SubscriptionPanel 展示，教师日常使用时不易感知剩余额度
2. **部分 AI 操作未接入配额**：自动判卷、公众号生成、文档 AI 编辑三类操作消耗 API 但不计入配额

## 设计决策

### 侧边栏配额条

- **位置**：内嵌在 AppSidebar 底部账户区域内，紧跟在教师名称和学校下方
- **样式**：一行文字（左侧"剩余 N" / 右侧百分比）+ 3px 高度进度条
- **交互**：点击账户区域（已有行为）跳转 `/main/settings`，配额条不增加额外点击区域

### 颜色三阶段

| 使用量 | 进度条 | 文字 | 含义 |
|--------|--------|------|------|
| 0~79% | `#5E6AD2` | `#9B9DA4` | 正常 |
| 80~99% | `#F59E0B` | `#B45309` | 即将用完 |
| 100% | `#E07070` | `#E07070` | 已耗尽（柔和红，不给压迫感） |

耗尽态：左侧显示"额度已用完"，右侧显示重置日期（M/D 格式）。

### 新接入配额的操作

| 操作 | QuotaAction | QuotaClass | 单位 | 模型 | 理由 |
|------|-------------|------------|------|------|------|
| 自动判卷 | `auto_grade` | 新增 `standard_plus` | 6 | Gemini Pro x2 | OCR + 评分两阶段，成本低于 Claude 但高于单次调用 |
| 公众号文章生成 | `generate_wechat_article` | `standard` | 4 | Claude Sonnet | 单次流式生成，复杂度类似习题 |
| 文档 AI 编辑 | `doc_ai_edit` | `agent_chat` | 2 | Claude Sonnet | 小范围编辑，类似聊天互动 |

### 不计入配额的操作

| 操作 | 理由 |
|------|------|
| 题库语义搜索 (embedding) | 成本极低，基础功能不应阻碍使用 |
| 排课算法 | 纯算法，不调用 AI API |
| Haiku 意图解析 (tiku search) | 系统级调用，成本可忽略 |

### 配额总量

保持现有 300 单位/30 天不变。典型使用场景：

- 混合使用：10 份教案(120) + 10 次习题(40) + 20 次聊天(40) + 10 次判卷(60) + 5 篇公众号(20) + 10 次文档编辑(20) = 300
- 纯判卷：~50 份
- 纯教案：~25 份

## 修改文件清单

### 后端

| 文件 | 改动 |
|------|------|
| `lib/quota/constants.ts` | 添加 `auto_grade`、`generate_wechat_article`、`doc_ai_edit` 三个 QuotaAction；添加 `standard_plus` QuotaClass (6 单位) |
| `lib/quota/types.ts` | 扩展 QuotaAction 和 QuotaClass 联合类型 |
| `app/api/grading/sessions/[sessionId]/submissions/[submissionId]/auto-grade/route.ts` | 接入 checkQuotaAdmissionSafe + finalizeQuotaSpendSafe |
| `app/api/wechat-editor/generate/route.ts` | 接入 checkQuotaAdmissionSafe + finalizeQuotaSpendSafe |
| `app/api/doc/edit-html/route.ts` | 接入 checkQuotaAdmissionSafe + finalizeQuotaSpendSafe |

### 前端

| 文件 | 改动 |
|------|------|
| `components/main/AppSidebar.tsx` | 在账户区域内嵌配额进度条组件 |
| 新建 `hooks/useQuotaSummary.ts` | 封装 GET /api/quota 调用，SWR 式缓存 + 定时刷新 |
| `components/main/settings/SubscriptionPanel.tsx` | 更新耗尽态颜色 `#D9485F` → `#E07070` |

### 数据库

无迁移变更。新增的 QuotaAction 值存入 `quota_transactions.action` 列（TEXT 类型，无约束）。

## 验证

1. 启动 dev server (`PORT=3002 pnpm dev`)
2. 打开侧边栏，确认账户区域下方出现配额进度条
3. 使用 `quota:dev:reset` 脚本将配额重置，验证进度条显示正常
4. 触发判卷/公众号/文档编辑操作，验证配额扣减
5. 使用 `quota:dev:unlimit` 后再 `quota:dev:reset` 模拟额度耗尽，验证颜色变为柔红
6. 点击配额条区域，确认跳转到设置页
