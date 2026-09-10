"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorDocumentProperty } from "@/lib/documents/types";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

type SavePayload = {
  title: string;
  htmlContent: string;
  properties: EditorDocumentProperty[];
};

type ConflictSnapshot = {
  version: number;
  savedAt?: string | null;
  data?: SavePayload;
};

type UseDocumentAutosaveParams = {
  documentId: string | null;
  version: number;
  debounceMs?: number;
  requestTimeoutMs?: number;
  onSaved?: (params: {
    version: number;
    savedAt: string;
    data: SavePayload;
  }) => void;
  resolveConflict?: (params: {
    documentId: string;
    attemptedVersion: number;
    data: SavePayload;
  }) => Promise<ConflictSnapshot | null>;
};

type UseDocumentAutosaveReturn = {
  save: (data: SavePayload) => void;
  flush: (data?: SavePayload) => Promise<void>;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  currentVersion: number;
  error: string | null;
};

function computeSignature(data: SavePayload) {
  return `${data.title}::${data.htmlContent}::${JSON.stringify(data.properties)}`;
}

export function useDocumentAutosave({
  documentId,
  version,
  debounceMs = 2000,
  requestTimeoutMs = 12_000,
  onSaved,
  resolveConflict,
}: UseDocumentAutosaveParams): UseDocumentAutosaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(version);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const versionRef = useRef(version);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SavePayload | null>(null);
  const isSavingRef = useRef(false);
  const lastSavedSignatureRef = useRef("");
  const flushRequestedRef = useRef(false);
  const activeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    versionRef.current = version;
    setCurrentVersion(version);
  }, [version]);

  useEffect(() => {
    lastSavedSignatureRef.current = "";
    pendingRef.current = null;
    isSavingRef.current = false;
    flushRequestedRef.current = false;
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    setSaveStatus("saved");
    setLastSavedAt(null);
    setError(null);
  }, [documentId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doSave = useCallback(
    async (data: SavePayload) => {
      if (!documentId) return;

      const signature = computeSignature(data);
      if (signature === lastSavedSignatureRef.current) {
        if (mountedRef.current) {
          setSaveStatus("saved");
          setError(null);
        }
        return;
      }

      if (isSavingRef.current) {
        pendingRef.current = data;
        flushRequestedRef.current = true;
        return;
      }

      isSavingRef.current = true;
      const abortController = new AbortController();
      activeAbortRef.current = abortController;
      const timeoutId = window.setTimeout(() => {
        abortController.abort("autosave-timeout");
      }, requestTimeoutMs);

      if (mountedRef.current) {
        setSaveStatus("saving");
        setError(null);
      }

      try {
        const response = await fetch(`/api/documents/${documentId}/autosave`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: abortController.signal,
          body: JSON.stringify({
            title: data.title,
            htmlContent: data.htmlContent,
            properties: data.properties,
            expectedVersion: versionRef.current,
          }),
        });

        if (!response.ok) {
          if (response.status === 409) {
            const conflictSnapshot = resolveConflict
              ? await resolveConflict({
                  documentId,
                  attemptedVersion: versionRef.current,
                  data,
                })
              : null;

            if (
              conflictSnapshot &&
              Number.isFinite(conflictSnapshot.version) &&
              conflictSnapshot.version > versionRef.current
            ) {
              versionRef.current = conflictSnapshot.version;
              const latestSignature = conflictSnapshot.data
                ? computeSignature(conflictSnapshot.data)
                : "";

              if (latestSignature) {
                lastSavedSignatureRef.current = latestSignature;
              }

              if (mountedRef.current) {
                setCurrentVersion(conflictSnapshot.version);
                if (conflictSnapshot.savedAt) {
                  setLastSavedAt(conflictSnapshot.savedAt);
                }
                setSaveStatus(
                  latestSignature && latestSignature === signature ? "saved" : "unsaved",
                );
                setError(null);
              }

              if (!latestSignature || latestSignature !== signature) {
                pendingRef.current = data;
                flushRequestedRef.current = true;
              }
              return;
            }

            if (mountedRef.current) {
              setSaveStatus("error");
              setError("文档已被其他地方修改，请刷新");
            }
            return;
          }

          throw new Error(`保存失败 (${response.status})`);
        }

        const result = await response.json();
        const newVersion = result.version ?? versionRef.current + 1;
        const savedAt = result.savedAt ?? new Date().toISOString();
        versionRef.current = newVersion;
        lastSavedSignatureRef.current = signature;

        if (mountedRef.current) {
          setCurrentVersion(newVersion);
          setLastSavedAt(savedAt);
          setSaveStatus("saved");
          setError(null);
        }

        onSaved?.({
          version: newVersion,
          savedAt,
          data,
        });
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (mountedRef.current) {
          setSaveStatus("error");
          setError(
            aborted
              ? "保存超时，请稍后重试"
              : err instanceof Error
                ? err.message
                : "保存失败",
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        activeAbortRef.current = null;
        isSavingRef.current = false;

        if (flushRequestedRef.current || pendingRef.current) {
          flushRequestedRef.current = false;
          void Promise.resolve().then(async () => {
            if (!mountedRef.current) return;
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            const nextPayload = pendingRef.current;
            if (!nextPayload) return;
            pendingRef.current = null;
            await doSave(nextPayload);
          });
        }
      }
    },
    [documentId, onSaved, requestTimeoutMs, resolveConflict],
  );

  const flush = useCallback(
    async (data?: SavePayload) => {
      if (!documentId) return;

      if (data) {
        pendingRef.current = data;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const payload = pendingRef.current;
      if (!payload) return;

      pendingRef.current = null;
      await doSave(payload);
    },
    [documentId, doSave],
  );

  const save = useCallback(
    (data: SavePayload) => {
      if (!documentId) return;

      pendingRef.current = data;

      if (mountedRef.current && saveStatus !== "saving") {
        setSaveStatus("unsaved");
        setError(null);
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        void flush();
      }, debounceMs);
    },
    [debounceMs, documentId, flush, saveStatus],
  );

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();

      if (!documentId) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const payload = pendingRef.current;
      if (!payload) return;

      pendingRef.current = null;
      const body = JSON.stringify({
        title: payload.title,
        htmlContent: payload.htmlContent,
        properties: payload.properties,
        expectedVersion: versionRef.current,
      });

      try {
        navigator.sendBeacon(
          `/api/documents/${documentId}/autosave`,
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        // 页面卸载阶段无法保证回传结果，这里只做最后兜底。
      }
    };
  }, [documentId]);

  return {
    save,
    flush,
    saveStatus,
    lastSavedAt,
    currentVersion,
    error,
  };
}
