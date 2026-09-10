# Page Map

## Route Tree

```
/ ............................ Landing page (marketing-shell)
/pricing .................... Pricing (marketing-shell)
/about ...................... About (marketing-shell)
/blog ....................... Blog list (marketing-shell)
/blog/[slug] ................ Blog post (marketing-shell)
/privacy .................... Privacy policy (marketing-shell)
/terms ...................... Terms of service (marketing-shell)
/lp/[slug] .................. Public lesson plan (standalone, no shell)

/auth/login ................. Login (auth-shell)
/auth/register .............. Register (auth-shell)
/auth/forgot-password ....... Forgot password (auth-shell)
/auth/update-password ....... Update password (auth-shell)

/onboarding/basic-info ...... Step 1 (onboarding-shell)
/onboarding/subjects ........ Step 2 (onboarding-shell)
/onboarding/get-started ..... Step 3 (onboarding-shell)

/main/agent ................. Agent workspace (layout-shell)
/main/library ............... Document library list (layout-shell)
/main/library/[id] .......... Document detail (layout-shell)
/main/content-library ....... Content library list + detail drawer (layout-shell)
/main/question-bank ......... Question bank (layout-shell)
/main/grading ............... Grading (layout-shell)
/main/templates ............. Template browser (layout-shell)
/main/wechat-editor ......... WeChat editor (layout-shell)
/main/settings .............. Settings (layout-shell)
/main/feedback .............. Feedback (layout-shell)
/main/upgrade ............... Upgrade (layout-shell)
/main/pbl/create ............ PBL create (layout-shell)
/main/pbl/[id] .............. PBL detail (layout-shell)
/lesson-plans ............... Lesson plan studio (layout-shell, custom 3-col)
```

## Cross-Page Dependencies

These pages share rendering logic or link to each other:

```
Agent workspace
  ├── generates → Document Detail (user clicks "Open in Library")
  ├── triggers → PBL Create (from quick action card)
  └── uses → Export Dropdown (shared overlay)

Library list
  └── links to → Document Detail (click any row)

Document Detail
  ├── renders all doc types (Rubric table, Worksheet questions, Exam sections, Lesson Plan blocks)
  ├── shares block renderer with → Lesson Plan Studio, PBL Detail, Public LP page
  └── uses → Export Dropdown

Grading
  ├── selects Rubric from → Library (step 1 of new session)
  └── drills into → Student detail view (internal state, not new route)

Lesson Plan Studio
  ├── shares block types with → Document Detail, Public LP page
  └── uses → Export Dropdown, AI Assistant side panel

PBL Detail
  ├── shares rendering with → Document Detail (for rubric table section)
  └── uses → Export Dropdown

Templates
  └── "Use template" → navigates to Agent workspace with pre-filled params

Public LP (/lp/[slug])
  ├── shares block renderer with → Document Detail, Lesson Plan Studio
  └── contains "Made with Deskmate" CTA → links to Landing page
```

## Shared Component Map

```
<DocumentRenderer />  →  Document Detail, Lesson Plan Studio (preview),
                          PBL Detail (rubric section), Public LP page

<ExportDropdown />    →  Agent, Document Detail, Lesson Plan Studio, PBL Detail

<FilterTabs />        →  Library, Question Bank, Templates

<SemanticTag />       →  Every page that shows doc type or subject tags

<StepProgress />      →  Onboarding (3 steps), Grading new session (3 steps),
                          WeChat Editor (4 steps)
```
