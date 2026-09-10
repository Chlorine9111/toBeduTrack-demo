"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, InputGroup, Label, ListBox, Select, Spinner, Surface, TextField } from "@heroui/react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { accountProfileFormSchema, translateAuthFieldError } from "@/lib/auth/forms";
import {
  getSubjectAreaLabel,
  normalizeSubjectAreaList,
  normalizeSubjectAreaValue,
} from "@/lib/auth/subject-areas";
import { useAppI18n } from "@/lib/app-i18n/provider";

type AccountSettingsPanelProps = {
  initialFullName: string;
  initialDisplayName: string;
  initialSchoolName: string;
  initialRoleTitle: string;
  initialTeachingSubjects: string[];
  email: string | null;
  emailConfirmed: boolean;
  emailConfirmedAt: string | null;
  avatarUrl: string | null;
  initials: string;
};

type FieldErrors = Partial<Record<"fullName" | "schoolName" | "roleTitle" | "teachingSubjects", string>>;

type CurriculumOptionsResponse = {
  courses: Array<{ id: string; name: string; code: string }>;
};

const ROLE_OPTIONS = [
  { value: "teacher", labelZh: "教师", labelEn: "Teacher" },
  { value: "admin", labelZh: "管理员", labelEn: "Administrator" },
  { value: "other", labelZh: "其他", labelEn: "Other" },
];

function normalizeRoleTitle(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized) {
    return "";
  }

  if (
    normalized === "teacher" ||
    normalized === "教师"
  ) {
    return "Teacher";
  }

  if (
    normalized === "admin" ||
    normalized === "administrator" ||
    normalized === "管理员"
  ) {
    return "Administrator";
  }

  if (
    normalized === "other" ||
    normalized === "其他"
  ) {
    return "Other";
  }

  return trimmed;
}

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json();
    if (typeof body?.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // ignore
  }
  return `HTTP ${response.status}`;
}

