# Deskmate Landing Page - Design Prompt

## Context

Deskmate is an AI-powered teaching assistant for AP Calculus teachers. The landing page features an interactive demo that walks visitors through a 3-step lesson preparation workflow: **Rubric** → **Worksheet** → **Exam**.

The page needs a complete visual redesign. The functionality and interactions described below must be preserved — only the visual design, layout, typography, colors, spacing, and overall aesthetics need to be reimagined.

**Tech stack**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Motion (framer-motion), KaTeX, @dnd-kit, jsPDF.

---

## Page Structure

### Hero Section
- Brand logo: "Deskmate"
- Two-line headline (e.g., "From rubrics to exams, / 3 minutes flat.")
- Subtitle describing the product
- CTA button that scrolls to the demo section
- Language toggle (EN / 中文) in the top-right corner

### Tab Navigation Bar
- 3 tabs: Rubric (1), Worksheet (2), Exam (3)
- Each tab shows a step number badge or a green checkmark when completed
- Active tab has a distinct highlight style
- Small hint text below: "Press Tab to switch"
- Keyboard support: Tab key cycles through tabs

### Interactive Demo Area (main content)
- **Left panel (35%)**: AI Chat interface
- **Right panel (65%)**: Content panel (Rubric / Worksheet / Exam depending on active tab)
- Responsive: stacks vertically on mobile

### CTA Section (below demo)
- Headline + subtitle
- Email input + submit button
- Success state with confirmation message
- Social proof text ("200+ AP teachers on the waitlist")

### Footer
- Single line with brand tagline

---

## Left Panel: AI Chat Interface

### Layout
- Header bar: AI avatar + "Deskmate AI" label + Skip button
- Scrollable message area
- Messages are AI bubbles (left-aligned) or user bubbles (right-aligned)

### Interactive Elements
1. **AI messages**: Appear with typewriter effect (character by character)
2. **Thinking bubble**: 3 animated bouncing dots + status text (e.g., "Analyzing learning objectives..."). Shows for ~1.8s before AI responds
3. **Option buttons**: User choices appear at the bottom of the chat. One primary option is highlighted. Auto-selects after 3.5s
4. **Skip button**: In the header, instantly completes all chat steps and triggers the right panel

### Chat Flows

**Rubric flow (3 steps)**:
1. AI greeting + 3 options → user picks "draft a rubric"
2. Thinking → AI describes learning objectives (typewriter)
3. Thinking → "Rubric generated" → triggers right panel

**Worksheet flow (3 steps)**:
1. AI asks about creating a matching worksheet → user confirms
2. Thinking → AI describes 4-tier scaffolded design (typewriter)
3. Thinking → "Worksheet ready" → triggers right panel

**Exam flow (1 step)**:
1. Thinking → AI describes compiled quiz → triggers right panel immediately

---

## Right Panel 1: Rubric Panel

### Loading State
- Skeleton placeholder with shimmer animation (3 card-shaped placeholders)
- Transition: 1.2s delay after chat trigger, then content fades in

### Content

**Header area**:
- Panel title: "FRQ Scoring Rubric"
- Subtitle: "Unit 3: Chain Rule | Total: 9 points"

**3 Part cards** (staggered entrance animation):

Each Part card contains:
- **Collapsible header**: Part label (e.g., "Part (a)"), title with LaTeX math, point total, chevron icon
- **Sortable criterion rows** (drag-and-drop):
  - Drag handle (grip icon, visible on hover)
  - Description text with LaTeX math formulas
  - Editable point pill (click to edit, 0-5 range, enter/blur to save)
  - Delete button (visible on hover, disabled when only 1 item remains)

**Data**:
- Part (a): "Compute f'(x) using Chain Rule" — 3 criteria, 3 points
- Part (b): "Find the tangent line at x = a" — 3 criteria, 3 points
- Part (c): "Determine and justify extrema of f" — 3 criteria, 3 points

### Guide Bar (bottom)
- Appears after 10s or after first user interaction
- Shows: "Rubric ready ✓" + "Build a matching worksheet?" + CTA button
- Button click: marks Rubric complete, switches to Worksheet tab

---

## Right Panel 2: Worksheet Panel

### Loading State
- 4 card-shaped skeleton placeholders with shimmer

### Content

**Header area**:
- BookOpen icon + title: "Computational Thinking Worksheet"
- Subtitle: "Unit 3: Chain Rule | AP Calculus AB"
- **Difficulty toggle**: Standard / Advanced (pill-style toggle, Advanced shows sparkle icon)
- Student info fields: "Name: ___" / "Date: ___"

**4 Step cards** (staggered entrance, each card has a colored left border and step badge):

| Step | Color | Title | Content |
|------|-------|-------|---------|
| 1 | Blue | Concept Check | 3 identification problems — determine if Chain Rule applies, identify outer/inner functions |
| 2 | Violet | Guided Practice | 1 derivative problem with collapsible **Hint Box** (4 scaffolded steps, show/hide toggle) |
| 3 | Amber | Independent Practice | Standard: 4 basic derivatives. Advanced: 4 advanced problems (implicit, parametric, logarithmic differentiation) |
| 4 | Rose | Challenge | Standard: 2 nested Chain Rule problems. Advanced: 2 synthesis problems (FTC + Chain Rule, table-based) |

