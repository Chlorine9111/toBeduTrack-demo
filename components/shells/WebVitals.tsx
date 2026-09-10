"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

const SESSION_STORAGE_KEY = "deskmate-web-vitals-session";
const ALLOWED_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

type WebVitalsPayload = {
  route: string;
  metricId: string;
  metricName: string;
  metricValue: number;
  metricRating?: "good" | "needs-improvement" | "poor" | null;
  navigationType?: string | null;
  sessionId: string;
};

function resolveSessionId() {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = window.crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
}

function sendVitals(payload: WebVitalsPayload) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const ok = navigator.sendBeacon(
      "/api/telemetry/web-vitals",
      new Blob([body], { type: "application/json" }),
    );
    if (ok) return;
  }

  void fetch("/api/telemetry/web-vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

export function WebVitals() {
  const pathname = usePathname();
  const routeRef = useRef(pathname || "/");
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    routeRef.current = pathname || "/";
  }, [pathname]);

  useEffect(() => {
    sessionIdRef.current = resolveSessionId();
  }, []);

  useReportWebVitals((metric) => {
    if (!ALLOWED_METRICS.has(metric.name)) return;

    const sessionId = sessionIdRef.current ?? resolveSessionId();
    if (!sessionId) return;
    sessionIdRef.current = sessionId;

    sendVitals({
      route: routeRef.current || "/",
      metricId: metric.id,
      metricName: metric.name,
      metricValue: metric.value,
      metricRating:
        metric.rating === "good" ||
        metric.rating === "needs-improvement" ||
        metric.rating === "poor"
          ? metric.rating
          : null,
      navigationType: metric.navigationType ?? null,
      sessionId,
    });
  });

  return null;
}
