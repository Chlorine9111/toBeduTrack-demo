"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { DocumentModel } from "@/lib/doc-engine/block-types";
import type { DocGenerateRequest } from "@/lib/doc-engine/request-schema";
import {
  appendDraftBlock,
  createDraftDocumentFromMeta,
  type DocGenerateStreamEvent,
} from "@/lib/doc-engine/stream-events";

type StreamStatus = "idle" | "loading" | "streaming" | "complete" | "error";

type DocumentStreamState = {
  status: StreamStatus;
  document: DocumentModel | null;
  blocksGenerated: number;
  estimatedTotal: number | null;
  errorText: string;
};

const INITIAL_STATE: DocumentStreamState = {
  status: "idle",
  document: null,
  blocksGenerated: 0,
  estimatedTotal: null,
  errorText: "",
};

function safeParseEvent(line: string): DocGenerateStreamEvent | null {
  try {
    const parsed = JSON.parse(line) as DocGenerateStreamEvent;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function useDocumentStream() {
  const [state, setState] = useState<DocumentStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((previous) => ({
      ...previous,
      status: previous.document ? previous.status : "idle",
    }));
  }, []);

  const start = useCallback(async (payload: DocGenerateRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      status: "loading",
      document: null,
      blocksGenerated: 0,
      estimatedTotal: null,
      errorText: "",
    });

    const response = await fetch("/api/doc/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || "文档生成请求失败");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("未拿到文档生成流。");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const event = safeParseEvent(trimmed);
        if (!event) continue;

        setState((previous) => {
          switch (event.type) {
            case "meta":
              return {
                ...previous,
                status: previous.blocksGenerated > 0 ? previous.status : "streaming",
                document: createDraftDocumentFromMeta({
                  previous: previous.document,
                  meta: event.document,
                }),
              };
            case "block":
              return {
                ...previous,
                status: "streaming",
                document: appendDraftBlock({
                  previous: previous.document,
                  block: event.block,
                }),
              };
            case "progress":
              return {
                ...previous,
                status: "streaming",
                blocksGenerated: event.blocksGenerated,
                estimatedTotal:
                  typeof event.estimatedTotal === "number"
                    ? event.estimatedTotal
                    : previous.estimatedTotal,
              };
            case "error":
              return {
                ...previous,
                status: "error",
                errorText: event.message || "文档生成失败",
              };
            case "complete":
              return {
                ...previous,
                status: "complete",
              };
            default:
              return previous;
          }
        });
      }
    }
  }, []);

  return useMemo(
    () => ({
      ...state,
      start,
      abort,
      reset,
    }),
    [abort, reset, start, state],
  );
}