### Key Interactions
- **Standard/Advanced toggle**: Switches Step 3 and 4 content with crossfade animation
- **Hint Box** (Step 2 only):
  - Toggle button: Show/Hide hints
  - Hidden state: colored bars + "4 steps hidden" text
  - Shown state: numbered steps with math content
- **Collapsible cards**: Click header to expand/collapse (height animation)
- All math rendered with KaTeX

### Guide Bar
- "Worksheet ready ✓" + "Compile everything into a quiz?" + "Start Exam Assembly" button

---

## Right Panel 3: Exam Panel

### Loading State
- 6 card-shaped skeleton placeholders (5 short + 1 tall for FRQ)

### Content

**Header area**:
- **Editable title**: Click to edit exam name, default "AP Calculus AB — Unit 3 Chain Rule Quiz"
- Date label + total points (dynamically calculated)

**6 Question cards** (drag-and-drop sortable):

**5 Multiple Choice questions** (each collapsible):
- Collapsed: Q number badge, preview text (truncated LaTeX), difficulty badge (Easy/Medium/Hard with color coding), chevron
- Expanded: Full question, 4 options (A/B/C/D) with correct answer highlighted in green + checkmark, Explanation box with sparkle icon

| Q | Difficulty | Topic |
|---|-----------|-------|
| 1 | Easy | Basic Chain Rule: $(2x+5)^3$ |
| 2 | Easy | Trig Chain Rule: $\sin(4x)$ |
| 3 | Medium | Exponential Chain Rule: $e^{x^2-1}$ |
| 4 | Medium | Log Chain Rule: $\ln(\cos x)$ |
| 5 | Hard | Second derivative: $\sin(e^{2x})$ |

**1 Free Response question**:
- Collapsed: Q6 badge (rose accent), "Free Response" tag with Award icon, preview text, 4 part badges showing points, total points
- Expanded: Full question stem, 4 parts (a-d) each with:
  - Part label + points
  - Description
  - Rubric box (amber, with detailed scoring criteria)

**Difficulty badge colors**:
- Easy: green
- Medium: amber/yellow
- Hard: rose/red

### Bottom Stats Bar
- Question count: "5 MC + 1 FRQ"
- Difficulty distribution: "2 Easy, 2 Med, 2 Hard" (color-coded)
- Learning Objectives coverage: "FUN-3.C, FUN-3.D, FUN-3.E"

### Export Section (fixed at bottom)
- Two toggles: "Include answer key" / "Include rubric"
- "Export PDF" button:
  - Click: shows loading spinner → generates PDF → triggers download
  - After export: shows success overlay

---

## Export Overlay

- Semi-transparent backdrop with blur
- Centered card with:
  - Green checkmark icon (bounce animation)
  - "Exam exported successfully"
  - Product feature list (3 bullet points about the full product)
  - Two buttons: "Request beta access" (primary) + "Restart the demo" (secondary)

---

## Animation & Timing Requirements

| Element | Animation | Duration/Delay |
|---------|-----------|---------------|
| Hero elements | Fade in + slide up | Staggered 0.08s-0.35s |
| Tab switch | AnimatePresence crossfade | 150ms exit + 150ms enter |
| Thinking bubble | Fade in, 3 bouncing dots | 1.8s display |
| Chat typewriter | Character by character | 12ms/char |
| Option auto-select | — | 3.5s delay |
| Panel skeleton → content | Shimmer → fade in | 1.2s transition |
| Rubric Part cards | Fade + slide up | 0.15s + index × 0.2s |
| Worksheet Step cards | Fade + slide up | index × 0.5s |
| Exam stats bar | Fade + slide up | 0.4s delay |
| Exam export area | Fade in | 0.6s delay |
| Collapse/expand | Height + opacity | 0.25-0.3s |
| Drag item | Shadow + ring highlight | Instant |
| Delete item | Slide right + fade | 0.3s |

---

## Internationalization

- Full bilingual support: English (default) + Chinese
- Language toggle resets entire demo state
- All UI labels, chat content, panel data available in both languages
- Math formulas (LaTeX) remain identical in both languages

---

## Design Direction

The current implementation is functional but visually basic. Please create a design that:

1. **Feels premium and modern** — suitable for an EdTech SaaS product targeting AP teachers
2. **Emphasizes the interactive demo** as the hero experience
3. **Uses clear visual hierarchy** to guide users through the 3-step flow
4. **Makes math content legible and beautiful** — KaTeX formulas should feel native, not foreign
5. **Differentiates the 3 panels** with subtle but distinct visual themes while maintaining cohesion
6. **Has smooth, purposeful animations** that communicate state changes without being distracting
7. **Works well at all breakpoints** — mobile-first responsive design
8. **Avoids generic AI/SaaS aesthetics** — no purple gradients, no Inter font, no cookie-cutter layouts
