"use client";

import TiptapDocumentEditor from "@/components/doc-engine/TiptapDocumentEditor";

type SkillDocumentEngineProps = {
  html: string;
  onHtmlChange?: (html: string) => void;
  className?: string;
  documentMeta?: Record<string, string | undefined>;
  readOnly?: boolean;
  onSave?: (html: string) => Promise<void> | void;
  saveState?: "idle" | "saving" | "saved" | "error";
  saveLabel?: string;
};

export default function SkillDocumentEngine(props: SkillDocumentEngineProps) {
  return <TiptapDocumentEditor {...props} />;
}
