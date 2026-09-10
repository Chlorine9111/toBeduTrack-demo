"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button, Separator } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { QuotaSummary } from "@/lib/quota/types";
import { cn } from "@/lib/utils";

type SettingsPageViewProps = {
  initialTab?: SettingsTab;
  fullName: string;
  displayName: string;
  schoolName: string;
  roleTitle: string;
  teachingSubjects: string[];
  email: string | null;
  emailConfirmed: boolean;
  emailConfirmedAt: string | null;
  initials: string;
  joinedAt: string | null;
  avatarUrl: string | null;
  quotaSummary: QuotaSummary | null;
};

type SettingsTab = "profile" | "preferences" | "security" | "subscription";

const TAB_ITEMS: Array<{ key: SettingsTab; labelZh: string; labelEn: string }> = [
  { key: "profile", labelZh: "个人资料", labelEn: "Profile" },
  { key: "preferences", labelZh: "偏好设置", labelEn: "Preferences" },
  { key: "security", labelZh: "安全", labelEn: "Security" },
  { key: "subscription", labelZh: "使用量", labelEn: "Usage" },
];

function SettingsPanelLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-40 rounded-xl bg-default-100" />
      <div className="h-24 rounded-2xl bg-default-50" />
      <div className="h-24 rounded-2xl bg-default-50" />
      <div className="h-24 rounded-2xl bg-default-50" />
    </div>
  );
}

const AccountSettingsPanel = dynamic(
  () => import("@/components/auth/AccountSettingsPanel"),
  { loading: () => <SettingsPanelLoading /> },
);

const PreferencesPanel = dynamic(
  () => import("@/components/main/settings/PreferencesPanel"),
  { loading: () => <SettingsPanelLoading /> },
);

const SecurityPanel = dynamic(
  () => import("@/components/main/settings/SecurityPanel"),
  { loading: () => <SettingsPanelLoading /> },
);

const SubscriptionPanel = dynamic(
  () => import("@/components/main/settings/SubscriptionPanel"),
  { loading: () => <SettingsPanelLoading /> },
);

export default function SettingsPageView(props: SettingsPageViewProps) {
  const { isZh } = useAppI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>(props.initialTab ?? "profile");

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* 左侧子导航 */}
      <nav className="sticky top-0 h-full w-[200px] shrink-0 px-4 pt-20">
        <h2 className="mb-6 px-3 text-[0.6875rem] font-bold uppercase tracking-widest text-foreground/30">
          {isZh ? "账户设置" : "Account settings"}
        </h2>
        <ul className="space-y-0.5">
          {TAB_ITEMS.map((tab) => (
            <li key={tab.key}>
              <Button
                variant="ghost"
                onPress={() => setActiveTab(tab.key)}
                className={cn(
                  "block w-full rounded-lg px-3 py-1.5 text-left text-[0.875rem] transition-colors",
                  activeTab === tab.key
                    ? "bg-default-100 font-semibold text-foreground"
                    : "text-foreground/60 hover:bg-default-100",
                )}
              >
                {isZh ? tab.labelZh : tab.labelEn}
              </Button>
            </li>
          ))}
        </ul>
      </nav>

      <Separator orientation="vertical" className="h-auto self-stretch" />

      {/* 右侧内容区 */}
      <div className="flex-1 overflow-y-auto pb-32 pl-10 pt-20">
        <div className="max-w-[560px]">
          {activeTab === "profile" && (
            <AccountSettingsPanel
              initialFullName={props.fullName}
              initialDisplayName={props.displayName}
              initialSchoolName={props.schoolName}
              initialRoleTitle={props.roleTitle}
              initialTeachingSubjects={props.teachingSubjects}
              email={props.email}
              emailConfirmed={props.emailConfirmed}
              emailConfirmedAt={props.emailConfirmedAt}
              avatarUrl={props.avatarUrl}
              initials={props.initials}
            />
          )}

          {activeTab === "preferences" && <PreferencesPanel />}

          {activeTab === "security" && <SecurityPanel email={props.email} />}

          {activeTab === "subscription" && (
            <SubscriptionPanel quotaSummary={props.quotaSummary} />
          )}
        </div>
      </div>
    </div>
  );
}
