# 前端设计资源

## 用途

AI 实现页面时，**按需读取**对应文件，不加载全部上下文。

## 目录结构

```
frontend-design/
├── README.md                    # 本文件 - 总索引
├── page-structure.md            # 路由嵌套树 + clipboard 映射表
├── page-map.md                  # 路由树 + 跨页依赖 + 共享组件
├── clipboard/                   # 34 个页面的 HTML 设计参考
├── design-system/               # 设计系统规范
│   ├── design-tokens.md         # 颜色、字体、间距、圆角、阴影
│   ├── component-specs.md       # 按钮、卡片、输入框、标签等精确 CSS
│   ├── layout-shell.md          # 产品页侧边栏 + 主区域布局
│   ├── marketing-shell.md       # 营销页导航 + 页脚
│   └── shared-overlays.md       # 搜索弹窗、Toast、导出菜单、确认对话框
└── prd/
    ├── templates/               # PRD 模板
    │   ├── project-brief.md
    │   └── full-prd.md
    └── pages/                   # 各页面的功能 PRD（按需创建）
```

## 怎么用

### 场景 1: 实现某个页面
1. 查 `page-structure.md` → 确认路由、shell 类型、相关组件
2. 读 `design-system/layout-shell.md` 或 `marketing-shell.md`（取决于 shell）
3. 读 `clipboard/{page-name}.html` → 获取 HTML 设计参考
4. 如果需要更细节 → 用 **Stitch MCP** `get_screen` 拉在线设计

### 场景 2: 做组件
1. 读 `design-system/component-specs.md` → 复制精确 CSS
2. 读 `design-system/design-tokens.md` → 查颜色/间距值

### 场景 3: 做全局弹层
1. 读 `design-system/shared-overlays.md`

### 场景 4: 写页面 PRD
1. 读 `prd/templates/project-brief.md` 或 `full-prd.md`
2. 写好后存到 `prd/pages/{page-name}.md`

## Stitch MCP 集成

Stitch 保存了所有页面的在线设计稿，可以实时拉取：

```
# 项目 ID
Design System PRD: 886420668503916957
Project PRD:       8619256191740605257

# 常用操作
list_screens(projectId) → 列出所有设计页面
get_screen(name, projectId, screenId) → 获取某页面详细设计
generate_screen_from_text(projectId, prompt) → 用文字生成新页面设计
edit_screens(projectId, instructions) → 修改现有设计
```

## 页面清单（34 个）

### 认证 (Auth Shell)
| 文件 | 描述 |
|------|------|
| `clipboard/auth-login.html` | 登录页 |
| `clipboard/auth-register.html` | 注册页 |

### 入门引导 (Onboarding Shell)
| 文件 | 描述 |
|------|------|
| `clipboard/onboarding-subjects.html` | 学科选择步骤 |

### 产品核心 (Product Shell)
| 文件 | 描述 |
|------|------|
| `clipboard/agent-home.html` | Agent 空状态/首页 |
| `clipboard/agent-active-chat.html` | Agent 对话中 |
| `clipboard/library-all-documents.html` | 内容库列表 |
| `clipboard/document-detail-rubric.html` | 文档详情（Rubric） |
| `clipboard/question-bank.html` | 题库 |
| `clipboard/ai-grading-overview.html` | AI 判卷总览 |
| `clipboard/lesson-studio-editor.html` | 教案编辑器 |
| `clipboard/pbl-create-project.html` | PBL 创建 |
| `clipboard/pbl-project-detail.html` | PBL 详情 |
| `clipboard/templates-library.html` | 模板库 |
| `clipboard/wechat-editor-edit.html` | 微信编辑器 |
| `clipboard/settings-profile.html` | 设置 - 个人资料 |
| `clipboard/feedback-center.html` | 反馈中心 |
| `clipboard/upgrade-to-pro.html` | 升级 Pro |

### 全局组件 (Global Overlays)
| 文件 | 描述 |
|------|------|
| `clipboard/global-search-modal.html` | Cmd+K 搜索 |
| `clipboard/global-confirmation-modal.html` | 确认/删除对话框 |
| `clipboard/global-toast-notifications.html` | Toast 通知 |
| `clipboard/export-dropdown-menu.html` | 导出下拉菜单 |
| `clipboard/agent-history-panel.html` | Agent 历史侧面板 |

### 公开页面 (Marketing Shell)
| 文件 | 描述 |
|------|------|
| `clipboard/deskmate-home.html` | 首页 |
| `clipboard/deskmate-pricing.html` | 定价页 |
| `clipboard/deskmate-about.html` | 关于页 |
| `clipboard/blog-list-v1.html` | 博客列表 v1 |
| `clipboard/blog-list-v2.html` | 博客列表 v2 |
| `clipboard/blog-list-v3.html` | 博客列表 v3 |
| `clipboard/blog-detail-v1.html` | 博客详情 v1 |
| `clipboard/blog-detail-v2.html` | 博客详情 v2 |
| `clipboard/public-lesson-plan-v1.html` | 公开教案 v1 |
| `clipboard/public-lesson-plan-v2.html` | 公开教案 v2 |
| `clipboard/privacy-policy-v1.html` | 隐私政策 |
| `clipboard/terms-of-service-v1.html` | 服务条款 |
