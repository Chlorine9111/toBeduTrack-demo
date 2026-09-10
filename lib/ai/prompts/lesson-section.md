# 章节 Block 生成

## 当前章节
课程：{{COURSE_NAME}}
标题：{{SECTION_TITLE}}
摘要：{{SECTION_SUMMARY}}
时长：{{SECTION_DURATION}} 分钟

## 教师需求
{{TEACHER_REQUEST}}

## CED 上下文
{{TOPIC_CONTEXT}}

## 教学偏好
{{PREFERENCES}}

## 上下文衔接
{{#if PREVIOUS_SUMMARY}}前文摘要：{{PREVIOUS_SUMMARY}}{{/if}}
{{#if NEXT_SUMMARY}}后文摘要：{{NEXT_SUMMARY}}{{/if}}

## 通用规则与术语定义
{{SHARED_RULES}}

{{#if SUBJECT_HINT}}
## 学科适配要求
{{SUBJECT_HINT}}
{{/if}}

## 生成前内部检查（据此决定内容，不需要输出）

- 当前章节《{{SECTION_TITLE}}》的核心教学目标是什么？→ 决定 block 类型选择
- 学生水平是 {{STUDENT_LEVEL}}，example 推导步骤应拆到什么粒度？
{{#if PREVIOUS_SUMMARY}}- 前文已讲 {{PREVIOUS_SUMMARY}}，当前章节从哪里衔接？{{/if}}
- 学生最可能在哪一步卡住？→ 决定 misconception callout 的位置（如需要）

## Block 质量要求

### 语义规则（每种 block 的内容标准）
1) heading：文本必须含时间信息，如"（8 分钟）"。
2) paragraph：使用 Teacher:/Student:/Key:/Note: 脚本标记，包含具体教师话术或学生活动。聚焦正面教学动作。
3) example：每步写清"做什么 + 为什么 + 预期结果"。steps 聚焦解题推理过程。
4) definition：覆盖正式定义 + 直觉解释或类比 + 数值验证小例子。
5) steps：格式为 [X 分钟] 教师动作 + 学生反应。聚焦教学活动本身。
6) quiz：选项必须包含真实干扰项，explanation 解释正确选项的推理过程。
7) math：使用 latex 字段。

### 结构规则
- 每个 section 至少 1 个 example block 和 1 个可检验问题（quiz/poll/think）。
- {{FOCUS_SECTION_REQUIREMENT}}

## 分层要求
{{LEVEL_RULES}}

## 参考示例（仅供学习具体性与格式，不要逐字复用）
{{FEW_SHOT_EXAMPLES}}

## 重要提醒
- 请仔细阅读当前章节的标题和摘要，生成的每个 block 都必须紧扣这个章节的具体内容。
- 不同类型的 block 必须包含不同的内容，严禁重复。

{{#if RETRY_INSTRUCTIONS}}
## 重试修正（上次生成未通过质量审核）
{{RETRY_INSTRUCTIONS}}
{{/if}}
