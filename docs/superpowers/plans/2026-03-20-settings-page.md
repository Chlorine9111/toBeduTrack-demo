# Settings 页面实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Settings 页面，将占位 tab 替换为 4 个可操作的功能面板（Profile/Preferences/Security/Subscription）

**Architecture:** 每个 tab 一个独立组件，各自管理自己的数据获取和状态。复用已有 API（profile、lesson-plan preferences），密码重置走 Supabase Auth 邮件流，Subscription 纯静态展示。

**Tech Stack:** Next.js 15.3 App Router, React 19, Supabase Auth SDK, Tailwind CSS, useAppI18n

**Spec:** `docs/superpowers/specs/2026-03-20-settings-page-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `components/main/settings/PreferencesPanel.tsx` | 新建 | 语言切换面板 |
| `components/main/settings/SecurityPanel.tsx` | 新建 | 密码重置 + 会话管理面板 |
| `components/main/settings/SubscriptionPanel.tsx` | 新建 | 套餐展示面板（纯静态） |
| `components/auth/LogoutButton.tsx` | 改造 | 添加 i18n 支持 |
| `components/auth/AccountSettingsPanel.tsx` | 改造 | 移除密码重置逻辑，email 行改只读 |
| `components/main/SettingsPageView.tsx` | 改造 | 更新 tab 类型，集成新 panel |

---

### Task 1: LogoutButton i18n 改造

**Files:**
- Modify: `components/auth/LogoutButton.tsx`

- [ ] **Step 1: 添加 i18n 支持**

在 `LogoutButton.tsx` 中引入 `useAppI18n`，将硬编码中文替换为双语：

```tsx
// 新增 import
import { useAppI18n } from "@/lib/app-i18n/provider";

// 组件内部新增
const { isZh } = useAppI18n();

// 将第 36 行 "退出登录" 替换为
{isZh ? "退出登录" : "Sign out"}

// 将第 29 行 signOut 后的跳转 notice 也改为双语
window.location.assign(buildLoginUrl({ notice: isZh ? "你已安全退出" : "You have been signed out" }));
```

- [ ] **Step 2: 验证**

启动 `npm run dev`（端口 3001），访问 Settings > Security tab，切换语言后确认 LogoutButton 文字正确切换。

- [ ] **Step 3: Commit**

```bash
git add components/auth/LogoutButton.tsx
git commit -m "feat(settings): add i18n support to LogoutButton"
```

---

### Task 2: PreferencesPanel 新建

**Files:**
- Create: `components/main/settings/PreferencesPanel.tsx`

- [ ] **Step 1: 创建 PreferencesPanel 组件**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/app-i18n/types";

const LOCALE_OPTIONS: Array<{ value: AppLocale; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export default function PreferencesPanel() {
  const { isZh, locale, setLocale } = useAppI18n();
  const router = useRouter();

  const handleLocaleChange = (nextLocale: AppLocale) => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    router.refresh();
  };

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#37352F]">
          {isZh ? "偏好设置" : "Preferences"}
        </h1>
        <p className="mt-1 text-[0.875rem] text-[#37352F]/60">
          {isZh ? "自定义你的工作区体验。" : "Customize your workspace experience."}
        </p>
      </header>

      <section className="rounded-xl border border-[rgba(55,53,47,0.09)] bg-white p-6">
        <h2 className="text-base font-semibold text-[#37352F]">
          {isZh ? "语言" : "Language"} / {isZh ? "Language" : "语言"}
        </h2>
        <p className="mt-1 text-sm text-[#37352F]/60">
          {isZh ? "选择界面显示语言。" : "Choose your interface language."}
        </p>
        <div className="mt-4 flex gap-2">
          {LOCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleLocaleChange(option.value)}
              className={cn(
                "rounded-lg px-5 py-2.5 text-[0.875rem] font-medium transition-colors",
                locale === option.value
                  ? "bg-[#37352F] text-white"
                  : "bg-[#F7F6F3] text-[#37352F]/70 hover:bg-[#EFEEEB]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 确认 AppLocale 类型可导入**

检查 `lib/app-i18n/types.ts` 导出了 `AppLocale` 类型。如果是 `type AppLocale = "zh" | "en"` 则直接使用。

- [ ] **Step 3: Commit**

```bash
git add components/main/settings/PreferencesPanel.tsx
git commit -m "feat(settings): create PreferencesPanel with language switcher"
```

---

### Task 3: SecurityPanel 新建

**Files:**
- Create: `components/main/settings/SecurityPanel.tsx`

- [ ] **Step 1: 创建 SecurityPanel 组件**

从 `AccountSettingsPanel.tsx:243-277` 迁移 `sendResetEmail` 逻辑。需要的 import：
- `createBrowserSupabaseClient` from `@/lib/supabase/client`
- `buildRecoveryRedirectUrl` from `@/lib/auth/urls`
- `mapAuthErrorMessage` from `@/lib/auth/messages`
- `useAppI18n` from `@/lib/app-i18n/provider`
- `LogoutButton` from `@/components/auth/LogoutButton`

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { mapAuthErrorMessage } from "@/lib/auth/messages";
import { buildRecoveryRedirectUrl } from "@/lib/auth/urls";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/auth/LogoutButton";

type SecurityPanelProps = {
  email: string | null;
};

export default function SecurityPanel({ email }: SecurityPanelProps) {
  const { isZh, locale } = useAppI18n();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const sendResetEmail = async () => {
    if (!email) return;

    setNotice("");
    setError("");
    setIsSending(true);

    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildRecoveryRedirectUrl("/main/settings"),
      });

      if (authError) {
        setError(mapAuthErrorMessage(authError.message, locale));
        return;
      }

      setNotice(
        isZh
          ? `重置邮件已发送到 ${email}，请在邮箱中继续后续操作。`
          : `A password reset email was sent to ${email}. Continue from your inbox.`,
      );
    } catch {
      setError(isZh ? "发送重置邮件失败，请稍后重试。" : "Failed to send the reset email. Try again later.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#37352F]">
          {isZh ? "安全" : "Security"}
        </h1>
        <p className="mt-1 text-[0.875rem] text-[#37352F]/60">
          {isZh ? "管理密码和会话设置。" : "Manage password and session settings."}
        </p>
      </header>

      {/* 提示消息 */}
      {notice && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Section 1: 密码修改 */}
        <section className="rounded-xl border border-[rgba(55,53,47,0.09)] bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#37352F]">
                {isZh ? "密码" : "Password"}
              </h2>
              <p className="mt-1 text-sm text-[#37352F]/60">
                {email ?? (isZh ? "未绑定邮箱" : "No email attached")}
              </p>
            </div>
            <button
              type="button"
              onClick={sendResetEmail}
              disabled={isSending || !email}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#37352F] px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors hover:bg-[#55524c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isZh ? "发送重置邮件" : "Send reset email"}
            </button>
          </div>
        </section>

        {/* Section 2: 当前会话 */}
        <section className="rounded-xl border border-[rgba(55,53,47,0.09)] bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#37352F]">
                {isZh ? "当前会话" : "Current session"}
              </h2>
              <p className="mt-1 text-sm text-[#37352F]/60">
                {isZh ? "完成当前工作后可安全退出。" : "Sign out safely after your current work."}
              </p>
            </div>
            <LogoutButton />
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/main/settings/SecurityPanel.tsx
git commit -m "feat(settings): create SecurityPanel with password reset and session management"
```

