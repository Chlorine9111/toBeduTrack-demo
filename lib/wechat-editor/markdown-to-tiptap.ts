import type { Editor } from "@tiptap/core";

export function preprocessMarkdownForTiptap(markdown: string): string {
  return markdown
    .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
    .replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>");
}

export function appendMarkdownToEditor(editor: Editor, markdown: string) {
  const processed = preprocessMarkdownForTiptap(markdown).trim();
  if (!processed) return;

  editor
    .chain()
    .focus("end")
    .insertContent(processed)
    .run();
}

export function replaceEditorWithMarkdown(editor: Editor, markdown: string) {
  const processed = preprocessMarkdownForTiptap(markdown).trim();
  editor.commands.setContent(processed || "<p></p>");
}
