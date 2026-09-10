"use client";

import { Info } from "lucide-react";
import { Alert, Card, Separator } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import LogoutButton from "@/components/auth/LogoutButton";

type SecurityPanelProps = {
  email: string | null;
};

export default function SecurityPanel(_props: SecurityPanelProps) {
  const { isZh } = useAppI18n();

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground">
          {isZh ? "Demo 访问" : "Demo access"}
        </h1>
        <p className="mt-1 text-[0.875rem] text-foreground/60">
          {isZh ? "此展示版本没有账户、密码或邮箱验证。" : "This showcase has no accounts, passwords, or email verification."}
        </p>
      </header>

      <Alert status="accent" className="mb-6">
        <Alert.Indicator>
          <Info className="h-4 w-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>Demo won&apos;t record your email and password</Alert.Description>
        </Alert.Content>
      </Alert>

      <div className="space-y-6">
        <Card>
          <Card.Content className="p-6">
            <h2 className="text-base font-semibold text-foreground">
              {isZh ? "无密码模式" : "Password-free mode"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-foreground/60">
              {isZh
                ? "登录页中的字段只用于演示界面，不会被校验、发送或保存，因此不提供密码重置功能。"
                : "The sign-in fields are only present to illustrate the interface. They are never validated, transmitted, or stored, so password reset is not available."}
            </p>
          </Card.Content>
        </Card>

        <Separator />

        <Card>
          <Card.Content className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {isZh ? "当前演示" : "Current demo"}
                </h2>
                <p className="mt-1 text-sm text-foreground/60">
                  {isZh ? "退出后可随时从登录页重新进入。" : "You can re-enter from the sign-in page at any time."}
                </p>
              </div>
              <LogoutButton />
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