---

### Task 4: SubscriptionPanel 新建

**Files:**
- Create: `components/main/settings/SubscriptionPanel.tsx`

- [ ] **Step 1: 创建 SubscriptionPanel 组件**

```tsx
"use client";

import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

type Plan = {
  key: string;
  nameZh: string;
  nameEn: string;
  priceZh: string;
  priceEn: string;
  featuresZh: string[];
  featuresEn: string[];
  isCurrent: boolean;
  available: boolean;
};

const PLANS: Plan[] = [
  {
    key: "free",
    nameZh: "免费版",
    nameEn: "Free",
    priceZh: "$0 / 月",
    priceEn: "$0 / mo",
    featuresZh: ["基础 AI 生成", "有限使用次数", "社区支持"],
    featuresEn: ["Basic AI generation", "Limited usage", "Community support"],
    isCurrent: true,
    available: true,
  },
  {
    key: "pro",
    nameZh: "专业版",
    nameEn: "Pro",
    priceZh: "即将推出",
    priceEn: "Coming soon",
    featuresZh: ["无限 AI 生成", "优先处理", "高级模板"],
    featuresEn: ["Unlimited AI generation", "Priority processing", "Advanced templates"],
    isCurrent: false,
    available: false,
  },
  {
    key: "team",
    nameZh: "团队版",
    nameEn: "Team",
    priceZh: "即将推出",
    priceEn: "Coming soon",
    featuresZh: ["多教师协作", "学校级管理", "数据分析"],
    featuresEn: ["Multi-teacher collaboration", "School-level management", "Analytics"],
    isCurrent: false,
    available: false,
  },
];

export default function SubscriptionPanel() {
  const { isZh } = useAppI18n();

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#37352F]">
          {isZh ? "订阅" : "Subscription"}
        </h1>
        <p className="mt-1 text-[0.875rem] text-[#37352F]/60">
          {isZh ? "管理你的套餐和用量。" : "Manage your plan and usage."}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className={cn(
              "flex flex-col rounded-xl border p-6",
              plan.isCurrent
                ? "border-[#37352F] bg-white"
                : "border-[rgba(55,53,47,0.09)] bg-white",
            )}
          >
            <h3 className="text-lg font-semibold text-[#37352F]">
              {isZh ? plan.nameZh : plan.nameEn}
            </h3>
            <p className="mt-1 text-2xl font-semibold text-[#37352F]">
              {isZh ? plan.priceZh : plan.priceEn}
            </p>

            <ul className="mt-6 flex-1 space-y-3">
              {(isZh ? plan.featuresZh : plan.featuresEn).map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-[#37352F]/70">
                  <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[#37352F]/30" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled
              className={cn(
                "mt-6 w-full rounded-lg py-2.5 text-[0.875rem] font-semibold transition-colors disabled:cursor-not-allowed",
                plan.isCurrent
                  ? "border border-[rgba(55,53,47,0.16)] bg-white text-[#37352F]/60"
                  : "bg-[#37352F] text-white disabled:opacity-60",
              )}
            >
              {plan.isCurrent
                ? (isZh ? "当前套餐" : "Current plan")
                : (isZh ? "暂未开放" : "Coming soon")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/main/settings/SubscriptionPanel.tsx
git commit -m "feat(settings): create SubscriptionPanel with plan cards"
```

