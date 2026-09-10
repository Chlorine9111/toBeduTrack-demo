# 微信排版 - 文档上传 & 图片上传功能设计

## 概述

为微信公众号排版功能增加两项能力：
1. **文档上传区** — 支持 Word/Excel/TXT/MD/PDF/PPT，AI 读取内容作为生成参考
2. **图片上传区** — AI 识别图片内容，自动插入到文章合适位置

## 数据流

```
用户上传文档/图片 → 前端暂存 File[] state → 点击生成时 multipart/form-data 上传
→ 服务端解析文档文本 + Claude Vision 识别图片
→ AI 综合 prompt + 文档内容 + 图片 → 生成 HTML（图片以 base64 img 嵌入）
```

## 方案选择

**方案 A（已选）：一次性上传** — 文件随生成请求一起上传，用完即弃，不持久化。

理由：功能核心是"上传 → 生成"，无需文件复用，实现最简洁，无隐私顾虑。

## UI 布局

在 prompt 输入区与编辑器之间新增一行：

```
┌─────────────────────────────────────────────────────┐
│  📎 参考文档                    🖼️ 文章配图            │
│  [文件图标+名称+删除]           [缩略图+名称+删除]      │
│  [+ 添加文档]                  [+ 添加图片]            │
└─────────────────────────────────────────────────────┘
```

## API 变更

`POST /api/wechat/generate` 从 JSON → multipart/form-data

Fields: action, prompt, draft, htmlDraft, documents[], images[]

## 文档解析

| 格式 | 库 | 输出 |
|------|---|------|
| .docx | mammoth | 纯文本 |
| .xlsx | xlsx (SheetJS) | Markdown 表格 |
| .pdf | pdf-parse | 纯文本 |
| .pptx | jszip + XML 解析 | 幻灯片文本 |
| .txt/.md | Buffer.toString() | 原文 |

## 图片处理

Claude Vision multi-modal：图片作为 image content block 传入，AI 识别内容后在 HTML 中合适位置插入 `<img>` 标签。

## 文件限制

| 类型 | 单文件上限 | 数量上限 |
|------|-----------|---------|
| 文档 | 10MB | 5 个 |
| 图片 | 5MB | 10 张 |

## 文件清单

| 文件 | 操作 |
|------|------|
| `lib/wechat/document-parser.ts` | 新建 |
| `components/main/wechat/FileUploadZone.tsx` | 新建 |
| `components/main/wechat/ImageUploadZone.tsx` | 新建 |
| `components/main/WeChatAIGeneratorPage.tsx` | 修改 |
| `app/api/wechat/generate/route.ts` | 修改 |
| `package.json` | 修改 |
