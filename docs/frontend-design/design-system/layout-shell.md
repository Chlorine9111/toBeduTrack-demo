# Layout Shell — Product Pages

All `/main/*` routes share this shell. It wraps every product page.

## Structure

```
┌──────┬─────────────────────────────────┐
│ 56px │         Main content            │
│      │         (page-specific)         │
│ Icon │                                 │
│ side │                                 │
│ bar  │                                 │
│      │                                 │
│      │                                 │
└──────┴─────────────────────────────────┘
```

## Icon Sidebar (56px)

Fixed left, full viewport height. Background `#F7F6F3`. All items centered horizontally.

### Top section (top: 16px)
- Logo icon: 24x24px, Deskmate brand mark

### Main nav (top: 56px, gap: 4px between items)
Each item: icon 20px inside a 40x40px hit area, border-radius 8px.
- Default icon color: `rgba(55,53,47,0.4)`
- Active page: icon color `#37352F`, bg `rgba(55,53,47,0.08)`
- Hover: bg `rgba(55,53,47,0.08)`

Nav items top to bottom:
1. Search (Search icon) — triggers Cmd+K overlay, see shared-overlays.md
2. Agent (Sparkles icon) → `/main/agent`
3. Library (FolderOpen icon) → `/main/library`（统一文档库）
4. Question Bank (Database icon) → `/main/question-bank`
5. Grading (ClipboardCheck icon) → `/main/grading`
6. Lesson Plans (BookOpen icon) → `/lesson-plans`

补充：
- 内容库正式入口是 `/main/content-library`，不占用侧边栏主导航位；搜索结果、Peek、PBL 详情与 Agent 产物跳转到内容库时，都应落到这一路由。

### Separator
After item 6: horizontal line 24px wide, color `rgba(55,53,47,0.09)`, 8px margin top/bottom.

### Secondary nav
7. Templates (Layout icon) → `/main/templates`
8. WeChat Editor (FileEdit icon) → `/main/wechat-editor`

### Bottom section (fixed to bottom: 16px)
9. Settings (Settings icon) → `/main/settings`
10. User avatar: 20x20px circle, initials fill

## Expanded state

On hover over sidebar OR click on any icon:
- Width animates from 56px to 240px, duration 200ms ease-out
- Position: absolute/overlay, does NOT push main content
- Each icon shows text label to its right: 14px, weight 500, color `#37352F`
- Bottom shows: user name (14px weight 500) + plan badge pill ("Free"/"Pro")
- Click outside or mouse leave → collapse back to 56px

## Main content area

Takes remaining width after sidebar. Background `#FFFFFF`. Each page renders inside this area. No shared header bar — each page defines its own top section.

## Mobile (< 768px)

Sidebar becomes a bottom tab bar, height 56px, fixed to bottom. Show only top 5 nav items as icons in a horizontal row. "More" icon opens a slide-up sheet with remaining items.