---

### Task 5: AccountSettingsPanel 清理密码重置代码

**Files:**
- Modify: `components/auth/AccountSettingsPanel.tsx`

- [ ] **Step 1: 移除密码重置相关代码**

从 `AccountSettingsPanel.tsx` 中删除：

1. 移除 import：`mapAuthErrorMessage` from `@/lib/auth/messages`、`buildRecoveryRedirectUrl` from `@/lib/auth/urls`
2. 移除 state 声明（第 87-89 行）：`resetNotice`、`resetError`、`isSendingReset`
3. 移除 `sendResetEmail` 函数（第 243-277 行）
4. 移除密码重置通知 JSX（第 361-372 行）：`resetNotice` 和 `resetError` 的提示块

- [ ] **Step 2: Email 行改为纯只读**

将 email 区域（第 397-417 行）替换为纯只读显示，移除 "Change" 按钮：

```tsx
{/* Email（只读） */}
<div className="space-y-2">
  <label className={LABEL_CLASS}>
    {isZh ? "邮箱地址" : "Email address"}
  </label>
  <div className="flex items-center rounded-lg bg-[#F7F6F3] px-4 py-3">
    <span className="text-[0.875rem] text-[#37352F]/50">
      {props.email ?? (isZh ? "未绑定邮箱" : "No email attached")}
    </span>
  </div>
</div>
```

- [ ] **Step 3: 确认 TypeScript 无报错**

```bash
cd /Users/martin/Documents/个人项目/new-start && npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add components/auth/AccountSettingsPanel.tsx
git commit -m "refactor(settings): move password reset from Profile to Security panel"
```

---

### Task 6: SettingsPageView 集成所有 Panel

**Files:**
- Modify: `components/main/SettingsPageView.tsx`

- [ ] **Step 1: 更新 tab 类型和导入**

移除原有的 `import LogoutButton from "@/components/auth/LogoutButton"`（不再直接使用，已由 SecurityPanel 内部引入）。新增 3 个 panel 的 import：

```tsx
// 移除: import LogoutButton from "@/components/auth/LogoutButton";

// 新增 import
import PreferencesPanel from "@/components/main/settings/PreferencesPanel";
import SecurityPanel from "@/components/main/settings/SecurityPanel";
import SubscriptionPanel from "@/components/main/settings/SubscriptionPanel";

// 更新类型：删除 "account"，新增 "subscription"
type SettingsTab = "profile" | "preferences" | "security" | "subscription";

// 更新 TAB_ITEMS：删除 account，新增 subscription
const TAB_ITEMS: Array<{ key: SettingsTab; labelZh: string; labelEn: string }> = [
  { key: "profile", labelZh: "个人资料", labelEn: "Profile" },
  { key: "preferences", labelZh: "偏好设置", labelEn: "Preferences" },
  { key: "security", labelZh: "安全", labelEn: "Security" },
  { key: "subscription", labelZh: "订阅", labelEn: "Subscription" },
];
```

- [ ] **Step 2: 替换 tab 内容区域**

将 `{activeTab === "account" && ...}`、`{activeTab === "preferences" && ...}`、`{activeTab === "security" && ...}` 三块占位替换为：

```tsx
{activeTab === "preferences" && <PreferencesPanel />}

{activeTab === "security" && <SecurityPanel email={props.email} />}

{activeTab === "subscription" && <SubscriptionPanel />}
```

删除整个 `{activeTab === "account" && ...}` 块。

- [ ] **Step 3: 确认 TypeScript 无报错**

```bash
cd /Users/martin/Documents/个人项目/new-start && npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add components/main/SettingsPageView.tsx
git commit -m "feat(settings): integrate Preferences, Security, and Subscription panels"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd /Users/martin/Documents/个人项目/new-start && npm run dev
```

- [ ] **Step 2: 验证所有 4 个 tab**

访问 `http://localhost:3001/main/settings`，逐个检查：

1. **Profile** — 表单字段正常显示，email 为只读，没有 "Change" 按钮，保存功能正常
2. **Preferences** — 语言切换按钮显示正确，点击切换后页面刷新并生效
3. **Security** — 显示邮箱地址，"发送重置邮件" 按钮可点击，LogoutButton 文字随语言切换
4. **Subscription** — 3 张套餐卡片正确展示，按钮全部禁用

- [ ] **Step 3: 检查双语一致性**

切换到英文，确认所有 4 个 tab 的标题、描述、按钮文字都正确切换。

- [ ] **Step 4: 最终 commit（如有修复）**

```bash
git add -A
git commit -m "fix(settings): address issues found during verification"
```
