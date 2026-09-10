# Design Tokens

## Colors — Light Mode

### Core
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-page` | `#FFFFFF` | Page canvas |
| `--bg-surface` | `#F7F6F3` | Sidebar, hover, section alternates |
| `--bg-surface-light` | `#FBFAF8` | Lighter surface variant |
| `--text-primary` | `#37352F` / `rgb(55,53,47)` | All headings and body. NEVER use #000 |
| `--text-secondary` | `rgba(55,53,47,0.6)` | Descriptions, timestamps |
| `--text-tertiary` | `rgba(55,53,47,0.4)` | Placeholders, hints, disabled |
| `--text-muted` | `#9B9A97` | Breadcrumbs, faint labels |
| `--border-default` | `rgba(55,53,47,0.16)` | Card borders, dividers |
| `--border-subtle` | `rgba(55,53,47,0.09)` | Faint divisions, section breaks |
| `--hover-bg` | `rgba(55,53,47,0.04)` | Row hover, light interaction |
| `--hover-bg-strong` | `rgba(55,53,47,0.08)` | Sidebar item hover, button hover |
| `--active-bg` | `rgba(55,53,47,0.16)` | Active/pressed state |
| `--accent-link` | `#2383E2` | Hyperlinks, focus rings |
| `--accent-focus` | `rgba(35,131,226,0.28)` | Input focus ring |

### Semantic Tags (background + text pairs)
| Name | Background | Text |
|------|-----------|------|
| Gray | `#EBECED` | `#9B9A97` |
| Brown | `#E9E5E3` | `#64473A` |
| Orange | `#FAEBDD` | `#D9730D` |
| Yellow | `#FBF3DB` | `#DFAB01` |
| Green | `#DDEDEA` | `#0F7B6C` |
| Blue | `#DDEBF1` | `#0B6E99` |
| Purple | `#EAE4F2` | `#6940A5` |
| Pink | `#F4DFEB` | `#AD1A72` |
| Red | `#FBE4E4` | `#E03E3E` |

### Document Type → Color Mapping
| Type | Color | Icon |
|------|-------|------|
| Rubric | Green | ClipboardList |
| Worksheet | Blue | FileText |
| Exam | Orange | FileCheck |
| Lesson Plan | Purple | BookOpen |
| PBL | Pink | Lightbulb |

## Typography

### Font
```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
```

### Scale — Product UI
| Element | Size | Weight | Line-height |
|---------|------|--------|-------------|
| Page title | 24px | 600 | 1.3 |
| Section heading | 20px | 600 | 1.3 |
| Card title | 16px | 500 | 1.4 |
| Body | 16px | 400 | 1.5 |
| UI label / sidebar item | 14px | 500 | 1.4 |
| Small body | 14px | 400 | 1.5 |
| Caption / metadata | 13px | 400 | 1.4 |
| Tag / badge text | 12px | 500 | 1.0 |
| Tiny label | 11px | 500 | 1.2 |

### Scale — Marketing
| Element | Desktop | Mobile | Weight |
|---------|---------|--------|--------|
| Hero headline | 64–80px | 36–44px | 700 |
| Section headline | 40–48px | 28–32px | 700 |
| Sub-headline | 20–24px | 18–20px | 400 |
| Feature title | 24–28px | 20–24px | 600 |
| Body | 18px | 16px | 400 |
| Nav link | 15px | — | 500 |
| CTA button text | 15px | 15px | 500 |

### Rules
- Headings: letter-spacing `-0.02em` at sizes ≥40px
- Max content width: `720px` (product), `1100px` (marketing)
- Sentence case everywhere. Never ALL CAPS.

## Spacing (8px grid)

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Icon-to-text gap inside buttons |
| `sm` | 8px | Between list items, compact padding |
| `md` | 12px | Card inner padding, input padding |
| `base` | 16px | Standard gap between elements |
| `lg` | 24px | Section sub-gaps, card padding |
| `xl` | 32px | Between content groups |
| `2xl` | 48px | Section separation (product) |
| `3xl` | 64px | Footer top padding |
| `4xl` | 96px | Marketing section padding (desktop) |
| `5xl` | 120px+ | Hero section top padding |

### Key measurements
| Element | Value |
|---------|-------|
| Icon sidebar width | 56px |
| Sidebar expanded width | 240px |
| Navbar height (marketing) | 52px |
| Toolbar height (product) | 52px |
| Content max-width (product) | 720px |
| Content max-width (marketing) | 1100px |
| Page horizontal padding (desktop) | 32px |
| Page horizontal padding (mobile) | 16px |

## Border Radius

| Usage | Value |
|-------|-------|
| Buttons, inputs, tags | 8px |
| Cards, panels, dropdowns | 12px |
| Pills, badges | 999px |
| Avatars | 50% |
| Marketing hero images | 12px |

## Shadows (hover only, never at rest)

| Usage | Value |
|-------|-------|
| Card hover | `0 2px 8px rgba(55,53,47,0.08)` |
| Dropdown / popover | `0 4px 16px rgba(55,53,47,0.12)` |
| Modal | `0 16px 48px rgba(55,53,47,0.12)` |
| Sidebar expanded overlay | `4px 0 16px rgba(55,53,47,0.06)` |
| Input focus ring | `0 0 0 2px rgba(35,131,226,0.28)` |

## Breakpoints

| Name | Width |
|------|-------|
| Mobile | < 768px |
| Tablet | 768–1024px |
| Desktop | > 1024px |
| Large | > 1440px |
