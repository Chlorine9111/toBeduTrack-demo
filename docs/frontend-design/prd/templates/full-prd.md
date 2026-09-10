# Detailed PRD Framework

## 1. Overview

### 1.1 Product Name
[产品名称]

### 1.2 Version
[版本号，如 v1.0]

### 1.3 Last Updated
[日期]

### 1.4 Author
[作者]

### 1.5 Status
[Draft / In Review / Approved / In Development / Shipped]

---

## 2. Problem Definition

### 2.1 Background
[项目背景和上下文。为什么需要这个产品/功能？]

### 2.2 Problem Statement
[明确描述要解决的核心问题]

### 2.3 User Pain Points
1. [痛点 1]
2. [痛点 2]
3. [痛点 3]

### 2.4 Evidence
[数据、用户反馈、竞品分析等支撑材料]

---

## 3. Goals & Non-Goals

### 3.1 Goals
- [ ] [目标 1 — 可衡量]
- [ ] [目标 2 — 可衡量]

### 3.2 Non-Goals
- [明确不做的事情 1]
- [明确不做的事情 2]

### 3.3 Success Metrics
| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| [指标名] | [当前值] | [目标值] | [如何测量] |

---

## 4. User Personas

### Persona 1: [名称]
- **Role**: [角色]
- **Context**: [使用场景]
- **Goals**: [目标]
- **Frustrations**: [痛点]

### Persona 2: [名称]
- **Role**: [角色]
- **Context**: [使用场景]
- **Goals**: [目标]
- **Frustrations**: [痛点]

---

## 5. User Stories & Requirements

### 5.1 User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|------------|----------|
| US-01 | [角色] | [操作] | [价值] | P0/P1/P2 |
| US-02 | [角色] | [操作] | [价值] | P0/P1/P2 |

### 5.2 Functional Requirements

#### FR-01: [功能名称]
- **Description**: [描述]
- **Acceptance Criteria**:
  - [ ] [验收标准 1]
  - [ ] [验收标准 2]
- **Design Reference**: `clipboard/[page-name].html`

#### FR-02: [功能名称]
- **Description**: [描述]
- **Acceptance Criteria**:
  - [ ] [验收标准 1]
  - [ ] [验收标准 2]

### 5.3 Non-Functional Requirements
- **Performance**: [如：页面加载 < 3s，API 响应 < 500ms]
- **Accessibility**: [如：WCAG 2.1 AA]
- **Responsive**: [如：支持 320px - 2560px]
- **Browser Support**: [如：Chrome, Safari, Firefox 最新两个版本]

---

## 6. Information Architecture

### 6.1 Sitemap
```
/
├── /auth
│   ├── /login
│   └── /register
├── /onboarding
│   └── /subjects
├── /main
│   ├── /[page-1]
│   └── /[page-2]
└── /settings
    └── /profile
```

### 6.2 Navigation Structure
[描述导航层级和逻辑]

---

## 7. Page Specifications

### Page: [页面名称]

#### 7.1 Layout
- **Design Reference**: `clipboard/[page-name].html`
- **Layout Type**: [如：Sidebar + Main Content]
- **Responsive Behavior**: [断点行为]

#### 7.2 Components
| Component | Description | Interaction |
|-----------|-------------|-------------|
| [组件名] | [描述] | [交互行为] |

#### 7.3 States
- **Empty State**: [空状态描述]
- **Loading State**: [加载状态描述]
- **Error State**: [错误状态描述]
- **Success State**: [成功状态描述]

#### 7.4 Data Flow
```
User Action → Component → Hook → API Client → Backend → Response → UI Update
```

---

## 8. API Specifications

### API-01: [接口名称]
- **Endpoint**: `[METHOD] /api/[path]`
- **Request**:
  ```typescript
  interface Request {
    // ...
  }
  ```
- **Response**:
  ```typescript
  interface Response {
    success: boolean
    data?: {
      // ...
    }
    error?: string
  }
  ```
- **Error Codes**: [错误码说明]

---

## 9. Design System Reference

### 9.1 Color Tokens
[参考 `design-system/stitch-design-tokens.md`]

### 9.2 Typography
[字体、字号、行高规范]

### 9.3 Spacing
[间距规范]

### 9.4 Component Library
[使用 shadcn/ui 的哪些组件]

---

## 10. Technical Architecture

### 10.1 Tech Stack
- Frontend: Next.js 15.3 (App Router) + React 19 + TypeScript
- Styling: Tailwind CSS 4 + shadcn/ui
- Backend: Supabase (PostgreSQL + pgvector)
- AI: Anthropic Claude / Kimi K2

### 10.2 Data Model
[数据库表结构]

### 10.3 Third-Party Integrations
[第三方服务列表]

### 10.4 Security Considerations
- [ ] 认证/授权
- [ ] 输入验证 (Zod)
- [ ] XSS/CSRF 防护
- [ ] 速率限制
- [ ] 数据加密

---

## 11. Release Plan

### 11.1 Phases
| Phase | Features | Target Date | Status |
|-------|----------|-------------|--------|
| MVP | [核心功能] | [日期] | [状态] |
| V1.1 | [增强功能] | [日期] | [状态] |

### 11.2 Testing Plan
- Unit Tests: Vitest (80%+ coverage)
- Integration Tests: API 端到端
- E2E Tests: Playwright

### 11.3 Rollout Strategy
[灰度发布/全量发布策略]

---

## 12. Open Questions
- [ ] [待确认问题 1]
- [ ] [待确认问题 2]

## 13. Appendix
- [参考链接]
- [竞品分析]
- [会议纪要]
