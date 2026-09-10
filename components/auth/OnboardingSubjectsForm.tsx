"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Form, InputGroup, Spinner, Surface } from "@heroui/react";
import { onboardingSubjectsFormSchema, translateAuthFieldError } from "@/lib/auth/forms";
import {
  requestOnboardingProfile,
  updateOnboardingProfile,
} from "@/lib/auth/onboarding-client";
import {
  getSubjectAreaLabel,
  normalizeSubjectAreaList,
  normalizeSubjectAreaValue,
} from "@/lib/auth/subject-areas";
import OnboardingShell from "@/components/auth/OnboardingShell";
import { useAppI18n } from "@/lib/app-i18n/provider";

type CurriculumOptionsResponse = {
  courses: Array<{ id: string; name: string; code: string }>;
};

export default function OnboardingSubjectsForm() {
  const { isZh, locale } = useAppI18n();
  const router = useRouter();
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [customSubject, setCustomSubject] = useState("");
  const [errorText, setErrorText] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [nextProfile, curriculum] = await Promise.all([
          requestOnboardingProfile(),
          fetch("/api/curriculum/options", { cache: "no-store" })
            .then(async (response) => {
              if (!response.ok) {
                return { courses: [] } as CurriculumOptionsResponse;
              }
              return (await response.json()) as CurriculumOptionsResponse;
            })
            .catch(() => ({ courses: [] } as CurriculumOptionsResponse)),
        ]);

        if (!active) return;
        if (nextProfile.nextRoute && nextProfile.nextRoute !== "/onboarding/subjects") {
          router.replace(nextProfile.nextRoute);
          return;
        }

        const deduped = normalizeSubjectAreaList(
          [
            ...curriculum.courses.map((course) => course.name).filter(Boolean),
            ...nextProfile.teachingSubjects,
          ],
        );

        setSelectedSubjects(normalizeSubjectAreaList(nextProfile.teachingSubjects));
        setSubjectOptions(deduped);
      } catch (error) {
        if (!active) return;
        setErrorText(
          error instanceof Error
            ? error.message
            : isZh
              ? "读取学科方向失败"
              : "Failed to load subject areas",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [isZh, router]);

  const subjectCountLabel = useMemo(() => `${selectedSubjects.length}/10`, [selectedSubjects.length]);

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : current.length >= 10
          ? current
          : [...current, subject],
    );
  };

  const addCustomSubject = () => {
    const nextValue = normalizeSubjectAreaValue(customSubject);
    if (!nextValue) return;
    if (!selectedSubjects.includes(nextValue)) {
      setSelectedSubjects((current) => (current.length >= 10 ? current : [...current, nextValue]));
      setSubjectOptions((current) => (current.includes(nextValue) ? current : [...current, nextValue]));
    }
    setCustomSubject("");
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorText("");
    setFieldError("");

    const parsed = onboardingSubjectsFormSchema.safeParse({
      teachingSubjects: selectedSubjects,
    });

    if (!parsed.success) {
      setFieldError(
        parsed.error.flatten().fieldErrors.teachingSubjects?.[0] ??
          (isZh ? "请选择至少一个学科方向" : "Select at least one subject area"),
      );
      return;
    }

    startTransition(async () => {
      try {
        await updateOnboardingProfile({
          action: "subjects",
          data: parsed.data,
        });
        router.push("/onboarding/get-started");
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : isZh ? "保存失败" : "Save failed");
      }
    });
  };

  return (
    <OnboardingShell
      step={2}
      title={isZh ? "选择你的主要学科方向" : "Choose your primary subject areas"}
      description={
        isZh
          ? "用这些学科标签告诉 Deskmate 你主要服务哪些课程。后续首页推荐、Agent 快捷操作和内容库归类都会优先围绕它们展开。"
          : "Use these subject labels to tell Deskmate which courses you mainly support. Home recommendations, Agent shortcuts, and library classification will prioritize them."
      }
      backHref="/onboarding/basic-info"
    >
      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-border bg-surface text-sm text-muted">
          <Spinner size="sm" />
          <span className="ml-2">{isZh ? "正在读取学科方向..." : "Loading subject areas..."}</span>
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

          <Surface className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {isZh ? "已选择学科方向" : "Selected subject areas"}
              </p>
              <p className="mt-1 text-xs leading-6 text-muted">
                {isZh
                  ? "至少选择 1 个，可多选；建议把你最常生成内容的课程都选上。"
                  : "Choose at least one and select multiple if needed. Include the courses you generate content for most often."}
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-muted ring-1 ring-border">
              {subjectCountLabel}
            </span>
          </Surface>

          <div className="flex flex-wrap gap-3">
            {subjectOptions.map((subject) => {
              const selected = selectedSubjects.includes(subject);
              return (
                <Button
                  key={subject}
                  variant={selected ? "primary" : "outline"}
                  size="sm"
                  onPress={() => toggleSubject(subject)}
                  className="rounded-full"
                >
                  {selected ? <Check className="h-4 w-4" /> : null}
                  {getSubjectAreaLabel(subject, locale)}
                </Button>
              );
            })}
          </div>

          <Card variant="transparent">
            <Card.Content className="p-4">
              <p className="text-sm font-medium text-foreground">
                {isZh ? "没有合适的选项？" : "Don't see the right option?"}
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <InputGroup className="flex-1">
                  <InputGroup.Input
                    type="text"
                    value={customSubject}
                    onChange={(event) => setCustomSubject(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomSubject();
                      }
                    }}
                    placeholder={
                      isZh
                        ? "输入自定义学科，例如：AP Economics"
                        : "Add a custom subject, for example: AP Economics"
                    }
                  />
                </InputGroup>
                <Button variant="outline" onPress={addCustomSubject}>
                  <Plus className="h-4 w-4" />
                  {isZh ? "添加学科" : "Add subject"}
                </Button>
              </div>
            </Card.Content>
          </Card>

          {fieldError ? (
            <p className="text-xs text-danger">{translateAuthFieldError(fieldError, locale)}</p>
          ) : null}

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
        </Form>
      )}
    </OnboardingShell>
  );
}