export default function AccountSettingsPanel(props: AccountSettingsPanelProps) {
  const { isZh, locale } = useAppI18n();
  const router = useRouter();
  const [supabase] = useState(() => createBrowserSupabaseClient());

  const [fullName, setFullName] = useState(props.initialFullName);
  const [schoolName, setSchoolName] = useState(props.initialSchoolName);
  const [roleTitle, setRoleTitle] = useState(() =>
    normalizeRoleTitle(props.initialRoleTitle),
  );
  const [teachingSubjects, setTeachingSubjects] = useState(() =>
    normalizeSubjectAreaList(props.initialTeachingSubjects),
  );
  const [bio, setBio] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(props.avatarUrl);

  const [subjectOptions, setSubjectOptions] = useState<string[]>(() =>
    normalizeSubjectAreaList(props.initialTeachingSubjects),
  );
  const [customSubject, setCustomSubject] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState("");
  const [errorText, setErrorText] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void fetch("/api/curriculum/options", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return { courses: [] } as CurriculumOptionsResponse;
        }
        return (await response.json()) as CurriculumOptionsResponse;
      })
      .then((payload) => {
        if (!active || controller.signal.aborted) return;
        const nextOptions = normalizeSubjectAreaList(
          [
            ...payload.courses.map((course) => course.name).filter(Boolean),
            ...props.initialTeachingSubjects,
          ],
        );
        setSubjectOptions(nextOptions);
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setSubjectOptions(normalizeSubjectAreaList(props.initialTeachingSubjects));
      });

    const handleAuthSigningOut = () => {
      controller.abort();
    };

    window.addEventListener("deskmate-auth-signing-out", handleAuthSigningOut);

    return () => {
      active = false;
      window.removeEventListener("deskmate-auth-signing-out", handleAuthSigningOut);
    };
  }, [props.initialTeachingSubjects]);

  const toggleSubject = (subject: string) => {
    setTeachingSubjects((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : current.length >= 10
          ? current
          : [...current, subject],
    );
  };

  const addCustomSubject = () => {
    const nextSubject = normalizeSubjectAreaValue(customSubject);
    if (!nextSubject) return;
    setTeachingSubjects((current) =>
      current.includes(nextSubject) || current.length >= 10 ? current : [...current, nextSubject],
    );
    setSubjectOptions((current) => (current.includes(nextSubject) ? current : [...current, nextSubject]));
    setCustomSubject("");
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  };

  const removeAvatar = () => {
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setErrorText("");
    setShowSaved(false);

    const parsed = accountProfileFormSchema.safeParse({
      fullName,
      schoolName,
      roleTitle,
      teachingSubjects,
    });

    if (!parsed.success) {
      const nextErrors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        fullName: nextErrors.fullName?.[0],
        schoolName: nextErrors.schoolName?.[0],
        roleTitle: nextErrors.roleTitle?.[0],
        teachingSubjects: nextErrors.teachingSubjects?.[0],
      });
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      try {
        const response = await fetch("/api/account/profile", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        if (!response.ok) {
          setErrorText(await readErrorMessage(response));
          return;
        }

        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            full_name: parsed.data.fullName,
            display_name: parsed.data.fullName,
            school_name: parsed.data.schoolName || undefined,
            role_title: parsed.data.roleTitle || undefined,
            teaching_subjects: parsed.data.teachingSubjects,
          },
        });

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deskmate-profile-updated"));
        }

        router.refresh();

        if (metadataError) {
          setNotice(
            isZh
              ? "账户资料已保存，但会话元数据同步稍有延迟，请刷新后确认侧边栏信息。"
              : "Profile saved, but session metadata may take a moment to sync. Refresh to confirm the sidebar details.",
          );
          return;
        }

        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 3000);
      } catch {
        setErrorText(isZh ? "保存账户资料失败，请稍后重试。" : "Failed to save the profile. Try again shortly.");
      }
    });
  };

  const currentRoleOption = ROLE_OPTIONS.find(
    (opt) => opt.value === roleTitle.toLowerCase() || opt.labelEn.toLowerCase() === roleTitle.toLowerCase(),
  );
  const roleSelectValue = currentRoleOption?.value ?? "other";


  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground">
          {isZh ? "个人资料" : "My profile"}
        </h1>
        <p className="mt-1 text-[0.875rem] text-muted">
          {isZh
            ? "管理你的公开展示信息和账户资料。"
            : "Manage your public presence and account information."}
        </p>
      </header>

      {/* Avatar */}
      <section className="mb-10">
        <div className="flex items-center gap-6">
          {avatarPreview ? (
            <img
              alt="User avatar"
              src={avatarPreview}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-semibold text-white">
              {props.initials}
            </div>
          )}
          <div className="space-y-1">
            <Button variant="ghost" size="sm" onPress={() => fileInputRef.current?.click()}>
              {isZh ? "更换头像" : "Change photo"}
            </Button>
            {avatarPreview && (
              <Button variant="ghost" size="sm" onPress={removeAvatar} className="text-danger">
                {isZh ? "移除" : "Remove"}
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>
      </section>

      {notice ? (
        <Alert status="success" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{notice}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {errorText ? (
        <Alert status="danger" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{errorText}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Form onSubmit={saveProfile} className="space-y-8">
        {/* Display Name */}
        <TextField>
          <Label>{isZh ? "显示名称" : "Display name"}</Label>
          <InputGroup>
            <InputGroup.Input
              id="settings-display-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder={isZh ? "你的名称" : "Your name"}
            />
          </InputGroup>
          {fieldErrors.fullName ? (
            <p className="text-xs text-danger">
              {translateAuthFieldError(fieldErrors.fullName, locale)}
            </p>
          ) : null}
        </TextField>

        {/* Email (readonly) */}
        <div className="space-y-2">
          <Label>{isZh ? "邮箱地址" : "Email address"}</Label>
          <Surface className="flex items-center rounded-lg px-4 py-3">
            <span className="text-[0.875rem] text-muted">
              {props.email ?? (isZh ? "未绑定邮箱" : "No email attached")}
            </span>
          </Surface>
        </div>

        {/* Role */}
        <Select
          selectedKey={roleSelectValue}
          onSelectionChange={(key) => {
            const selected = ROLE_OPTIONS.find((opt) => opt.value === key);
            if (selected) {
              setRoleTitle(selected.labelEn);
            }
          }}
          placeholder={isZh ? "选择角色" : "Select a role"}
        >
          <Label>{isZh ? "你的角色" : "Your role"}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ROLE_OPTIONS.map((opt) => (
                <ListBox.Item key={opt.value} id={opt.value} textValue={isZh ? opt.labelZh : opt.labelEn}>
                  {isZh ? opt.labelZh : opt.labelEn}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {fieldErrors.roleTitle ? (
          <p className="text-xs text-danger">
            {translateAuthFieldError(fieldErrors.roleTitle, locale)}
          </p>
        ) : null}

        {/* School */}
        <TextField>
          <Label>{isZh ? "学校 / 机构" : "School / Organization"}</Label>
          <InputGroup>
            <InputGroup.Input
              id="settings-school"
              type="text"
              autoComplete="organization"
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              placeholder={isZh ? "例如：斯坦福大学" : "e.g. Stanford University"}
            />
          </InputGroup>
          {fieldErrors.schoolName ? (
            <p className="text-xs text-danger">
              {translateAuthFieldError(fieldErrors.schoolName, locale)}
            </p>
          ) : null}
        </TextField>

        {/* Subject tags */}
        <div className="space-y-3">
          <Label>{isZh ? "学科方向" : "Subject areas"}</Label>
          <div className="flex flex-wrap gap-2">
            {subjectOptions.map((subject) => {
              const selected = teachingSubjects.includes(subject);
              return (
                <Button
                  key={subject}
                  variant={selected ? "primary" : "secondary"}
                  size="sm"
                  onPress={() => toggleSubject(subject)}
                  className="rounded-full"
                >
                  {selected ? <Check className="h-3 w-3" /> : null}
                  {getSubjectAreaLabel(subject, locale)}
                </Button>
              );
            })}
          </div>
          <div className="flex gap-3">
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
                placeholder={isZh ? "添加自定义学科" : "Add a custom subject"}
              />
            </InputGroup>
            <Button variant="secondary" onPress={addCustomSubject}>
              {isZh ? "添加" : "Add"}
            </Button>
          </div>
          {fieldErrors.teachingSubjects ? (
            <p className="text-xs text-danger">
              {translateAuthFieldError(fieldErrors.teachingSubjects, locale)}
            </p>
          ) : null}
        </div>

        {/* Bio */}
        <TextField>
          <Label>Bio</Label>
          <InputGroup>
            <InputGroup.TextArea
              id="settings-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder={isZh ? "简短介绍一下自己..." : "Share a brief introduction..."}
              rows={4}
            />
          </InputGroup>
          <p className="text-[0.75rem] italic text-muted">
            {isZh ? "简短描述，用于工作区个人展示。" : "Brief description for your workspace profile."}
          </p>
        </TextField>

        {/* Save */}
        <div className="flex items-center gap-6 pt-6">
          <Button type="submit" isDisabled={isPending} isPending={isPending}>
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" color="current" /> : null}
                {pending
                  ? (isZh ? "保存中..." : "Saving...")
                  : (isZh ? "保存修改" : "Save changes")}
              </>
            )}
          </Button>
          {showSaved && (
            <div className="flex items-center gap-2 text-success">
              <Check className="h-[18px] w-[18px]" />
              <span className="text-[0.875rem] font-medium">
                {isZh ? "已保存" : "Saved"}
              </span>
            </div>
          )}
        </div>
      </Form>
    </div>
  );
}
