"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { useDocumentAutosave } from "@/components/editor/useDocumentAutosave";
import type { EditorDocument } from "@/lib/documents/types";
import type { ContentLibraryDetail } from "@/lib/content-library/types";

const TiptapDocumentEditor = dynamic(
  () => import("@/components/doc-engine/TiptapDocumentEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-6 py-10">
        <div className="flex items-center gap-3 text-sm text-[#1D1D1F]/60">
          <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#5E6AD2] border-t-transparent" />
          正在加载文档编辑器...
        </div>
      </div>
    ),
  },
);

type ContentLibraryDocumentBootstrapResponse = {
  item: ContentLibraryDetail;
  document: EditorDocument;
};

async function readDocument(documentId: string) {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`读取文档失败 (${response.status})`);
  }

  const payload = (await response.json()) as { document: EditorDocument | null };
  if (!payload.document) {
    throw new Error("统一文档详情为空");
  }
  return payload.document;
}

async function ensureContentLibraryDocument(itemId: string) {
  const response = await fetch(
    `/api/content-library/${encodeURIComponent(itemId)}/document`,
    {
      method: "POST",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`创建统一文档失败 (${response.status})`);
  }

  return (await response.json()) as ContentLibraryDocumentBootstrapResponse & {
    created: boolean;
  };
}

export function EditableContentLibraryDocument({
  item,
  html,
  onItemChange,
}: {
  item: ContentLibraryDetail;
  html: string;
  onItemChange?: (item: ContentLibraryDetail) => void;
}) {
  const [currentItem, setCurrentItem] = useState(item);
  const initialHtml = normalizeDocumentHtml(html);
  const currentHtmlRef = useRef(initialHtml);
  const [editorHtml, setEditorHtml] = useState(initialHtml);
  const [legacySaveState, setLegacySaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [connecting, setConnecting] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [linkedDocument, setLinkedDocument] = useState<EditorDocument | null>(null);
  const linkedDocumentIdRef = useRef<string | null>(item.documentId ?? null);
  const isReadOnlyDocument = Boolean(linkedDocument?.readOnly || currentItem.metadata?.readOnly === true);

  const { save, flush, saveStatus, error: saveError } = useDocumentAutosave({
    documentId: linkedDocument?.id ?? null,
    version: linkedDocument?.version ?? 1,
    onSaved: ({ version, savedAt, data }) => {
      setLinkedDocument((previous) =>
        previous
          ? {
              ...previous,
              title: data.title,
              htmlContent: data.htmlContent,
              properties: data.properties,
              version,
              updatedAt: savedAt,
            }
          : previous,
      );

      setCurrentItem((previous) => {
        const nextItem = {
          ...previous,
          documentId: linkedDocumentIdRef.current ?? previous.documentId,
          metadata: {
            ...previous.metadata,
            documentId: linkedDocumentIdRef.current ?? previous.documentId,
            documentHtml: data.htmlContent,
            sourceDocumentVersion: version,
          },
        };
        onItemChange?.(nextItem);
        return nextItem;
      });
    },
  });

  useEffect(() => {
    const nextHtml = normalizeDocumentHtml(html);
    currentHtmlRef.current = nextHtml;
    setEditorHtml(nextHtml);
    setCurrentItem(item);
    setLinkedDocument(null);
    linkedDocumentIdRef.current = item.documentId ?? null;
    setLegacySaveState("idle");
    setConnectError(null);
    setConnecting(true);
  }, [html, item.id, item.documentId]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const result = item.documentId
          ? {
              item,
              document: await readDocument(item.documentId),
            }
          : await ensureContentLibraryDocument(item.id);

        if (cancelled) return;

        const nextItem = result.item;
        const nextDocument = result.document;
        const nextHtml = normalizeDocumentHtml(
          nextDocument.htmlContent || currentHtmlRef.current,
        );

        currentHtmlRef.current = nextHtml;
        setEditorHtml(nextHtml);
        setCurrentItem(nextItem);
        setLinkedDocument(nextDocument);
        linkedDocumentIdRef.current = nextDocument.id;
        setConnectError(null);
        onItemChange?.(nextItem);
      } catch (error) {
        if (cancelled) return;
        setConnectError(error instanceof Error ? error.message : "连接统一文档失败");
      } finally {
        if (!cancelled) {
          setConnecting(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [item.id, item.documentId, onItemChange]);

  const handleLegacySave = useCallback(
    async (nextHtml: string) => {
      setLegacySaveState("saving");
      try {
        const response = await fetch(`/api/content-library/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentHtml: nextHtml,
          }),
        });
        if (!response.ok) {
          throw new Error("保存内容库文档失败");
        }
        const payload = (await response.json()) as ContentLibraryDetail;
        const nextHtmlContent =
          typeof payload.metadata?.documentHtml === "string"
            ? payload.metadata.documentHtml
            : nextHtml;
        currentHtmlRef.current = nextHtmlContent;
        setEditorHtml(nextHtmlContent);
        setCurrentItem(payload);
        onItemChange?.(payload);
        setLegacySaveState("saved");
        window.setTimeout(() => setLegacySaveState("idle"), 1800);
      } catch {
        setLegacySaveState("error");
        window.setTimeout(() => setLegacySaveState("idle"), 2400);
      }
    },
    [item.id, onItemChange],
  );

  const handleDocumentHtmlChange = useCallback(
    (nextHtml: string) => {
      if (nextHtml.trim() === currentHtmlRef.current.trim()) {
        return;
      }

      currentHtmlRef.current = nextHtml;
      if (!linkedDocument) {
        return;
      }

      save({
        title: linkedDocument.title || currentItem.displayTitle || currentItem.title,
        htmlContent: nextHtml,
        properties: linkedDocument.properties ?? [],
      });
    },
    [currentItem.displayTitle, currentItem.title, linkedDocument, save],
  );

  if (connecting && !linkedDocument && !connectError) {
    return (
      <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-6 py-10">
        <div className="flex items-center gap-3 text-sm text-[#1D1D1F]/60">
          <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#5E6AD2] border-t-transparent" />
          正在连接统一文档...
        </div>
      </div>
    );
  }

  if (!linkedDocument) {
    return (
      <div className="space-y-3">
        {connectError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
            {connectError}，已回退到兼容保存链路。
          </div>
        ) : null}
        <TiptapDocumentEditor
          html={editorHtml}
          onHtmlChange={(nextHtml) => {
            currentHtmlRef.current = nextHtml;
          }}
          onSave={handleLegacySave}
          saveState={legacySaveState}
          className="rounded-2xl"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {connectError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          {connectError}
        </div>
      ) : null}
      {saveError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {saveError}
        </div>
      ) : null}
      {isReadOnlyDocument ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700">
          当前文档为只读内容，正文不能直接编辑。
        </div>
      ) : null}
      <TiptapDocumentEditor
        html={editorHtml}
        onHtmlChange={handleDocumentHtmlChange}
        onSave={async (nextHtml) => {
          currentHtmlRef.current = nextHtml;
          await flush({
            title: linkedDocument.title || currentItem.displayTitle || currentItem.title,
            htmlContent: nextHtml,
            properties: linkedDocument.properties ?? [],
          });
        }}
        saveState={
          saveStatus === "saving"
            ? "saving"
            : saveStatus === "saved"
              ? "saved"
              : saveStatus === "error"
                ? "error"
                : "idle"
        }
        readOnly={isReadOnlyDocument}
        className="rounded-2xl"
      />
    </div>
  );
}
