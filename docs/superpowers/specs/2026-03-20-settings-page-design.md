# Settings 页面设计

## 概述

重构 Settings 页面，将占位 tab 替换为实际可操作的功能面板。采用每个 tab 独立组件 + 独立 API 的架构，复用已有后端接口。

## Tab 结构

删除无用的 "Account" 占位 tab，最终 4 个 tab：

| Tab | 组件 | 数据源 |
|-----|------|--------|
| Profile | `AccountSettingsPanel.tsx`（已有） | `PATCH /api/account/profile` + Supabase Auth |
| Preferences | `PreferencesPanel.tsx`（新建） | `localStorage` + `cookie` |
| Security | `SecurityPanel.tsx`（新建） | Supabase Auth SDK |
| Subscription | `SubscriptionPanel.tsx`（新建） | server-side `quotaSummary` + `GET /api/quota` 验证 |

## 文件变更清单

### 改造

- `components/main/SettingsPageView.tsx` — 更新 `SettingsTab` 类型为 `"profile" | "preferences" | "security" | "subscription"`，删除 "account"，引入 3 个新 panel
- `components/auth/LogoutButton.tsx` — 添加 i18n 支持（`useAppI18n`，按钮文字 `isZh ? "退出登录" : "Sign out"`）
- `components/auth/AccountSettingsPanel.tsx` — 移除 `sendResetEmail` 相关代码（密码重置移到 Security），email 行改为纯只读展示

### 新建

- `components/main/settings/PreferencesPanel.tsx`
- `components/main/settings/SecurityPanel.tsx`
- `components/main/settings/SubscriptionPanel.tsx`

### 服务端页约定

- `app/main/(with-sidebar)/settings/page.tsx` — 继续作为 server component，但统一通过 `getTeacherContext()` 解析老师身份。
- `AUTH_BYPASS` 模式下：若 `AUTH_BYPASS_USER_ID` 可用，则直接渲染 `SettingsPageView` 与真实 `quotaSummary`；只有在找不到可用测试教师账号时才回退提示页。

## 各 Panel 详细设计

### 1. Profile（已有，微调）

**改动**：
- 移除 `sendResetEmail` 函数及相关状态（`resetNotice`, `resetError`, `isSendingReset`）
- Email 行：只显示邮箱地址（只读），删除 "Change" 按钮
- 其余不动：头像、姓名、学校、角色、学科、Bio、Save changes

### 2. PreferencesPanel（新建）

**功能**：语言切换

**布局**：
```
header: "偏好设置" / "Preferences"
描述: "自定义你的工作区体验。"

Section 卡片:
  标题: "语言 / Language"
  两个按钮切换:
    [中文]  [English]
  当前选中项高亮（bg-[#37352F] text-white）
```

**交互**：
- 点击按钮 → 调用 `setLocale("zh")` / `setLocale("en")`（来自 `useAppI18n`，内部自动持久化到 localStorage + cookie）
- 然后调用 `router.refresh()` 刷新 server component

**数据**：从 `useAppI18n()` hook 读取当前 `locale` 和 `setLocale`。

### 3. SecurityPanel（新建）

**功能**：密码修改（邮件验证流）+ 会话管理

**布局**：
```
header: "安全" / "Security"
描述: "管理密码和会话设置。"

Section 1 卡片 - 密码修改:
  左侧:
    标题: "密码" / "Password"
    描述: 当前邮箱地址（灰色文字）
  右侧:
    [发送重置邮件] 按钮

  成功提示（绿色）: "重置邮件已发送到 xxx@xxx.com，请在邮箱中继续操作。"
  错误提示（红色）: 错误信息

Section 2 卡片 - 当前会话:
  左侧:
    标题: "当前会话" / "Current session"
    描述: "完成当前工作后可安全退出。"
  右侧:
    <LogoutButton />
```

**逻辑**：
- `sendResetEmail` 从 `AccountSettingsPanel` 迁移过来
- 调用 `supabase.auth.resetPasswordForEmail(email, { redirectTo: buildRecoveryRedirectUrl("/main/settings") })`
- 成功/失败用 state 展示提示
- 无需新建 API

**Props**：
```typescript
type SecurityPanelProps = {
  email: string | null;
};
```

**边界情况 — email 为 null**：
- 描述文字显示 "未绑定邮箱" / "No email attached"
- "发送重置邮件" 按钮设为 `disabled` 状态

### 4. SubscriptionPanel（新建）

**功能**：展示测试期使用量、滚动周期和正式计划占位

**布局**：
```
header: "订阅" / "Subscription"
描述: "管理你的套餐和用量。"

3 张套餐卡片横向排列（flex, gap-6）:

  Free:
    价格: "$0 / 月"
    功能: 基础 AI 生成、有限次数、社区支持
    按钮: "Current plan"（禁用，outline 样式）

  Pro:
    价格: "Coming soon"
    功能: 无限 AI 生成、优先处理、高级模板
    按钮: "暂未开放"（禁用，primary 样式但灰色）

  Team:
    价格: "Coming soon"
    功能: 多教师协作、学校级管理、数据分析
    按钮: "暂未开放"（禁用，primary 样式但灰色）
```

**数据**：全部硬编码在组件内，支持 i18n（中/英双语）。

## 样式规范

遵循项目 design tokens：
- 背景：`#FFFFFF`（主区域）、`#F7F6F3`（输入框/卡片内）
- 文字：`#37352F`（主）、`rgba(55,53,47,0.6)`（次）、`rgba(55,53,47,0.4)`（弱）
- 边框：`rgba(55,53,47,0.09)`（卡片微妙边框）
- 圆角：组件 `8px`（`rounded-lg`）、卡片 `12px`（`rounded-xl`）
- 按钮高亮：`bg-[#37352F] text-white`
- 链接/强调：`#2383E2`
- 成功提示：`emerald-50` 背景 + `emerald-200` 边框
- 错误提示：`red-50` 背景 + `red-200` 边框
- 禁用按钮：`disabled:opacity-60 disabled:cursor-not-allowed`

## 不新建的内容

- 不新建数据库表
- 不新建 API 路由
- 不做暗色模式
- 不做教案生成偏好（后续再加）
- 不做题库默认设置
- 不做通知偏好
