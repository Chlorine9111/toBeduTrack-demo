# Scheduler with Simulated Annealing

## 目标

在学校排课场景中，自动处理以下常见问题：

- 老师时间冲突
- 班级课程冲突
- 教室冲突
- 老师请假导致的临时调课
- 指定课程必须落在某时段（锁定规则）

## 核心实现

- 求解器：`lib/scheduler/annealing.ts`
- 输入样例：`lib/scheduler/sample-data.ts`
- API：`app/api/scheduler/generate/route.ts`
- 页面：`/main/scheduler`

### 评分函数

`score = hardViolations * hardPenaltyWeight + softPenalty`

硬约束（Hard）：

1. 同一时段同一老师只能上一节课
2. 同一时段同一班级只能上一节课
3. 同一时段同一教室只能有一节课
4. 老师不可用时段不能排课
5. 锁定课程规则必须满足

软约束（Soft）：

1. 同一天同课程重复过多
2. 班级日课表出现大量空洞（gaps）
3. 老师单日负载过高
4. 过多落在最后一节

### 邻域操作

每次迭代随机选择一种：

- 随机移动一节课到新时段+教室
- 交换两节课的时段
- 调整一节课的教室

### 接受准则

- 若新解更优：直接接受
- 若新解更差：按 `exp(-delta/temperature)` 概率接受
- 每轮降温：`temperature *= coolingRate`

## 现阶段能力

- 支持在 UI 中添加教师请假规则
- 支持添加课程锁定规则
- 一键排课并显示每个班级的时段明细
- 输出 hard/soft/总分 和告警

## 下一步建议

1. 将课表与规则持久化到 Supabase
2. 增加“尽量少改动原课表”的惩罚项
3. 增加学生换班请求模型
4. 输出多个候选方案（A/B/C）供教务审批
