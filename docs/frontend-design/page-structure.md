# Deskmate 页面嵌套结构

> AI 在实现页面时，先查阅此文件了解整体路由和嵌套关系，再按需读取对应的 clipboard/PRD。

---

## Auth Shell

```
Auth Shell
├── Login                    (/auth/login)
├── Register                 (/auth/register)
├── Forgot Password          (/auth/forgot-password)
└── Update Password          (/auth/update-password)
```

**Clipboard 文件**:
- `clipboard/auth-login.html`
- `clipboard/auth-register.html`

---

## Onboarding Shell

```
Onboarding Shell
├── Step 1: Basic Info       (/onboarding/basic-info)
├── Step 2: Subjects         (/onboarding/subjects)
└── Step 3: Get Started      (/onboarding/get-started)
```

**Clipboard 文件**:
- `clipboard/onboarding-subjects.html`

---

## Product Shell (with 56px icon sidebar)

```
Product Shell (with 56px icon sidebar)
│
├── Agent Workspace          (/main/agent)
│   ├── [内嵌] Empty state → Work state 切换
│   ├── [侧面板] Chat History
│   └── [弹层] Export dropdown
│
├── Library                  (/main/library)
│   └── Document Detail      (/main/library/[id])
│       ├── [状态] View mode ↔ Edit mode
│       └── [弹层] Export dropdown
│
├── Content Library          (/main/content-library)
│   └── [抽屉] Content detail (`?itemId=...`)
│       ├── [状态] Read/Edit detail metadata
│       └── [内嵌] 统一文档正文回读
│
├── Question Bank            (/main/question-bank)
│   └── [内嵌] Question accordion expand/collapse
│
├── Grading                  (/main/grading)
│   ├── [内嵌] Overview → Student detail 钻入
│   └── [内嵌] New session 步骤流程
│
├── Lesson Plan Studio       (/lesson-plans)
│   ├── [侧面板] AI Assistant panel (collapsible)
│   └── [弹层] Block type selector popover
│
├── PBL Create               (/main/pbl/create)
├── PBL Detail               (/main/pbl/[id])
│   └── [弹层] Export dropdown
│
├── Templates                (/main/templates)
│   └── [弹层] Template preview modal
│
├── WeChat Editor            (/main/wechat-editor)
│   └── [内嵌] 4-step workflow 切换
│
├── Settings                 (/main/settings)
│   └── [内嵌] Sub-navigation: Profile / Account / Preferences / Subscription / Security
│
├── Feedback                 (/main/feedback)
└── Upgrade                  (/main/upgrade)
```

**Clipboard 文件映射**:

| 路由 | Clipboard | 相关组件 |
|------|-----------|---------|
| `/main/agent` | `agent-home.html`, `agent-active-chat.html` | `agent-history-panel.html`, `export-dropdown-menu.html` |
| `/main/library` | `library-all-documents.html` | |
| `/main/library/[id]` | `document-detail-rubric.html` | `export-dropdown-menu.html` |
| `/main/content-library` | `library-all-documents.html` | `document-detail-rubric.html` |
| `/main/question-bank` | `question-bank.html` | |
| `/main/grading` | `ai-grading-overview.html` | |
| `/lesson-plans` | `lesson-studio-editor.html` | |
| `/main/pbl/create` | `pbl-create-project.html` | |
| `/main/pbl/[id]` | `pbl-project-detail.html` | `export-dropdown-menu.html` |
| `/main/templates` | `templates-library.html` | |
| `/main/wechat-editor` | `wechat-editor-edit.html` | |
| `/main/settings` | `settings-profile.html` | |
| `/main/feedback` | `feedback-center.html` | |
| `/main/upgrade` | `upgrade-to-pro.html` | |

---

## Global Overlays (任意页面可触发)

```
Global overlays
├── Search                   (Cmd+K)
├── Confirm/Delete modal
└── Toast notifications
```

**Clipboard 文件**:
- `clipboard/global-search-modal.html`
- `clipboard/global-confirmation-modal.html`
- `clipboard/global-toast-notifications.html`

---

## 公开页面 (无需登录)

```
Public Pages
├── Home                     (/)
├── Pricing                  (/pricing)
├── About                    (/about)
├── Blog List                (/blog)
├── Blog Detail              (/blog/[slug])
├── Public Lesson Plan       (/share/lesson/[id])
├── Privacy Policy           (/privacy)
└── Terms of Service         (/terms)
```

**Clipboard 文件**:
- `clipboard/deskmate-home.html`
- `clipboard/deskmate-pricing.html`
- `clipboard/deskmate-about.html`
- `clipboard/blog-list-v1.html`, `blog-list-v2.html`, `blog-list-v3.html`
- `clipboard/blog-detail-v1.html`, `blog-detail-v2.html`
- `clipboard/public-lesson-plan-v1.html`, `public-lesson-plan-v2.html`
- `clipboard/privacy-policy-v1.html`
- `clipboard/terms-of-service-v1.html`
