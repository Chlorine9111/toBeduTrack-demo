"use client";

import { Tabs } from "@heroui/react";
import type { ExamResultStats } from "@/lib/exam-agent/types";

// ─── Stat item ─────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-base font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] text-default-500">{label}</span>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────

interface ExamStatsBarProps {
  stats: ExamResultStats;
  activeTab: "questions" | "answers";
  onTabChange: (tab: "questions" | "answers") => void;
}

export default function ExamStatsBar({ stats, activeTab, onTabChange }: ExamStatsBarProps) {
  return (
    <div className="flex items-center gap-4 border-b border-default-200 px-5 py-3">
      {/* Stats */}
      <div className="flex flex-1 gap-6">
        <StatItem label="通过" value={String(stats.passedCount)} />
        <StatItem label="已修复" value={String(stats.repairedCount)} />
        <StatItem
          label="平均质量"
          value={`${Math.round(stats.averageQuality * 100)}%`}
        />
        <StatItem
          label="知识点覆盖"
          value={`${Math.round(stats.topicCoverage * 100)}%`}
        />
      </div>

      {/* Tab switcher */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => onTabChange(key as "questions" | "answers")}
      >
        <Tabs.ListContainer>
          <Tabs.List
            aria-label="试卷视图切换"
            className="flex w-fit space-x-1 rounded-lg bg-default-100 p-0.5"
          >
            <Tabs.Tab
              id="questions"
              className="rounded-md px-3 py-1.5 text-[13px] font-medium"
            >
              试题
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab
              id="answers"
              className="rounded-md px-3 py-1.5 text-[13px] font-medium"
            >
              答案解析
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}
