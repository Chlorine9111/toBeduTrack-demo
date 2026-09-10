import type { AppLocale } from "@/lib/app-i18n/types";

export function mapAuthErrorMessage(message: string, locale: AppLocale = "zh") {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return locale === "en"
      ? "Incorrect email or password. Try again."
      : "邮箱或密码错误，请重新输入。";
  }
  if (normalized.includes("email not confirmed")) {
    return locale === "en"
      ? "Confirm your email before signing in."
      : "请先完成邮箱验证，再继续登录。";
  }
  if (normalized.includes("user already registered")) {
    return locale === "en"
      ? "This email is already registered. Sign in instead."
      : "该邮箱已注册，请直接登录。";
  }
  if (normalized.includes("password should be at least")) {
    return locale === "en"
      ? "Password is too weak. Use a stronger password."
      : "密码强度不足，请使用更强的密码。";
  }
  if (normalized.includes("same password")) {
    return locale === "en"
      ? "Your new password cannot match the current password."
      : "新密码不能与当前密码相同。";
  }
  if (normalized.includes("security purposes")) {
    return locale === "en"
      ? "Too many requests. Try again later."
      : "请求过于频繁，请稍后再试。";
  }
  if (normalized.includes("captcha verification process failed")) {
    return locale === "en"
      ? "CAPTCHA verification failed. Complete the verification and try again. If you're in a local environment, make sure NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured."
      : "CAPTCHA 校验失败，请完成人机验证后重试；如果是本地环境，请确认已配置 NEXT_PUBLIC_TURNSTILE_SITE_KEY。";
  }
  if (normalized.includes("otp") || normalized.includes("token")) {
    return locale === "en"
      ? "The verification link has expired or was already used. Start again."
      : "验证链接已失效或已被使用，请重新发起操作。";
  }

  if (message) {
    return message;
  }
  return locale === "en" ? "Authentication failed. Try again later." : "认证操作失败，请稍后重试。";
}
