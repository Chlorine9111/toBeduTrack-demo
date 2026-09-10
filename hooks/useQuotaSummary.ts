"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api/client";
import type { QuotaSummary } from "@/lib/quota/types";

const POLL_INTERVAL = 60_000;
export const QUOTA_UPDATED_EVENT = "deskmate-quota-updated";

type QuotaResponse = { summary: QuotaSummary };

export function useQuotaSummary(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [summary, setSummary] = useState<QuotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchQuota = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      const data = await apiGet<QuotaResponse>("/api/quota", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setSummary(data.summary);
        setError(null);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "获取配额失败");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setSummary(null);
      setError(null);
      setLoading(false);
      return;
    }

    fetchQuota();

    const timer = setInterval(fetchQuota, POLL_INTERVAL);

    const handleEvent = () => {
      fetchQuota();
    };
    window.addEventListener(QUOTA_UPDATED_EVENT, handleEvent);

    return () => {
      clearInterval(timer);
      window.removeEventListener(QUOTA_UPDATED_EVENT, handleEvent);
      abortRef.current?.abort();
    };
  }, [enabled, fetchQuota]);

  return { summary, loading, error };
}
