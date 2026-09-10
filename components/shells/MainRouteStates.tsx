"use client";

import { Skeleton } from "@heroui/react";
import DotPulseLoader from "@/components/main/agent/DotPulseLoader";

function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-divider bg-white ${className}`}>
      {children}
    </div>
  );
}

export function MainShellLoading({
  title = "正在加载工作区...",
}: {
  title?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-default-50">
      <div className="border-b border-divider bg-white px-6 py-4">
        <DotPulseLoader className="text-default-300" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 md:px-8">
        <SectionCard className="px-5 py-4">
          <Skeleton className="h-6 w-40 rounded-full" />
        </SectionCard>
        <SectionCard className="flex-1 p-5">
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-4 w-48 rounded-full" />
            <Skeleton className="h-4 w-64 rounded-full" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function AgentRouteLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-default-50">
      <div className="border-b border-divider bg-white px-6 py-4">
        <DotPulseLoader className="text-default-300" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 lg:flex-row lg:px-8">
        <SectionCard className="flex min-h-[360px] flex-1 flex-col gap-4 p-5">
          <Skeleton className="h-8 w-56 rounded-xl" />
          <Skeleton className="h-4 w-80 rounded-full" />
          <div className="space-y-3 pt-4">
            <Skeleton className="h-16 w-[82%] rounded-2xl" />
            <Skeleton className="ml-auto h-14 w-[68%] rounded-2xl" />
            <Skeleton className="h-16 w-[76%] rounded-2xl" />
          </div>
          <div className="mt-auto rounded-2xl border border-default-100 bg-default-100 p-4">
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </SectionCard>
        <SectionCard className="hidden min-h-[360px] w-full max-w-[420px] flex-col gap-4 p-5 lg:flex">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-52 w-full rounded-2xl" />
        </SectionCard>
      </div>
    </div>
  );
}

export function ContentLibraryRouteLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-default-50">
      <div className="border-b border-divider bg-white px-6 py-5">
        <DotPulseLoader className="text-default-300" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 md:px-8">
        <SectionCard className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 min-w-[220px] flex-1 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </SectionCard>
        <SectionCard className="flex-1 px-5 py-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 border-b border-default-100 pb-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 rounded-full" />
                  <Skeleton className="h-3 w-72 rounded-full" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function DocumentListRouteLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-default-50">
      <div className="border-b border-divider bg-white px-6 py-5">
        <DotPulseLoader className="text-default-300" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 md:px-8">
        <SectionCard className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 min-w-[220px] flex-1 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </SectionCard>
        <SectionCard className="flex-1 px-5 py-4">
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 border-b border-default-100 pb-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-52 rounded-full" />
                  <Skeleton className="h-3 w-28 rounded-full" />
                </div>
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function DocumentEditorRouteLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
      <div className="hidden w-[240px] shrink-0 border-r border-divider bg-default-100 p-4 lg:block">
        <Skeleton className="h-9 w-full rounded-xl" />
        <div className="mt-5 space-y-3">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-divider bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <DotPulseLoader className="text-default-300" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center px-6 py-10">
          <div className="w-full max-w-[720px] space-y-4">
            <Skeleton className="h-10 w-2/3 rounded-xl" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-full" />
            </div>
            <SectionCard className="p-6">
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className={index % 3 === 0 ? "h-4 w-[92%] rounded-full" : index % 3 === 1 ? "h-4 w-[76%] rounded-full" : "h-4 w-[84%] rounded-full"} />
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
