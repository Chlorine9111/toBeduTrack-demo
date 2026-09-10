# Shared Overlays

Global UI elements available from any page.

## 1. Command Search (Cmd+K)

Trigger: Cmd+K keyboard shortcut OR click Search icon in sidebar.

### Layout
Centered modal. Width 560px, max-height 480px. Background `#FFFFFF`, border-radius 12px, shadow `0 16px 48px rgba(55,53,47,0.12)`. Backdrop: `rgba(55,53,47,0.3)`.

### Top: search input
Height 48px, no border, font-size 16px. Left: Search icon (20px, color tertiary). Right: "ESC" pill (12px, bg `#F7F6F3`). Bottom border `rgba(55,53,47,0.09)`.

### Results area (scrollable)

**Empty state (no query typed)**:
Label "Recent" (12px, weight 500, color secondary, padding 8px 16px). Then 5 recent items.

**With query**:
Results grouped by type with group headers ("Documents", "Questions", "Settings"). Each header: 11px, weight 500, color tertiary, uppercase, padding 8px 16px.

**Each result row**:
Height 40px, padding 0 16px. Left: type icon (16px). Center: title (14px, weight 500). Right: path hint (12px, color tertiary, e.g. "Library → Rubrics"). Hover: bg `rgba(55,53,47,0.04)`.

Keyboard: ↑↓ move highlight, Enter opens, ESC closes.

## 2. Export Dropdown

Trigger: "Export" button click (appears in Agent, Document Detail, Lesson Plan Studio, PBL Detail).

### Layout
Dropdown below trigger button. Width 240px. Background `#FFFFFF`, border-radius 8px, shadow `0 4px 16px rgba(55,53,47,0.12)`, border `1px solid rgba(55,53,47,0.09)`. Padding 8px 0.

### Content sections (separated by divider lines)

**Format section**: Label "Format" (11px, weight 500, color tertiary, padding 4px 12px). Options each 36px tall, padding 0 12px: icon (16px) + text (14px). Selected: blue checkmark right side.
- PDF
- DOCX
- Print
- Copy to Clipboard

**Version section** (only for Lesson Plans):
Label "Version". Options: Teacher Edition / Student Edition / Classroom Edition.

**Settings section**:
Label "Settings". Paper: A4 | Letter (two pill buttons, single select). Layout: Standard | Compact (two pill buttons).

**Bottom**: "Export" confirm button, primary dark, full width within dropdown, height 36px, margin 8px 12px.

## 3. Confirm Dialog

Trigger: any delete or irreversible action.

### Layout
Centered modal. Width 400px. Background `#FFFFFF`, border-radius 12px, shadow same as search. Backdrop same. Padding 24px.

### Content
Top center: icon container (48px circle, bg `#FBF3DB`, AlertTriangle icon 24px color `#DFAB01`).

Title: 18px, weight 600, centered. E.g. "Delete this document?"

Description: 14px, color secondary, centered. E.g. "This action cannot be undone."

### Buttons (right-aligned row, gap 8px)
- "Cancel" (ghost button)
- "Delete" (danger button: bg `#E03E3E`, white text)

## 4. Toast Notifications

Position: fixed bottom-right, 24px from edge. Multiple toasts stack vertically, gap 8px.

### Toast card
Width 320px. Background `#FFFFFF`, border-radius 8px, shadow `0 4px 12px rgba(55,53,47,0.1)`, border `1px solid rgba(55,53,47,0.09)`. Padding 12px 16px.

Left accent border: 3px, color varies by type.

Content: icon (16px) + title (14px, weight 500) + optional description (13px, color secondary) + close X button (right side).

### Types
| Type | Icon | Left border | Icon color |
|------|------|------------|------------|
| Success | CheckCircle | `#0F7B6C` | `#0F7B6C` |
| Error | XCircle | `#E03E3E` | `#E03E3E` |
| Info | Info | `#0B6E99` | `#0B6E99` |

Auto-dismiss after 4s: fade out + slide right animation.
