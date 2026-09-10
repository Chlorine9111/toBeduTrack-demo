---
last_verified: 2026-03-05
owner: platform-harness
---

# Harness Engineering Bootstrap
状态: IN_PROGRESS

## 目标
建立可持续演进的 context/constraint/feedback 三层 harness，降低未来 agent 误改成本。

## 设计概要
以 `docs/*` 提供可压缩上下文，以 `check-architecture/check-docs` 机械化守护边界；详细决策见 `docs/decisions/`。

## 阶段分解
### Phase 1: Context Layer
- [x] 重建 `AGENTS.md` 轻量地图
- [x] 新增 `docs/product.md` 并置于索引首位
- [x] 补齐 architecture/conventions/domain-map/stack/quality/debt
- [x] 建立 ADR 与计划模板目录

### Phase 2: Constraint Layer
- [x] 新增 `scripts/check-architecture.ts`
- [x] 接入 `package.json` 检查脚本
- [x] 在 CI 中启用架构检查

### Phase 3: Feedback Layer
- [x] 新增 `scripts/check-docs.ts`
- [x] 文档 freshness warning 机制
- [x] 建立 `docs/error-patterns.md` 飞轮记录

## 决策日志
| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-03-05 | 先上低误报规则，再逐步收紧 | 防止团队对 CI 报错失去信任 |
| 2026-03-05 | docs 检查先覆盖核心受管文档 | 降低历史文档噪声导致的误报 |

## 已知风险和依赖
- 历史跨层类型依赖尚未清理（见 `docs/plans/debt.md`）
- 业务规则检查目前仍以结构边界为主，语义级规则待补充

## 完成标准
`npm run check:all` 在本仓库可通过，且 CI 在 PR/Push 自动执行。
