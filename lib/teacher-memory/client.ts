"use client";

import type { TeacherMemoryContext, TeacherMemoryScope } from "@/lib/teacher-memory/types";

const PROFILE_STORAGE_KEY = "teacher_memory_profile_key";

function extractTeacherMemoryError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return fallback;
}

function generateProfileKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `tm_${crypto.randomUUID()}`;
  }
  return `tm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getTeacherProfileKey(): string {
  if (typeof window === "undefined") return "tm_server";

  const existing = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (existing && existing.length >= 6) {
    return existing;
  }

  const created = generateProfileKey();
  window.localStorage.setItem(PROFILE_STORAGE_KEY, created);
  return created;
}

export async function fetchTeacherMemoryContext(params?: {
  profileKey?: string;
  scope?: TeacherMemoryScope;
  teacherId?: string;
}): Promise<TeacherMemoryContext | null> {
  const profileKey = params?.profileKey ?? getTeacherProfileKey();
  const scope = params?.scope ?? "wechat_editor";

  const query = new URLSearchParams({
    profileKey,
    scope,
  });

  if (params?.teacherId) {
    query.set("teacherId", params.teacherId);
  }

  const response = await fetch(`/api/teacher-memory?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(
      extractTeacherMemoryError(data, `读取老师记忆失败 (${response.status})`),
    );
  }

  return {
    memory: data.memory,
    insights: data.insights,
  } as TeacherMemoryContext;
}

export async function trackTeacherMemory(params: {
  eventType: string;
  payload?: Record<string, unknown>;
  scope?: TeacherMemoryScope;
  profileKey?: string;
  teacherId?: string;
}) {
  const profileKey = params.profileKey ?? getTeacherProfileKey();

  await fetch("/api/teacher-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "track",
      profileKey,
      scope: params.scope ?? "wechat_editor",
      eventType: params.eventType,
      payload: params.payload ?? {},
      teacherId: params.teacherId,
    }),
    keepalive: true,
  }).catch(() => {
    // 静默失败，不阻塞主流程
  });
}

export async function patchTeacherMemoryClient(params: {
  patch: Record<string, unknown>;
  scope?: TeacherMemoryScope;
  profileKey?: string;
  teacherId?: string;
}) {
  const profileKey = params.profileKey ?? getTeacherProfileKey();

  await fetch("/api/teacher-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "preferences",
      profileKey,
      scope: params.scope ?? "wechat_editor",
      patch: params.patch,
      teacherId: params.teacherId,
    }),
  }).catch(() => {
    // 静默失败
  });
}
