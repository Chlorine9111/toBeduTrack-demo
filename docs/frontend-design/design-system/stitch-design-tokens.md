# Stitch Design Tokens

从 Stitch 生成的 clipboard HTML 中提取的设计变量，供项目实现时参考。

## Color Tokens (Material Design 3 色彩系统)

### Primary
| Token | Value | 用途 |
|-------|-------|------|
| `primary` | `#615e57` | 主色 |
| `primary-dim` | `#55524c` | 主色弱化 |
| `primary-fixed` | `#e7e2d9` | 主色固定 |
| `primary-fixed-dim` | `#d9d4cb` | 主色固定弱化 |
| `primary-container` | `#e7e2d9` | 主色容器 |
| `on-primary` | `#fdf7ee` | 主色上文字 |
| `on-primary-container` | `#54514b` | 主色容器上文字 |
| `on-primary-fixed` | `#413f39` | 主色固定上文字 |
| `on-primary-fixed-variant` | `#5e5b54` | 主色固定变体上文字 |
| `inverse-primary` | `#fef9ef` | 反转主色 |

### Secondary
| Token | Value | 用途 |
|-------|-------|------|
| `secondary` | `#2383E2` | 次色（蓝色强调） |
| `secondary-dim` | `#005499` | 次色弱化 |
| `secondary-fixed` | `#d4e3ff` | 次色固定 |
| `secondary-fixed-dim` | `#bcd6ff` | 次色固定弱化 |
| `secondary-container` | `#d4e3ff` | 次色容器 |
| `on-secondary` | `#f8f8ff` | 次色上文字 |
| `on-secondary-container` | `#005397` | 次色容器上文字 |
| `on-secondary-fixed` | `#004077` | 次色固定上文字 |
| `on-secondary-fixed-variant` | `#005ca8` | 次色固定变体上文字 |

### Tertiary
| Token | Value | 用途 |
|-------|-------|------|
| `tertiary` | `#5e5f5d` | 第三色 |
| `tertiary-dim` | `#525351` | 第三色弱化 |
| `tertiary-fixed` | `#f4f3f0` | 第三色固定 |
| `tertiary-fixed-dim` | `#e6e5e2` | 第三色固定弱化 |
| `tertiary-container` | `#f4f3f0` | 第三色容器 |
| `on-tertiary` | `#faf9f6` | 第三色上文字 |
| `on-tertiary-container` | `#5b5c5a` | 第三色容器上文字 |
| `on-tertiary-fixed` | `#494a48` | 第三色固定上文字 |
| `on-tertiary-fixed-variant` | `#666664` | 第三色固定变体上文字 |

### Surface
| Token | Value | 用途 |
|-------|-------|------|
| `surface` | `#fef9ef` | 表面 |
| `surface-dim` | `#e1dac3` | 表面弱化 |
| `surface-bright` | `#fef9ef` | 表面亮 |
| `surface-tint` | `#615e57` | 表面着色 |
| `surface-variant` | `#e9e2ce` | 表面变体 |
| `surface-container-lowest` | `#ffffff` | 最低层容器 |
| `surface-container-low` | `#f9f3e7` | 低层容器 |
| `surface-container` | `#f4eddf` | 容器 |
| `surface-container-high` | `#eee8d6` | 高层容器 |
| `surface-container-highest` | `#e9e2ce` | 最高层容器 |
| `on-surface` | `#363225` | 表面上文字 |
| `on-surface-variant` | `#635f4f` | 表面变体上文字 |
| `inverse-surface` | `#0f0e09` | 反转表面 |
| `inverse-on-surface` | `#a09c95` | 反转表面上文字 |

### Error
| Token | Value | 用途 |
|-------|-------|------|
| `error` | `#9e422c` | 错误色 |
| `error-dim` | `#5c1202` | 错误色弱化 |
| `error-container` | `#fe8b70` | 错误容器 |
| `on-error` | `#fff7f6` | 错误色上文字 |
| `on-error-container` | `#742410` | 错误容器上文字 |

### Background & Outline
| Token | Value | 用途 |
|-------|-------|------|
| `background` | `#fef9ef` | 背景 |
| `on-background` | `#363225` | 背景上文字 |
| `outline-solid` | `#7f7b6a` | 轮廓线 |
| `outline-variant` | `#b8b29f` | 轮廓线变体 |

## Typography

### Font Family
| Token | Value |
|-------|-------|
| `headline` | `Inter` |
| `body` | `Inter` |
| `label` | `Inter` |

### Base Styles
```css
body {
  font-family: 'Inter', sans-serif;
  background-color: #ffffff;
  color: #37352F;
}
```

## Border Radius

| Token | Value |
|-------|-------|
| `DEFAULT` | `0.25rem` (4px) |
| `lg` | `0.5rem` (8px) |
| `xl` | `0.75rem` (12px) |
| `full` | `9999px` |

## Icon System

使用 Google Material Symbols Outlined：
```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

## 额外硬编码颜色（出现在 HTML class 中）

从 clipboard HTML 中观察到的非 token 颜色：

| Color | Hex | 用途 |
|-------|-----|------|
| Notion-like text | `#37352F` | 正文主色 |
| Notion-like bg | `#F7F6F3` | 侧边栏背景 |
| Light divider | `#37352F/10` | 分割线（10% 透明） |
| Muted text | `#37352F/40` | 辅助文字（40% 透明） |
| Muted text | `#37352F/60` | 次要文字（60% 透明） |

## Tailwind Config 模板

```javascript
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#615e57",
        "secondary": "#2383E2",
        "tertiary": "#5e5f5d",
        "surface": "#fef9ef",
        "background": "#fef9ef",
        "error": "#9e422c",
        "on-surface": "#363225",
        "on-primary": "#fdf7ee",
        "on-secondary": "#f8f8ff",
        "outline-solid": "#7f7b6a",
        "outline-variant": "#b8b29f",
        // ... 完整列表见上方各分类表格
      },
      fontFamily: {
        "headline": ["Inter"],
        "body": ["Inter"],
        "label": ["Inter"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
    },
  },
}
```
