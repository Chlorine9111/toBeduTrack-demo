# PDF 拆题图片识别架构分析与优化方案

## 当前架构

```
PDF → renderPdfPages(1.5x) → PNG 页面
   → LLM Vision (Claude) → 标注 bbox 坐标
   → expandRegion() → 裁剪区域 + 边距
   → cropImageBuffer() → 裁剪 PNG
   → storeImageBuffer() → Supabase Storage
   → /api/pdf/scan-image?path=... → 前端显示
```

## "显示不全"的 5 个根因

### 1. LLM bbox 标注不够精确
- LLM 看 PNG 页面后输出 `[x1, y1, x2, y2]` 像素坐标
- 经常标注过紧 — 不包含图片边框、阴影、坐标轴标签
- **Prompt 缺少精度指导**：没告诉 LLM bbox 应该宽松还是紧凑

**现有 Prompt**（`llm-question-extractor.ts:199`）：
```
如果题目引用图片，请在 linkedFigures 中输出对象：
{ "page": N, "bbox": [x1,y1,x2,y2], "description": "..." }
```

**缺失**：没有说明 bbox 应该包含完整图片（含标题、坐标轴、图例）

### 2. expandRegion() 边距不足
```typescript
// 当前逻辑
padX = min(120, max(24, regionWidth * 0.12))
padTop = min(120, max(24, regionHeight * 0.12))
padBottom = min(140, max(32, regionHeight * 0.18))
```
- 小图（<100px）：边距仅 24px，容易切掉边框
- 两套实现不一致（llm-question-extractor 用动态边距，vision-pdf 用固定 12px）

### 3. IMAGE_REGION 正则不接受浮点数
```regex
/\[IMAGE_REGION:\s*page=(\d+),\s*bbox=\[(\d+),(\d+),(\d+),(\d+)\]/g
```
- LLM 输出 `bbox=[100.5, 200.3, ...]` → 正则匹配失败 → 图片标记变成纯文本

### 4. PDF 渲染 DPI 可能不够
- `scale=1.5` → DPI=108，对高质量 PDF 可能清晰度不足
- 裁剪后的小区域图片会更模糊

### 5. 前端图片代理认证问题
- `/api/pdf/scan-image` 需要登录认证
- 前端 `<img src="/api/pdf/scan-image?path=...">` 的 GET 请求不一定携带 cookie
- 导致返回 HTML 登录页而不是图片

---

## 优化方案

### 方案 A：改进现有裁剪流程（最小改动）

**改 3 处：**

1. **优化 LLM Prompt — 明确 bbox 要求**
```
bbox 规则：
- 必须包含图片的完整可见区域，包括坐标轴标签、图例、标题
- 宁可大一点也不要切掉内容
- bbox 坐标用整数像素值
```

2. **加大 expandRegion 边距**
```typescript
padX = min(200, max(40, regionWidth * 0.2))
padTop = min(200, max(40, regionHeight * 0.2))
padBottom = min(200, max(50, regionHeight * 0.25))
```

3. **IMAGE_REGION 正则支持浮点数**
```regex
/\[IMAGE_REGION:\s*page=(\d+),\s*bbox=\[([\d.]+),([\d.]+),([\d.]+),([\d.]+)\]/g
```

**预估改动**：~20 行，10 分钟

---

### 方案 B：不裁剪，用整页截图 + 高亮区域（推荐）

放弃精确裁剪，改为：
1. 存储整页 PNG（已有 `persistSourcePageImages`）
2. LLM 只输出 bbox 坐标，不裁剪
3. 前端显示整页截图，用 CSS 高亮 bbox 区域（红色边框）
4. 点击可放大查看

```tsx
// 前端伪代码
<div className="relative">
  <img src={pageImageUrl} />
  <div className="absolute border-2 border-red-500"
       style={{ left: bbox.x1, top: bbox.y1, width: bbox.w, height: bbox.h }} />
</div>
```

**优点**：
- 永远不会"显示不全" — 整页都在
- 不依赖 bbox 精确度 — bbox 只用于高亮，不裁剪
- 不需要 cropImageBuffer — 减少一步处理

**缺点**：
- 图片更大（整页 vs 裁剪区域）
- 需要前端计算 bbox 相对位置

**预估改动**：~50 行前端 + ~10 行后端

---

### 方案 C：双重保险 — 裁剪图 + 整页图都存

1. 裁剪图用于内联显示（题干中的 `![](url)`）
2. 整页截图用于"PDF 原页参考"面板
3. 裁剪失败时自动 fallback 到整页截图

这是当前架构最自然的演进方向 — `pageImages` 已经实现了整页截图存储，只是还没和裁剪图联动。

**预估改动**：~30 行

---

## 推荐路径

**短期（立即）**：方案 A — 改 prompt + 加大边距 + 修正则，10 分钟搞定
**中期**：方案 C — 裁剪图 + 整页图双保险
**长期**：方案 B — 完全放弃裁剪，前端高亮展示
