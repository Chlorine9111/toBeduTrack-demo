# WeChat Editor

## 功能概览

当前产品线使用单一的 **wechat-editor 工作台**：

- 顶部工具栏：撤销 / 重做 / 标题输入 / 预览切换 / 复制到公众号
- 左侧面板：模板、文本、图片、素材、排版、AI
- 中央画布：375px 手机阅读宽度，所见即所得
- 右侧面板：选中元素样式编辑（字号、颜色、行高、圆角、内边距、对齐）
- 底部状态栏：字数、图片数量、预估阅读时间
- 入口：`/main/wechat-editor`
- Demo 根路径：`/` 展示公开 Landing Page，不再自动跳转到编辑器

## AI 能力

当前活跃能力：

- `POST /api/wechat-editor/generate`：流式生成 Markdown 草稿
- `POST /api/wechat-editor/outline`：文本/文档导入后生成文章大纲
- `POST /api/wechat-editor/layout`：图片分析、排版建议与模板渲染
- `GET /api/wechat-editor/templates`：加载云端模板库
- `POST /api/wechat-editor/preview`：生成预览记录

兼容性说明：
- `POST /api/wechat/generate` 已冻结，仅返回弃用提示与迁移目标 `/main/wechat-editor`

## 模板与预设

- 模板库：`lib/wechat-editor/template-repository.ts`
- 模板渲染：`lib/wechat-editor/template-renderer.ts`
- 主题与配色：`lib/wechat-editor/themes.ts`、`lib/wechat-editor/color-palettes.ts`

## 导出与复制流程

编辑器输出由 Tiptap 内容转换为微信公众号可接受 HTML。

关键实现：
- `lib/wechat-editor/tiptap-to-wechat-html.ts`
- `lib/wechat-editor/clipboard.ts`
- `lib/wechat-editor/themes.ts`

处理步骤：

1. 生成或导入大纲
2. 选择模板与配色
3. 渲染到 Tiptap 编辑器
4. 转换为微信公众号 HTML
5. 复制时优先写入 `text/html`，必要时 fallback `writeText`

## 共享能力

虽然旧版生成器已经冻结，但两类底层能力仍在复用：

- `lib/wechat/document-parser.ts`：文档解析
- `lib/wechat/ai-vision.ts`：图片理解

这些共享能力仍可被 lesson-plan、agent 等其它链路调用，不属于旧页面专属代码。
