# Interview demo mode

This checkout keeps the teacher-facing application architecture and editor
integration points visible without requiring commercial services or a real
user account.

## Authentication behavior

- `/auth/login` and `/auth/register` share a stateless demo-entry form.
- Email and password fields are optional UI examples only.
- Credential values are not validated, transmitted, persisted, or used to
  create an account.
- OAuth, email verification, and password recovery are intentionally disabled.
- Local development uses the existing `AUTH_BYPASS` configuration; production
  bypass remains disabled by default.

## What remains functional

- The open-source Tiptap editor foundation
- Document sections, questions, answer spaces, tables, lists, and page breaks
- Inline and display math editing
- Highlighting, images, alignment, and placeholders

## Intentional placeholders

- Tiptap Pro AI editing
- Tiptap Pro DOCX export
- Unused Tiptap Pro comments and PDF-export dependencies

`lib/doc-engine/tiptap-pro-placeholder.ts` preserves the extension and command
boundaries. A production checkout can replace that adapter with the licensed
packages without changing the surrounding editor architecture.

## Excluded product areas

The interview checkout intentionally excludes partner-owned admissions,
counselor workspace, school matching, Feishu/Bitable, and cross-platform
messaging features, together with their dedicated routes, services, migrations,
tests, scripts, and internal implementation notes. They are not part of the
portfolio demonstration.

The public landing page remains available at `/`; the primary teacher workspace
starts at `/main/agent`.
