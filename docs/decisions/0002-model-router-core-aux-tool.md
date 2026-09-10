---
last_verified: 2026-03-05
owner: platform-harness
---

# ADR-0002: 模型路由采用 Core/Aux/Tool 分层

## 状态
Accepted

## 背景
不同任务对成本、速度、稳定性要求不同，若在各路由散落模型配置，难以统一调优。

## 备选方案
1. 每个 route 自行写模型 ID
2. 单一全局模型
3. 按任务路由到 Core/Aux/Tool（当前实现）

## 决策
以 `lib/ai/model-router.ts` 为统一入口，根据任务映射到 Core/Aux/Tool 及覆盖环境变量。

## 决策理由
- 任务维度调优集中化，便于批量切换与灰度。
- 能区分高质量生成与工具抽取任务的模型需求。
- 已被 lesson-plan、assistant、pbl 等模块实际使用。

## 影响
- 正向影响：模型策略统一可控，减少重复配置。
- 负向影响：少量历史路由仍存在直接 SDK 调用（需逐步收敛）。
- 后续动作：对新增 route 通过架构检查限制直连 SDK。
