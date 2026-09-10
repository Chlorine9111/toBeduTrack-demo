import { z } from "zod";
import type { AppLocale } from "@/lib/app-i18n/types";
import { normalizeSubjectAreaList } from "@/lib/auth/subject-areas";

const emailSchema = z
  .string()
  .trim()
  .min(1, "请输入邮箱地址")
  .email("请输入有效的邮箱地址")
  .transform((value) => value.toLowerCase());

const basePasswordSchema = z
  .string()
  .min(8, "密码至少需要 8 位")
  .max(72, "密码长度不能超过 72 位");

const optionalShortText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => value ?? "");

const subjectItemSchema = z.string().trim().min(1).max(80, "学科名称不能超过 80 个字符");

function hasLowercase(value: string) {
  return /[a-z]/.test(value);
}

function hasUppercase(value: string) {
  return /[A-Z]/.test(value);
}

function hasDigit(value: string) {
  return /\d/.test(value);
}

const AUTH_FIELD_ERROR_TRANSLATIONS: Record<string, string> = {
  "请输入邮箱地址": "Enter an email address",
  "请输入有效的邮箱地址": "Enter a valid email address",
  "密码至少需要 8 位": "Password must be at least 8 characters",
  "密码长度不能超过 72 位": "Password cannot exceed 72 characters",
  "请输入密码": "Enter your password",
  "请输入真实姓名": "Enter your full name",
  "姓名长度不能超过 80 个字符": "Name cannot exceed 80 characters",
  "学校或机构名称不能超过 120 个字符": "School or organization name cannot exceed 120 characters",
  "学科名称不能超过 80 个字符": "Subject name cannot exceed 80 characters",
  "最多选择 10 个学科方向": "Select up to 10 subject areas",
  "请再次输入密码": "Confirm your password",
  "请再次输入新密码": "Confirm your new password",
  "请先同意服务条款与隐私政策": "Accept the terms and privacy policy first",
  "密码需包含至少一个小写字母": "Password must include at least one lowercase letter",
  "密码需包含至少一个大写字母": "Password must include at least one uppercase letter",
  "密码需包含至少一个数字": "Password must include at least one number",
  "两次输入的密码不一致": "The passwords do not match",
  "角色或职称不能超过 80 个字符": "Role title cannot exceed 80 characters",
  "最多保存 10 个学科方向": "Save up to 10 subject areas",
  "至少选择 1 个学科方向": "Select at least one subject area",
  "新密码需包含至少一个小写字母": "New password must include at least one lowercase letter",
  "新密码需包含至少一个大写字母": "New password must include at least one uppercase letter",
  "新密码需包含至少一个数字": "New password must include at least one number",
  "两次输入的新密码不一致": "The new passwords do not match",
};

export function translateAuthFieldError(message: string, locale: AppLocale = "zh") {
  if (locale === "zh") {
    return message;
  }
  return AUTH_FIELD_ERROR_TRANSLATIONS[message] ?? message;
}

export function getPasswordChecks(password: string, locale: AppLocale = "zh") {
  return [
    {
      key: "length",
      label: locale === "en" ? "At least 8 characters" : "至少 8 位",
      passed: password.length >= 8,
    },
    {
      key: "lowercase",
      label: locale === "en" ? "Includes a lowercase letter" : "包含小写字母",
      passed: hasLowercase(password),
    },
    {
      key: "uppercase",
      label: locale === "en" ? "Includes an uppercase letter" : "包含大写字母",
      passed: hasUppercase(password),
    },
    {
      key: "digit",
      label: locale === "en" ? "Includes a number" : "包含数字",
      passed: hasDigit(password),
    },
  ] as const;
}

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "请输入密码"),
});

export const registerFormSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "请输入真实姓名")
      .max(80, "姓名长度不能超过 80 个字符"),
    schoolName: optionalShortText(120, "学校或机构名称不能超过 120 个字符"),
    teachingSubjects: z
      .array(subjectItemSchema)
      .max(10, "最多选择 10 个学科方向")
      .default([])
      .transform(normalizeSubjectAreaList),
    email: emailSchema,
    password: basePasswordSchema,
    confirmPassword: z.string().min(1, "请再次输入密码"),
    termsAccepted: z.boolean().refine((value) => value, {
      message: "请先同意服务条款与隐私政策",
    }),
  })
  .superRefine((value, ctx) => {
    if (!hasLowercase(value.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "密码需包含至少一个小写字母",
      });
    }
    if (!hasUppercase(value.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "密码需包含至少一个大写字母",
      });
    }
    if (!hasDigit(value.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "密码需包含至少一个数字",
      });
    }
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "两次输入的密码不一致",
      });
    }
  });

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
});

export const accountProfileFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "请输入真实姓名")
    .max(80, "姓名长度不能超过 80 个字符"),
  schoolName: optionalShortText(120, "学校或机构名称不能超过 120 个字符"),
  roleTitle: optionalShortText(80, "角色或职称不能超过 80 个字符"),
  teachingSubjects: z
    .array(subjectItemSchema)
    .max(10, "最多保存 10 个学科方向")
    .default([])
    .transform(normalizeSubjectAreaList),
});

export const onboardingBasicInfoFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "请输入真实姓名")
    .max(80, "姓名长度不能超过 80 个字符"),
  roleTitle: optionalShortText(80, "角色或职称不能超过 80 个字符"),
  schoolName: optionalShortText(120, "学校或机构名称不能超过 120 个字符"),
});

export const onboardingSubjectsFormSchema = z.object({
  teachingSubjects: z
    .array(subjectItemSchema)
    .max(10, "最多选择 10 个学科方向")
    .default([])
    .transform(normalizeSubjectAreaList)
    .refine((value) => value.length > 0, {
      message: "至少选择 1 个学科方向",
    }),
});

export const updatePasswordFormSchema = z
  .object({
    password: basePasswordSchema,
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .superRefine((value, ctx) => {
    if (!hasLowercase(value.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "新密码需包含至少一个小写字母",
      });
    }
    if (!hasUppercase(value.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "新密码需包含至少一个大写字母",
      });
    }
    if (!hasDigit(value.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "新密码需包含至少一个数字",
      });
    }
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "两次输入的新密码不一致",
      });
    }
  });

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;
export type AccountProfileFormValues = z.infer<typeof accountProfileFormSchema>;
export type UpdatePasswordFormValues = z.infer<typeof updatePasswordFormSchema>;
export type OnboardingBasicInfoFormValues = z.infer<typeof onboardingBasicInfoFormSchema>;
export type OnboardingSubjectsFormValues = z.infer<typeof onboardingSubjectsFormSchema>;
