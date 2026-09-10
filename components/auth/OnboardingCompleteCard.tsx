"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Bot, Library, Settings, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Spinner } from "@heroui/react";
import {
  requestOnboardingProfile,
  updateOnboardingProfile,
  type OnboardingProfile,
} from "@/lib/auth/onboarding-client";
import { getSubjectAreaLabel } from "@/lib/auth/subject-areas";
import OnboardingShell from "@/components/auth/OnboardingShell";
import { useAppI18n } from "@/lib/app-i18n/provider";

const WELCOME_ANIMATION_ROUTE = "/onboarding/activate";

export default function OnboardingCompleteCard() {
  const { isZh } = useAppI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    requestOnboardingProfile()
      .then((nextProfile) => {
        if (!active) return;
        if (nextProfile.nextRoute && nextProfile.nextRoute !== "/onboarding/get-started") {
          router.replace(nextProfile.nextRoute);
          return;
        }
        setProfile(nextProfile);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorText(
          error instanceof Error
            ? error.message
            : isZh
              ? "读取引导资料失败"
              : "Failed to load onboarding profile",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isZh, router]);

  const complete = () => {
    setErrorText("");
    startTransition(async () => {
      try {
        await updateOnboardingProfile({ action: "complete" });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deskmate-profile-updated"));
        }
        router.push(WELCOME_ANIMATION_ROUTE);
      } catch (error) {
        setErrorText(
          error instanceof Error ? error.message : isZh ? "完成引导失败" : "Failed to complete setup",
        );
      }
    });
  };

  const shortcuts = [
    {
      icon: Bot,
      title: isZh ? "自主 Agent" : "Autonomous Agent",
      description: isZh
        ? "从自然语言任务开始，直接生成教案、Rubric 和习题。"
        : "Start from natural-language tasks and generate lesson plans, rubrics, and exercises directly.",
    },
    {
      icon: Library,
      title: isZh ? "内容库" : "Content Library",
      description: isZh
        ? "把历史产物按课程和单元沉淀下来，随时搜索和复用。"
        : "Store past outputs by course and unit so you can search and reuse them later.",
    },
    {
      icon: Settings,
      title: isZh ? "账户设置" : "Account Settings",
      description: isZh
        ? "后续可在设置页继续修改身份资料和安全项。"
        : "You can update profile details and security settings later from Settings.",
    },
  ] as const;

  return (
    <OnboardingShell
      step={3}
      title={isZh ? "工作区已经准备好了" : "Your workspace is ready"}
      description={
        isZh
          ? "最后确认一次，你的教师身份和学科偏好已经写入工作区。下一步会先播放欢迎动画，再进入自主 Agent。"
          : "Your teacher identity and subject preferences are now saved. Next up is the welcome animation before you enter the autonomous Agent."
      }
      backHref="/onboarding/subjects"
    >
      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-border bg-surface text-sm text-muted">
          <Spinner size="sm" />
          <span className="ml-2">{isZh ? "正在准备工作区..." : "Preparing your workspace..."}</span>
        </div>
      ) : (
        <div className="space-y-5">
          {errorText ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errorText}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          <div className="rounded-[28px] border border-foreground/15 bg-[linear-gradient(135deg,rgba(255,91,91,0.08),rgba(255,255,255,0.95))] p-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-foreground/15 text-foreground">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-foreground">
              {isZh
                ? `${profile?.fullName || "老师"}，欢迎进入 Deskmate`
                : `Welcome to Deskmate, ${profile?.fullName || "Teacher"}`}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              {profile?.schoolName
                ? isZh
                  ? `当前工作区已绑定到 ${profile.schoolName}。`
                  : `This workspace is now linked to ${profile.schoolName}.`
                : isZh
                  ? "当前工作区已绑定到你的教师账户。"
                  : "This workspace is now linked to your teacher account."}
              {profile?.teachingSubjects?.length
                ? isZh
                  ? ` 主要学科方向：${profile.teachingSubjects.map((subject) => getSubjectAreaLabel(subject, "zh")).join("、")}。`
                  : ` Main subject areas: ${profile.teachingSubjects.map((subject) => getSubjectAreaLabel(subject, "en")).join(", ")}.`
                : ""}
            </p>
          </div>

          <div className="space-y-3">
            {shortcuts.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <Card.Content className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl bg-surface p-3 text-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-muted">{item.description}</p>
                      </div>
                    </div>
                  </Card.Content>
                </Card>
              );
            })}
          </div>

          <Button
            fullWidth
            size="lg"
            onPress={complete}
            isDisabled={isPending}
            isPending={isPending}
          >
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" color="current" /> : <ArrowRight className="h-4 w-4" />}
            {isZh ? "查看欢迎动画" : "Continue to welcome animation"}
          </>
        )}
      </Button>
        </div>
      )}
    </OnboardingShell>
  );
}
