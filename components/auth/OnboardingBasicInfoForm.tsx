"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Sparkles, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, InputGroup, Label, Spinner, Surface, TextField } from "@heroui/react";
import { onboardingBasicInfoFormSchema, translateAuthFieldError } from "@/lib/auth/forms";
import {
  requestOnboardingProfile,
  updateOnboardingProfile,
} from "@/lib/auth/onboarding-client";
import OnboardingShell from "@/components/auth/OnboardingShell";
import { useAppI18n } from "@/lib/app-i18n/provider";

type FieldErrors = Partial<Record<"fullName" | "roleTitle" | "schoolName", string>>;

export default function OnboardingBasicInfoForm() {
  const { isZh, locale } = useAppI18n();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    requestOnboardingProfile()
      .then((nextProfile) => {
        if (!active) return;
        if (nextProfile.nextRoute && nextProfile.nextRoute !== "/onboarding/basic-info") {
          router.replace(nextProfile.nextRoute);
          return;
        }
        setFullName(nextProfile.fullName);
        setRoleTitle(nextProfile.roleTitle);
        setSchoolName(nextProfile.schoolName);
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

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorText("");

    const parsed = onboardingBasicInfoFormSchema.safeParse({
      fullName,
      roleTitle,
      schoolName,
    });

    if (!parsed.success) {
      const nextErrors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        fullName: nextErrors.fullName?.[0],
        roleTitle: nextErrors.roleTitle?.[0],
        schoolName: nextErrors.schoolName?.[0],
      });
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      try {
        await updateOnboardingProfile({
          action: "basic_info",
          data: parsed.data,
        });
        router.push("/onboarding/subjects");
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "保存失败" : "Save failed");
      }
    });
  };

  return (
    <OnboardingShell
      step={1}
      title={isZh ? "完善你的教师资料" : "Complete your teacher profile"}
      description={
        isZh
          ? "先告诉系统你是谁、来自哪里、平时以什么身份使用 Deskmate。后面的课程推荐和工作区文案会基于这些资料生成。"
          : "Tell the system who you are, where you teach, and what role you use Deskmate in. Recommendations and workspace copy will build on this profile."
      }
      asideTitle={
        isZh
          ? "先建立清晰的教师身份，再谈工作台效率。"
          : "Set a clear teacher identity before optimizing the workspace."
      }
    >
      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-border bg-surface text-sm text-muted">
          <Spinner size="sm" />
          <span className="ml-2">{isZh ? "正在读取你的资料..." : "Loading your profile..."}</span>
        </div>
      ) : (
        <Form onSubmit={submit} className="space-y-5">
          {errorText ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errorText}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          <TextField>
            <Label>{isZh ? "教师姓名" : "Teacher name"}</Label>
            <InputGroup>
              <InputGroup.Prefix>
                <UserRound className="h-4 w-4 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                id="onboarding-full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={isZh ? "例如：张老师" : "For example: Ms. Zhang"}
              />
            </InputGroup>
            {fieldErrors.fullName ? (
              <p className="text-xs text-danger">
                {translateAuthFieldError(fieldErrors.fullName, locale)}
              </p>
            ) : null}
          </TextField>

          <TextField>
            <Label>{isZh ? "角色 / 职称" : "Role / title"}</Label>
            <InputGroup>
              <InputGroup.Prefix>
                <Sparkles className="h-4 w-4 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                id="onboarding-role-title"
                type="text"
                value={roleTitle}
                onChange={(event) => setRoleTitle(event.target.value)}
                placeholder={
                  isZh
                    ? "例如：AP Biology 教师 / 教研负责人"
                    : "For example: AP Biology Teacher / Curriculum Lead"
                }
              />
            </InputGroup>
            {fieldErrors.roleTitle ? (
              <p className="text-xs text-danger">
                {translateAuthFieldError(fieldErrors.roleTitle, locale)}
              </p>
            ) : null}
          </TextField>

          <TextField>
            <Label>{isZh ? "学校 / 机构" : "School / organization"}</Label>
            <InputGroup>
              <InputGroup.Prefix>
                <Building2 className="h-4 w-4 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                id="onboarding-school-name"
                type="text"
                autoComplete="organization"
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
                placeholder={isZh ? "例如：某某国际学校" : "For example: Example International School"}
              />
            </InputGroup>
            {fieldErrors.schoolName ? (
              <p className="text-xs text-danger">
                {translateAuthFieldError(fieldErrors.schoolName, locale)}
              </p>
            ) : null}
          </TextField>

          <Button
            type="submit"
            fullWidth
            size="lg"
            isDisabled={isPending}
            isPending={isPending}
          >
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" color="current" /> : null}
                {isZh ? "继续下一步" : "Continue"}
              </>
            )}
          </Button>

          <Surface className="rounded-2xl px-4 py-3 text-xs leading-6 text-muted">
            {isZh
              ? "当前资料会同步到工作区顶部、内容库来源信息和 AI 个性化上下文。后续也可以在设置页继续修改。"
              : "This profile syncs to the workspace header, library source metadata, and AI personalization. You can adjust it later in Settings."}
          </Surface>
        </Form>
      )}
    </OnboardingShell>
  );
}
