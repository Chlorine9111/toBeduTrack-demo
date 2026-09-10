import { Extension } from "@tiptap/core";

/**
 * Interview/demo replacement for the commercial Tiptap Pro extensions.
 *
 * It deliberately preserves the integration boundary used by the editor so
 * reviewers can see where AI editing and DOCX export plug in. The commands do
 * not call Tiptap Cloud or generate files in this checkout.
 */

export type OnAiEventContext = Record<string, unknown>;
export type OnSuccessContext = Record<string, unknown>;

type PlaceholderDocxExportOptions = {
  customNodes?: unknown[];
  styleOverrides?: Record<string, unknown>;
  exportType?: string;
  onCompleteExport?: (result: unknown) => void;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tiptapProPlaceholder: {
      exportDocx: (options: PlaceholderDocxExportOptions) => ReturnType;
    };
  }
}

export const Ai = Extension.create({
  name: "tiptapProAiPlaceholder",
});

export const ExportDocx = Extension.create({
  name: "tiptapProExportDocxPlaceholder",
  addCommands() {
    return {
      exportDocx:
        (_options: PlaceholderDocxExportOptions) =>
        () =>
          false,
    };
  },
});
